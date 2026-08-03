import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { checkCommitMessage, extractNextTrailer, isExempt } from '../lib/commitContract';
import { EVENT_OPS, filterEvents, loadEvents, type EventOp, type TaskEvent } from '../lib/eventLog';
import * as git from '../lib/git';
import { clauseStandings, parseSpecDoc } from '../lib/specDoc';
import { loadManifest } from '../lib/systems';
import { fixNowQueue } from '../lib/taskStore';
import type { Flags } from './cli';
import { readStore, recordEvents, resolveActiveSpec, resolveConfig, specFile, splitList, validateContentFields, type EventSubject } from './context';
import { printRow, truncateLine } from './render';

const COMMIT_SEP = '\x1e';
const FIELD_SEP = '\x1f';

interface FoundTrailer {
  trailer: string;
  sha: string;
  distance: number;
}

type BranchCommitRange =
  | { kind: 'range'; range: string; count: number }
  | { kind: 'empty'; range: null; count: 0 }
  | { kind: 'unknown'; range: null; count: 0 };

// The branch's own commits, or null when that range can't be built or is
// empty — the latter being the base branch itself, where "this branch's
// work" is the whole history and the unscoped walk is the right one.
function branchCommitRange(baseBranch: string): BranchCommitRange {
  const mergeBase = git.mergeBase(baseBranch);
  if (mergeBase === null) return { kind: 'unknown', range: null, count: 0 };
  const count = git.commitCount(`${mergeBase}..HEAD`);
  if (count === null) return { kind: 'unknown', range: null, count: 0 };
  return count === 0 ? { kind: 'empty', range: null, count } : { kind: 'range', range: `${mergeBase}..HEAD`, count };
}

// Only the last commit's Next: is meant to be live, but a mechanical or
// fixup commit can carry none at all — walk back to the most recent commit
// that actually has one.
//
// Stopping at the merge-base is the difference between "nothing to resume
// yet" and a confident pointer at another branch's plan. The commit cap
// stays as a bound on the scan, not on the reach. A git failure is its own
// answer — 'error' — so the caller never reports a bounded scan it did not
// perform.
const DEFAULT_HANDOFF_SCAN_CAP = 20;

function findLatestNextTrailer(range: string | null, maxCommits: number): FoundTrailer | 'error' | null {
  let log: string;
  try {
    log = execFileSync('git', ['log', `-${maxCommits}`, `--format=%H${FIELD_SEP}%B${COMMIT_SEP}`, ...(range === null ? [] : [range])], { encoding: 'utf8' });
  } catch {
    return 'error';
  }
  const commits = log.split(COMMIT_SEP).filter((entry) => entry.trim().length > 0);
  for (let distance = 0; distance < commits.length; distance++) {
    const sepIndex = commits[distance].indexOf(FIELD_SEP);
    const sha = commits[distance].slice(0, sepIndex).trim();
    const message = commits[distance].slice(sepIndex + 1);
    const trailer = extractNextTrailer(message);
    if (trailer !== null) return { trailer, sha, distance };
  }
  return null;
}

// Fixed header (branch, trailer, spec, proof clauses) plus 2 lines per
// queue member — 8 keeps the whole handoff comfortably under a 40-line
// budget even at a full clause list.
const HANDOFF_QUEUE_CAP = 8;

// The first command of a cold session.
export function cmdHandoff(args: Flags, usage: string): void {
  const scanCap = args.flags['scan-cap'] === undefined ? DEFAULT_HANDOFF_SCAN_CAP : Number(args.flags['scan-cap']);
  // `git log -<n>` takes this straight, so a non-number reaches git as NaN
  // and a negative one reaches it as a flag: both make the walk silently
  // scan something other than what was asked for.
  if (!Number.isInteger(scanCap) || scanCap < 1) {
    console.error(`error: --scan-cap must be a whole number of commits, at least 1: ${args.flags['scan-cap']}`);
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const config = resolveConfig(args.flags);
  console.log(`branch: ${config.branch}`);

  const baseBranch = args.flags['base-branch'] ?? 'main';
  const branchRange = branchCommitRange(baseBranch);
  const found = branchRange.kind === 'range' ? findLatestNextTrailer(branchRange.range, scanCap) : null;
  if (branchRange.kind === 'unknown') {
    console.log(`(could not find the branch point for ${baseBranch}; Next trailer scan skipped)`);
  } else if (found === 'error') {
    console.log('(git log failed; Next: trailer scan skipped)');
  } else if (found === null) {
    console.log(branchRange.kind === 'empty' ? `(no Next: trailer yet on this branch — nothing recorded since it left ${baseBranch})` : branchRange.count > scanCap ? `(no Next: trailer found in the last ${scanCap} branch commits)` : `(no Next: trailer yet on this branch; no Next: trailer found in ${branchRange.count} branch commit${branchRange.count === 1 ? '' : 's'} since it left ${baseBranch})`);
  } else {
    if (found.distance > 0) console.log(`(from ${found.sha.slice(0, 7)}, ${found.distance} commit${found.distance === 1 ? '' : 's'} back)`);
    console.log(found.trailer);
  }
  console.log('');

  const tasks = readStore(config);
  const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
  if (activeSpec.note) console.log(activeSpec.note);
  const spec = activeSpec.spec;
  if (spec === null) {
    console.log(`spec: none — no ${specFile(config, config.branch)}, and no --spec given`);
    return;
  }
  const path_ = specFile(config, spec);
  console.log(`spec: ${spec} (${path_})`);
  if (!existsSync(path_)) {
    console.log(`spec file missing: ${path_}`);
    return;
  }
  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  console.log('');
  // The proof clauses, not the whole ## Deliverable section: the section's
  // prose never changes between runs, and what a cold session needs from
  // it — what the branch still owes — is exactly what the clauses are.
  const standings = clauseStandings(doc.proofClauses, doc.auditPasses[doc.auditPasses.length - 1]?.verdicts);
  for (const standing of standings) console.log(`  ${standing.clause}. [${standing.status}] ${truncateLine(doc.proofClauses.find((clause) => clause.id === standing.clause)!.text)}`);
  console.log('');

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const inProgress = tasks.filter((task) => task.spec === spec && task.state === 'in-progress');
  if (inProgress.length > 0) {
    console.log(`${inProgress.length} in-progress task(s):`);
    for (const task of inProgress.slice(0, HANDOFF_QUEUE_CAP)) printRow(task, byId, { indent: '- ' });
    if (inProgress.length > HANDOFF_QUEUE_CAP) console.log(`… ${inProgress.length - HANDOFF_QUEUE_CAP} more in progress`);
    console.log('');
  }

  const queue = fixNowQueue(tasks, spec);
  console.log(`${queue.length} open fix-now task(s):`);
  const shown = queue.slice(0, HANDOFF_QUEUE_CAP);
  for (const task of shown) printRow(task, byId, { indent: '- ', withFiles: true });
  // fixNowQueue is already severity-ordered, so truncating here drops the
  // least urgent — the queue can otherwise print 2 lines per member and
  // blow the line budget as the store grows.
  if (queue.length > shown.length) {
    console.log(`… ${queue.length - shown.length} more, see \`tasks list --spec ${spec}\``);
  }
}

// The two writes that touch no task state. A decision is its own op rather
// than a note by convention, because "what was decided about this" has to be
// answerable without a text-matching heuristic.
export function recordStandaloneEvent(op: 'note' | 'decision') {
  return (args: Flags, usage: string): void => {
    const config = resolveConfig(args.flags);
    const note = args.positional[0];
    if (!note) {
      console.error(usage);
      process.exitCode = 1;
      return;
    }
    // The one refusal, and it is malformed input: the whole log depends on
    // one event being one line, and prose in a record is what made `next`
    // cost thirty lines to call.
    if (/[\r\n]/.test(note)) {
      console.error(`error: a ${op} is one line — this one has ${note.split(/\r\n|\r|\n/).length}. Record the summary here and leave the prose in the commit message or the spec`);
      process.exitCode = 1;
      return;
    }
    const validationError = validateContentFields(config, args.flags);
    if (validationError) {
      console.error(validationError);
      process.exitCode = 1;
      return;
    }

    const id = args.flags.id ?? null;
    const tasks = id === null ? [] : readStore(config);
    const task = id === null ? undefined : tasks.find((candidate) => candidate.id === id);
    const subject: EventSubject = {
      id,
      system: args.flags.system ?? task?.system ?? null,
      spec: args.flags.spec ?? task?.spec ?? null,
      note,
    };
    recordEvents(config, op, [subject]);

    console.log(`recorded a ${op} against ${id ?? `${subject.system ?? 'no system'}/${subject.spec ?? 'no spec'}`} in ${config.eventsPath}`);
    // An event about a record that does not exist yet is still a fact
    // somebody asserted, so it is recorded and reported, never refused.
    if (id !== null && task === undefined) console.log(`no record answers to ${id} — the ${op} is recorded against that id anyway, and \`tasks log --id ${id}\` finds it`);
    // The spec file may since have been renamed or deleted, and an event
    // about a spec that no longer exists is exactly what a log is for; a
    // system name is drawn from a manifest that is authoritative right now,
    // which is why validateContentFields refuses that one.
    if (subject.spec !== null && !existsSync(specFile(config, subject.spec))) console.log(`no spec file at ${specFile(config, subject.spec)} — recorded against that slug anyway`);
  };
}

function renderEventLine(event: TaskEvent): string {
  return [`${event.t.slice(0, 19)}Z`, event.op, event.id ?? '(no task)', `${event.system ?? '(no system)'} / ${event.spec ?? '(no spec)'}`, event.by ?? '(unnamed)', event.note].join('  ');
}

// Answered from the log alone: joining to present-day state would rewrite
// history every time a record is re-pointed, which is the whole reason each
// event snapshots its own system and spec.
export function cmdLog(args: Flags): void {
  const config = resolveConfig(args.flags);
  const op = args.flags.op;
  if (op !== undefined && !EVENT_OPS.includes(op as EventOp)) {
    console.error(`error: --op must be one of ${EVENT_OPS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const { events, skipped } = loadEvents(config.eventsPath);
  const filter = { id: args.flags.id, system: args.flags.system, spec: args.flags.spec, op, text: args.positional[0] };
  const matched = filterEvents(events, filter);
  for (const event of matched) console.log(renderEventLine(event));

  const asked = Object.entries(filter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => (key === 'text' ? `"${value as string}"` : `--${key} ${value as string}`));
  // An empty log and a filter that matched nothing are different answers to
  // different questions, and collapsing them tells a caller their query was
  // wrong when the log is simply new.
  if (events.length === 0) console.log(`no events recorded yet in ${config.eventsPath}`);
  else if (matched.length === 0) console.log(`no event matches ${asked.join(' ')} — ${events.length} event(s) in ${config.eventsPath}`);
  else console.log(`${matched.length} of ${events.length} event(s)${asked.length > 0 ? ` matching ${asked.join(' ')}` : ''}`);

  if (skipped.length > 0) {
    console.log(`skipped ${skipped.length} unreadable event line(s) — everything above is the rest of the log:`);
    for (const message of skipped) console.log(`  ${message}`);
  }
}

// Driven by .claude/hooks/commit-msg, which supplies what only git knows:
// whether MERGE_HEAD/REVERT_HEAD exist, and the staged file list.
export function cmdCheckCommitMessage(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const msgFile = args.positional[0];
  if (!msgFile) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const message = readFileSync(msgFile, 'utf8');
  const subject = message.split('\n')[0] ?? '';
  const manifest = loadManifest(config.systemsPath);
  const exempt = isExempt(subject, { isMergeOrRevert: args.flags['merge-or-revert'] === 'true', changedFiles: splitList(args.flags.files) }, manifest);
  if (exempt) return;

  const reason = checkCommitMessage(message);
  if (reason) {
    console.error(`commit-msg: ${reason}`);
    console.error('every commit needs a body saying what was done. Use `tasks handoff` or `tasks next` for resumability; an optional Next: trailer is only a breadcrumb. --no-verify to bypass.');
    process.exitCode = 1;
  }
}
