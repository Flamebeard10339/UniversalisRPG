import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkBytes, type ByteFinding } from '../lib/bytes';
import * as git from '../lib/git';
import { trackedFiles } from '../lib/sourceFiles';
import { clauseStandings, parseSpecDoc, type SpecDoc } from '../lib/specDoc';
import { clausesOf, parseStoreTolerantly, type Task } from '../lib/taskStore';
import type { Flags } from './cli';
import { DEFAULT_BRANCH, readStore, resolveConfig, specFile, type Config } from './context';
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

// One declared spec's own standing: everything below is scoped to the
// members *this branch's own store diff* added or changed for this spec,
// never to every member the spec has ever had. A branch holding one member
// of a multi-member spec is graded on that member alone — the other
// members, and the clauses only they discharge, are not this branch's to
// answer for.
export interface SpecStanding {
  spec: string;
  openMembers: string[];
  unreviewedFindings: number;
  // How many clauses this branch's own members discharge. Zero is not an
  // error — a branch can declare a spec by filing a finding against it
  // without discharging anything — and it is what makes the clauses leg
  // read as "nothing owed" rather than blocked on a clause some other
  // member answers for.
  clausesOwed: number;
  // Clause ids the spec's standing leaves outstanding, among the ones this
  // branch's own members discharge, and whether a pass has been recorded at
  // all — ungraded is not the same as unmet.
  outstandingClauses: string[];
  // Clause ids the standing reads deferred — off `outstandingClauses`
  // because they stop blocking the clauses leg, and named here so a branch
  // that deferred its way to green says so in the same line that says green.
  deferredClauses: string[];
  // Clause ids that are unmet but settled: every undelivered record they
  // have is closed and at least one was declined rather than done. Off
  // `outstandingClauses` for the same reason `deferredClauses` is — a
  // declined clause has no action left that would ever turn it met, and a
  // leg that stays red forever is not a gate.
  declinedClauses: string[];
  auditPasses: number;
}

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
  // False when the store diff against `baseBranch` could not be read at
  // all — no merge base, or `docs/tasks.jsonl` unreadable there. `specs` is
  // empty in that case too, but the two must not be read alike: empty means
  // "this branch declared nothing", unreadable means "nobody can say".
  diffReadable: boolean;
  // Every spec some record in this branch's own store diff names — a set,
  // because a branch may declare more than one, and every one of them is
  // graded rather than one chosen among them.
  specs: SpecStanding[];
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

// One declared spec's own two legs: what this branch's own members of it
// still owe, and which of the clauses those members discharge still stand
// outstanding. Both are named with the spec's slug, because there can be more
// than one pair of these on one run.
function specLegs(standing: SpecStanding): LegResult[] {
  const specOk = standing.openMembers.length === 0 && standing.unreviewedFindings === 0;
  const spec: LegResult = {
    name: `spec ${standing.spec}`,
    ok: specOk,
    detail: specOk
      ? `pass — every member of ${standing.spec} this branch declared is closed`
      : [standing.openMembers.length > 0 ? `${standing.openMembers.length} open member(s): ${standing.openMembers.join(', ')}` : null, standing.unreviewedFindings > 0 ? `${standing.unreviewedFindings} unreviewed finding(s)` : null].filter(Boolean).join('; '),
    next: specOk ? `npm run tasks -- spec done ${standing.spec}` : standing.openMembers.length > 0 ? `npm run tasks -- next --spec ${standing.spec}` : `npm run tasks -- triage --spec ${standing.spec}`,
  };

  if (standing.clausesOwed === 0) {
    return [spec, { name: `clauses ${standing.spec}`, ok: true, detail: `pass — no member of ${standing.spec} this branch declared discharges a clause` }];
  }

  const clausesOk = standing.auditPasses > 0 && standing.outstandingClauses.length === 0;
  const deferredNote = standing.deferredClauses.length > 0 ? `; deferred: ${standing.deferredClauses.join(', ')}` : '';
  const declinedNote = standing.declinedClauses.length > 0 ? `; declined: ${standing.declinedClauses.join(', ')}` : '';
  const clauses: LegResult = {
    name: `clauses ${standing.spec}`,
    ok: clausesOk,
    detail:
      standing.auditPasses === 0
        ? `${standing.spec} has no recorded audit pass`
        : clausesOk
          ? `pass — ${standing.auditPasses} pass(es) recorded, no clause outstanding${deferredNote}${declinedNote}`
          : `${standing.outstandingClauses.length} outstanding across ${standing.auditPasses} pass(es): ${standing.outstandingClauses.join(', ')}${deferredNote}${declinedNote}`,
    next: clausesOk ? undefined : standing.auditPasses === 0 ? `commission an auditor: npm run tasks -- audit-prompt ${standing.spec}` : `npm run tasks -- next --spec ${standing.spec}`,
  };

  return [spec, clauses];
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

  // Unreadable is never read as "declares nothing": that would be exactly
  // the guess c9 forbids, on the one axis this gate exists to answer. It
  // fails loudly instead, with nothing to run — there is no single command
  // that repairs an unresolvable merge base or an unreadable store snapshot.
  if (!standing.diffReadable) {
    legs.push({ name: 'spec', ok: false, detail: `this branch's store diff against ${standing.baseBranch} could not be read — declared specs cannot be determined` });
    return legs;
  }

  if (standing.specs.length === 0) {
    legs.push({ name: 'spec', ok: true, detail: "pass — this branch's store diff declares no spec, so it owes no clause" });
    return legs;
  }

  for (const spec of standing.specs) legs.push(...specLegs(spec));

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
    // One `next` per declared spec — a branch that declared two closes both,
    // and c10 is what forbids collapsing this to the first.
    for (const result of results) if (result.name.startsWith('spec ') && result.next) deps.emit(`  next: ${result.next}`);
    deps.emit(`  then merge ${standing.branch} into ${standing.baseBranch} — the merge body is the one artifact whoever did the work has to write`);
    return true;
  }

  deps.emit(`NOT merge-ready: ${failed.map((result) => result.name).join(', ')} failed`);
  for (const result of failed) {
    if (result.next) deps.emit(`  ${result.name.padEnd(14)} ${result.next}`);
  }
  return false;
}

// A stable, key-order-independent serialization: the store is rewritten
// wholesale on every save, so two copies of the same task can differ in key
// order without differing in any field, and comparing raw JSON text would
// read that as a change nobody made.
function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val === null || typeof val !== 'object' || Array.isArray(val)) return val;
    const record = val as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = record[key];
        return acc;
      }, {});
  });
}

// The store the merge base held, read through git rather than the working
// tree — a dirty checkout must not inflate the diff with edits nobody
// committed. Null when the merge base is unknown or the file could not be
// read there at all: both cases mean the diff cannot be trusted, and
// `storeDiff` reads them the same way rather than treating "could not read"
// as "there was nothing there".
function baseStoreTasks(config: Config, base: string | null): Task[] | null {
  if (base === null) return null;
  const text = git.fileAt(base, config.storePath);
  if (text === null) return null;
  try {
    return parseStoreTolerantly(text, `${config.storePath}@${base}`).tasks;
  } catch {
    return null;
  }
}

// The records this branch's own diff added or changed, matched by id and
// compared field for field: every `start`/`stop`/`done` writes the record
// itself, so a record here is exactly the signal the deleted event-log route
// was reading, and a plain `edit` or a filed finding is declared work the
// event log could never see at all.
export function changedRecords(base: Task[], current: Task[]): Task[] {
  const baseById = new Map(base.map((task) => [task.id, task]));
  return current.filter((task) => {
    const before = baseById.get(task.id);
    return before === undefined || sortedJson(before) !== sortedJson(task);
  });
}

export interface StoreDiff {
  // False when the diff could not be computed at all — no merge base, or
  // `docs/tasks.jsonl` unreadable there. `changed` is empty in that case
  // too, and a caller must not read the two alike.
  readable: boolean;
  changed: Task[];
}

export function storeDiff(config: Config, base: string | null, current: Task[]): StoreDiff {
  const before = baseStoreTasks(config, base);
  if (before === null) return { readable: false, changed: [] };
  return { readable: true, changed: changedRecords(before, current) };
}

// The set this branch declared: every spec some record in its own store
// diff names, whatever state that record is in. A spec a branch merely wrote
// the markdown for — no task record ever pointed at it — never enters this
// set, which is what replaces "authored as a plan" without a special case
// for it: nothing was declared, so nothing is graded.
export function declaredSpecs(changed: Task[]): string[] {
  return [...new Set(changed.map((task) => task.spec).filter((spec): spec is string => spec !== null))].sort();
}

// One declared spec's standing, scoped to this branch's own members of it —
// the records its own diff changed that name this spec — never to every
// member the spec has ever had. `tasks` is the live store, used only for
// `settledByDecline`'s lookup of every undelivered record for a clause,
// including ones this branch's diff did not itself touch: an earlier
// decline is still what settles a clause, whichever branch recorded it.
function specStanding(config: Config, tasks: Task[], changed: Task[], spec: string): SpecStanding {
  const ownMembers = changed.filter((task) => task.spec === spec);
  // Findings stay `spec: null` until triage promotes them, so "declared
  // against this spec" for one is its audit provenance, not its own field —
  // the same distinction `unreviewedFiledBy` draws, scoped here to this
  // branch's own diff instead of the whole store.
  const ownUnreviewed = changed.filter((task) => task.state === 'unreviewed' && task.source?.spec === spec);

  const doc = readSpecDoc(config, spec);
  const standings = doc === null ? [] : clauseStandings(doc.proofClauses, doc.auditPasses);
  const ownClauseIds = new Set(ownMembers.flatMap((task) => clausesOf(task)));
  // Every clause an own member discharges gets a verdict, even one the
  // spec's own text no longer carries — filtering `standings` down to
  // `ownClauseIds` would instead let a stale or corrupted clause id drop out
  // of the standing silently, reading as nothing owed rather than unknown.
  const ownStandings = [...ownClauseIds].map((id) => standings.find((standing) => standing.clause === id) ?? { clause: id, status: 'unknown' as const, evidence: null });

  // Declining an undelivered task abandons its clause rather than
  // discharging it, in the tool's own words — but a verdict no future audit
  // pass will ever revisit must not leave this leg red with no action left
  // to clear it. Settled only when every undelivered record this clause has
  // is closed and at least one of them was a decline: a live open or
  // in-progress record for the same clause is a recurrence and still owed.
  const settledByDecline = (clause: number): boolean => {
    const records = tasks.filter((task) => task.kind === 'undelivered' && task.spec === spec && task.clause === clause);
    return records.length > 0 && records.every((task) => task.state !== 'open' && task.state !== 'in-progress') && records.some((task) => task.state === 'declined');
  };
  const outstanding = ownStandings.filter((standing) => standing.status !== 'met' && standing.status !== 'deferred');

  return {
    spec,
    openMembers: ownMembers.filter((task) => task.state !== 'done' && task.state !== 'declined').map((task) => task.id),
    unreviewedFindings: ownUnreviewed.length,
    clausesOwed: ownClauseIds.size,
    outstandingClauses: outstanding.filter((standing) => !settledByDecline(standing.clause)).map((standing) => `c${standing.clause}`),
    deferredClauses: ownStandings.filter((standing) => standing.status === 'deferred').map((standing) => `c${standing.clause}`),
    declinedClauses: outstanding.filter((standing) => settledByDecline(standing.clause)).map((standing) => `c${standing.clause}`),
    auditPasses: doc?.auditPasses.length ?? 0,
  };
}

// The reads a session was making by hand — `git status`, `git rev-parse`
// plus `git merge-base`, `tasks spec show` twice — collected once so the
// answer is a leg rather than a research task.
export function branchStanding(config: Config, baseBranch: string): BranchStanding {
  const dirty = git.dirtyPaths() ?? [];

  const base = git.mergeBase(baseBranch);
  const baseHead = git.resolveCommit(baseBranch);
  const tasks = readStore(config);
  const diff = storeDiff(config, base, tasks);

  return {
    branch: config.branch,
    dirty,
    // Unknown resolves to "has not moved": a gate that failed because git
    // could not answer would be a gate nobody could get green.
    baseMoved: base !== null && baseHead !== null && base !== baseHead,
    baseBranch,
    diffReadable: diff.readable,
    specs: diff.readable ? declaredSpecs(diff.changed).map((spec) => specStanding(config, tasks, diff.changed, spec)) : [],
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
    // Decoded once over the concatenated bytes, not per chunk: a multibyte
    // character split across a pipe-chunk boundary would otherwise replay
    // as U+FFFD.
    run: (command) =>
      new Promise((resolve) => {
        const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const chunks: Buffer[] = [];
        child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
        const output = (): string => Buffer.concat(chunks).toString('utf8');
        child.on('error', (error) => resolve({ status: null, output: `${output()}${error.message}\n` }));
        child.on('close', (status) => resolve({ status, output: output() }));
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
