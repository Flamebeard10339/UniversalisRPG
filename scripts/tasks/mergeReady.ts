import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkBytes, type ByteFinding } from '../lib/bytes';
import * as git from '../lib/git';
import { trackedFiles } from '../lib/sourceFiles';
import { clauseStandings, parseSpecDoc, type SpecDoc } from '../lib/specDoc';
import { unreviewedFiledBy, type Task } from '../lib/taskStore';
import type { Flags } from './cli';
import { DEFAULT_BRANCH, readStore, resolveActiveSpec, resolveConfig, specFile, specsWrittenFromBranch, type Config } from './context';
import { doctorIssues } from './doctor';

// The merge gate, spelled once. Every leg here is already required by CI —
// this command exists because every session hand-crafted the same shell
// line, and a hand-crafted gate drifts. It is a runner, not a new gate.
export interface Leg {
  name: string;
  command: string;
}

export const LEGS: Leg[] = [
  { name: 'tsc', command: 'npx tsc --noEmit' },
  { name: 'npm test', command: 'npm test -- --reporter=dot' },
  { name: 'layer-check', command: 'npm run layer-check' },
  { name: 'audit-status', command: 'npm run audit-status' },
  { name: 'doctor', command: 'npm run tasks -- doctor' },
];

export interface LegResult {
  name: string;
  ok: boolean;
  detail: string;
  // The command that advances this leg. A gate that reports where a branch
  // stands and stops there leaves "loop again or hand back" a judgement, and
  // a session with no machine-readable answer correctly does the safe thing
  // and waits to be told. With every leg naming its next move, "work until
  // merge-ready is green" is an instruction rather than a conversation.
  next?: string;
}

// The command's own output rides back with its status: legs that no longer
// own the terminal while they run still get their say, replayed in order.
export type RunCommand = (command: string) => Promise<{ status: number | null; output: string }>;

// This branch's standing, as facts rather than as commands to go and get:
// the six manual reads across two tools that preparing a merge actually took.
export interface BranchStanding {
  branch: string;
  // Paths git reports as changed, staged or untracked. A merge starts from a
  // clean tree, and this is the one leg whose failure is entirely local.
  dirty: string[];
  // True when the base branch has commits this branch has not merged. This
  // is the one that bites in practice and the one nothing failed on.
  baseMoved: boolean;
  baseBranch: string;
  spec: string | null;
  // How that spec was arrived at. Every route to it but an explicit one is an
  // inference, and a gate that grades a spec without saying which it picked
  // leaves a reader unable to see that it graded the wrong one.
  specNote: string | null;
  // True when the spec is a plan this branch wrote for a later branch rather
  // than a contract this branch owes. See `authoredAsPlan`.
  specAuthoredHere: boolean;
  openMembers: string[];
  unreviewedFindings: number;
  // Clause ids the spec's latest pass leaves outstanding, and whether a pass
  // has been recorded at all — ungraded is not the same as unmet.
  outstandingClauses: string[];
  auditPasses: number;
  // How many issues `doctor` reported. Carried into the summary without
  // changing what fails: the count reached the summary line, the leg's
  // verdict did not move.
  doctorWarnings: number;
}

export interface MergeReadyDeps {
  run: RunCommand;
  trackedFiles: () => string[];
  read: (file: string) => Uint8Array | null;
  emit: (line: string) => void;
  standing: () => BranchStanding;
}

// The questions a merge actually turns on, answered from the standing rather
// than from six reads across two tools. Only `baseMoved` and a red spec fail
// the run: a dirty tree during a merge-prep session is normal, and it is
// reported so that the store changes get committed rather than discarded.
function standingLegs(standing: BranchStanding): LegResult[] {
  const legs: LegResult[] = [];

  legs.push({
    name: 'tree',
    ok: standing.dirty.length === 0,
    detail: standing.dirty.length === 0 ? 'pass — nothing uncommitted' : `${standing.dirty.length} uncommitted path(s): ${standing.dirty.slice(0, 5).join(', ')}${standing.dirty.length > 5 ? `, and ${standing.dirty.length - 5} more` : ''}`,
    next: standing.dirty.length === 0 ? undefined : 'commit them — a cleanup or reset discards a close that lives only in the working tree',
  });

  legs.push({
    name: 'base',
    ok: !standing.baseMoved,
    detail: standing.baseMoved ? `${standing.baseBranch} has moved past the merge base` : `pass — ${standing.baseBranch} has not moved past the merge base`,
    next: standing.baseMoved ? `git merge ${standing.baseBranch}` : undefined,
  });

  if (standing.spec === null) {
    legs.push({ name: 'spec', ok: true, detail: 'pass — this branch is working no spec, so it owes no clause' });
    return legs;
  }

  // Which spec was graded, on its own line rather than folded into a verdict:
  // it is the one fact that makes every leg below it readable, and the only
  // way a reader can see the gate grading a spec they did not mean.
  if (standing.specNote !== null) legs.push({ name: 'spec source', ok: true, detail: standing.specNote });

  if (standing.specAuthoredHere) {
    legs.push({ name: 'spec', ok: true, detail: `pass — this branch wrote ${standing.spec} as a plan for a later branch and worked none of its ${standing.openMembers.length} member(s), so it owes neither them nor a clause. No other spec was graded` });
    return legs;
  }

  const specOk = standing.openMembers.length === 0 && standing.unreviewedFindings === 0;
  legs.push({
    name: 'spec',
    ok: specOk,
    detail: specOk
      ? `pass — every member of ${standing.spec} is closed`
      : [standing.openMembers.length > 0 ? `${standing.openMembers.length} open member(s): ${standing.openMembers.join(', ')}` : null, standing.unreviewedFindings > 0 ? `${standing.unreviewedFindings} unreviewed finding(s)` : null].filter(Boolean).join('; '),
    next: specOk ? `npm run tasks -- spec done ${standing.spec}` : standing.openMembers.length > 0 ? 'npm run tasks -- next' : 'npm run tasks -- triage',
  });

  const clausesOk = standing.auditPasses > 0 && standing.outstandingClauses.length === 0;
  legs.push({
    name: 'clauses',
    ok: clausesOk,
    detail: standing.auditPasses === 0 ? `${standing.spec} has no recorded audit pass` : clausesOk ? `pass — the latest of ${standing.auditPasses} pass(es) leaves no clause outstanding` : `${standing.outstandingClauses.length} outstanding after pass ${standing.auditPasses}: ${standing.outstandingClauses.join(', ')}`,
    next: clausesOk ? undefined : standing.auditPasses === 0 ? `commission an auditor: npm run tasks -- audit-prompt ${standing.spec}` : 'npm run tasks -- next',
  });

  return legs;
}

// The decision: run every leg even after one fails — a merge-readiness
// answer that stops at the first red leg costs a rerun per defect — and
// report one line each. Returns false when any leg is red.
//
// The legs are independent processes over shared read-only state, so all of
// them are started before any is awaited: concurrency changes nothing a
// caller can observe except the clock, because every result is collected
// before the first line is emitted and reported in declaration order.
export async function runMergeReady(deps: MergeReadyDeps): Promise<boolean> {
  const launched = LEGS.map((leg) => deps.run(leg.command));
  const standing = deps.standing();
  const outcomes = await Promise.all(launched);

  // Each leg's own output, in declaration order, before any verdict row —
  // the doctor leg's warnings are "reported above" because of this.
  for (const outcome of outcomes) {
    if (outcome.output.trim() === '') continue;
    for (const line of outcome.output.replace(/\n+$/, '').split('\n')) deps.emit(line);
  }

  const results: LegResult[] = LEGS.map((leg, index) => {
    const { status } = outcomes[index];
    const ok = status === 0;
    // The doctor leg's count reaches the summary without changing what
    // fails. Five warnings — four closes that existed only in the working
    // tree, and an uncommitted store — once scrolled past above a line
    // reading "every leg passed", and were caught by rereading scrollback
    // for an unrelated reason.
    const warnings = leg.name === 'doctor' && standing.doctorWarnings > 0 ? ` — ${standing.doctorWarnings} warning(s) reported above, which do not fail this leg` : '';
    return { name: leg.name, ok, detail: `${ok ? 'pass' : `exit=${status ?? 'null'}`}${warnings}`, next: ok ? undefined : leg.command };
  });

  let byteFindings: ByteFinding[];
  try {
    byteFindings = checkBytes(deps.trackedFiles(), deps.read);
  } catch (error) {
    byteFindings = [{ file: '(byte check)', issue: error instanceof Error ? error.message : String(error) }];
  }
  results.push({ name: 'bytes', ok: byteFindings.length === 0, detail: byteFindings.length === 0 ? 'pass — every tracked text file is valid UTF-8 with no NUL bytes' : `${byteFindings.length} corrupted file(s)` });

  results.push(...standingLegs(standing));

  for (const result of results) deps.emit(`  ${result.name.padEnd(14)} ${result.ok ? 'ok' : 'FAIL'}  ${result.detail}`);
  for (const finding of byteFindings) deps.emit(`    ${finding.file}: ${finding.issue}`);

  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    const doctorNote = standing.doctorWarnings > 0 ? `, with ${standing.doctorWarnings} doctor warning(s) that fail nothing` : '';
    deps.emit(`merge-ready: every leg passed${doctorNote}`);
    const closeSpec = results.find((result) => result.name === 'spec')?.next;
    if (closeSpec) deps.emit(`  next: ${closeSpec}`);
    deps.emit(`  then merge ${standing.branch} into ${standing.baseBranch} — the merge body is the one artifact whoever did the work has to write`);
    return true;
  }

  deps.emit(`NOT merge-ready: ${failed.map((result) => result.name).join(', ')} failed`);
  for (const result of failed) {
    if (result.next) deps.emit(`  ${result.name.padEnd(14)} ${result.next}`);
  }
  return false;
}

// A planning branch's output is a spec for a later branch, and the gate read
// that spec as a debt: three members open because nobody had implemented them
// and no audit pass because there was nothing yet to audit, both true and
// neither a defect. Told apart from a contract by two facts nobody has to
// declare — the file is absent from the base branch, so this branch wrote it,
// and every member is still open, so nothing here was ever worked against it.
// A spec authored and never decomposed is not a plan: nothing was promised to
// a later branch until the work was named.
//
// `onBaseBranch` is null when git could not be asked — an unresolvable base
// ref, no repository — and that reads as "not shown to be a plan" rather than
// as "this branch wrote it". A gate whose exemption widens when its evidence
// disappears is the wrong way round.
export function authoredAsPlan(members: Task[], onBaseBranch: boolean | null): boolean {
  return onBaseBranch === false && members.length > 0 && members.every((member) => member.state === 'open');
}

export interface SpecCandidate {
  spec: string;
  authoredAsPlan: boolean;
}

// `resolveActiveSpec` answers "what am I working on" — a resume aid whose log
// route takes the most recently written spec. Planning happens last, so a
// branch that implemented one spec and then authored a plan for a later
// branch resolves to the plan, and a plan owes nothing. A gate asks a
// different question, and must not read "this plan owes nothing" as "this
// branch owes nothing": a spec the branch owes outranks one it merely wrote,
// however recently. Candidates arrive most recent first, so an ordinary
// branch — one spec, not a plan — is unaffected, and a branch whose every
// candidate is a plan still passes as the planning branch it is.
export function specToGrade(candidates: SpecCandidate[]): SpecCandidate | null {
  return candidates.find((candidate) => !candidate.authoredAsPlan) ?? candidates[0] ?? null;
}

export interface SpecFacts {
  // What `resolveActiveSpec` answered, and how it says it got there.
  activeSpec: string | null;
  activeNote: string | null;
  // Every spec this branch has written store records against, most recent
  // first.
  written: string[];
  isPlan: (spec: string) => boolean;
}

export type SpecDecision = Pick<BranchStanding, 'spec' | 'specNote' | 'specAuthoredHere'>;

// The whole spec decision, with the git and store reads passed in as data.
// It lives here rather than inline in `branchStanding` because that function
// cannot be called without a repository, and a decision nothing can call is a
// decision nothing checks: inverting this flag's polarity once left the file
// green and `tsc` clean.
export function decideSpec(facts: SpecFacts): SpecDecision {
  const ordered = facts.activeSpec === null ? [] : [facts.activeSpec, ...facts.written.filter((spec) => spec !== facts.activeSpec)];
  const graded = specToGrade(ordered.map((spec) => ({ spec, authoredAsPlan: facts.isPlan(spec) })));
  if (graded === null) return { spec: null, specNote: null, specAuthoredHere: false };
  return {
    spec: graded.spec,
    specNote: graded.spec === facts.activeSpec ? facts.activeNote : `spec chosen by the gate: ${graded.spec} — ${facts.activeSpec} is a plan this branch wrote, and ${graded.spec} is a spec it owes`,
    specAuthoredHere: graded.authoredAsPlan,
  };
}

// The reads a session was making by hand — `git status`, `git rev-parse`
// plus `git merge-base`, `tasks spec show` twice — collected once so the
// answer is a leg rather than a research task.
function branchStanding(config: Config, baseBranch: string): BranchStanding {
  const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const dirty = (status.stdout ?? '')
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter((line) => line.length > 0);

  const base = git.mergeBase(baseBranch);
  const baseHead = git.resolveCommit(baseBranch);
  const tasks = readStore(config);
  const active = resolveActiveSpec(config, tasks, undefined);
  const membersOf = (spec: string): Task[] => tasks.filter((task) => task.spec === spec);

  const decision = decideSpec({
    activeSpec: active.spec,
    activeNote: active.note,
    written: specsWrittenFromBranch(config),
    // Null when git cannot be asked at all, so `authoredAsPlan` can tell "the
    // base branch does not have this file" from "there was no answer".
    isPlan: (spec) => authoredAsPlan(membersOf(spec), baseHead === null ? null : git.fileAt(baseBranch, specFile(config, spec)) !== null),
  });
  const spec = decision.spec;

  const doc = spec === null ? null : readSpecDoc(config, spec);
  const latest = doc?.auditPasses[doc.auditPasses.length - 1];
  const members = spec === null ? [] : membersOf(spec);

  return {
    branch: config.branch,
    dirty,
    // Unknown resolves to "has not moved": a gate that failed because git
    // could not answer would be a gate nobody could get green.
    baseMoved: base !== null && baseHead !== null && base !== baseHead,
    baseBranch,
    ...decision,
    openMembers: members.filter((task) => task.state !== 'done' && task.state !== 'declined').map((task) => task.id),
    unreviewedFindings: spec === null ? 0 : unreviewedFiledBy(tasks, spec).length,
    outstandingClauses: doc === null ? [] : clauseStandings(doc.proofClauses, latest?.verdicts).filter((standing) => standing.status !== 'met').map((standing) => `c${standing.clause}`),
    auditPasses: doc?.auditPasses.length ?? 0,
    doctorWarnings: doctorIssues(config, tasks).length,
  };
}

function readSpecDoc(config: Config, spec: string): SpecDoc | null {
  try {
    return parseSpecDoc(readFileSync(specFile(config, spec), 'utf8'));
  } catch {
    return null;
  }
}

export async function cmdMergeReady(args: Flags): Promise<void> {
  const config = resolveConfig(args.flags);
  const baseBranch = args.flags['base-branch'] ?? DEFAULT_BRANCH;
  console.log('running the merge gate — the same legs CI runs, together (a couple of minutes):');
  const ok = await runMergeReady({
    standing: () => branchStanding(config, baseBranch),
    // shell: npm and npx are .cmd shims on Windows, unreachable without one.
    // Output is captured rather than inherited: five legs share one terminal
    // now, and each gets it back whole, in order, when all have finished.
    run: (command) =>
      new Promise((resolve) => {
        const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk;
        });
        child.stderr.on('data', (chunk: Buffer) => {
          output += chunk;
        });
        child.on('error', (error) => resolve({ status: null, output: `${output}${error.message}\n` }));
        child.on('close', (status) => resolve({ status, output }));
      }),
    trackedFiles,
    read: (file) => {
      try {
        return readFileSync(file);
      } catch {
        return null;
      }
    },
    emit: (line) => console.log(line),
  });
  if (!ok) process.exitCode = 1;
}
