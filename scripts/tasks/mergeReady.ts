import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkBytes, type ByteFinding } from '../lib/bytes';
import * as git from '../lib/git';
import { trackedFiles } from '../lib/sourceFiles';
import { clauseStandings, parseSpecDoc, type SpecDoc } from '../lib/specDoc';
import { unreviewedFiledBy, type Task } from '../lib/taskStore';
import type { Flags } from './cli';
import { DEFAULT_BRANCH, readStore, resolveActiveSpec, resolveConfig, specFile, type Config } from './context';
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

export type RunCommand = (command: string) => { status: number | null };

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

  if (standing.specAuthoredHere) {
    legs.push({ name: 'spec', ok: true, detail: `pass — this branch wrote ${standing.spec} as a plan for a later branch and worked none of its ${standing.openMembers.length} member(s), so it owes neither them nor a clause` });
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
export function runMergeReady(deps: MergeReadyDeps): boolean {
  const standing = deps.standing();
  const results: LegResult[] = [];

  for (const leg of LEGS) {
    const { status } = deps.run(leg.command);
    const ok = status === 0;
    // The doctor leg's count reaches the summary without changing what
    // fails. Five warnings — four closes that existed only in the working
    // tree, and an uncommitted store — once scrolled past above a line
    // reading "every leg passed", and were caught by rereading scrollback
    // for an unrelated reason.
    const warnings = leg.name === 'doctor' && standing.doctorWarnings > 0 ? ` — ${standing.doctorWarnings} warning(s) reported above, which do not fail this leg` : '';
    results.push({ name: leg.name, ok, detail: `${ok ? 'pass' : `exit=${status ?? 'null'}`}${warnings}`, next: ok ? undefined : leg.command });
  }

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
export function authoredAsPlan(members: Task[], onBaseBranch: boolean): boolean {
  return !onBaseBranch && members.length > 0 && members.every((member) => member.state === 'open');
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
  const spec = active.spec;

  const doc = spec === null ? null : readSpecDoc(config, spec);
  const latest = doc?.auditPasses[doc.auditPasses.length - 1];
  const members = spec === null ? [] : tasks.filter((task) => task.spec === spec);

  return {
    branch: config.branch,
    dirty,
    // Unknown resolves to "has not moved": a gate that failed because git
    // could not answer would be a gate nobody could get green.
    baseMoved: base !== null && baseHead !== null && base !== baseHead,
    baseBranch,
    spec,
    specAuthoredHere: spec !== null && authoredAsPlan(members, git.fileAt(baseBranch, specFile(config, spec)) !== null),
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

export function cmdMergeReady(args: Flags): void {
  const config = resolveConfig(args.flags);
  const baseBranch = args.flags['base-branch'] ?? DEFAULT_BRANCH;
  console.log('running the merge gate — the same legs CI runs, in order (several minutes):');
  const ok = runMergeReady({
    standing: () => branchStanding(config, baseBranch),
    // shell: npm and npx are .cmd shims on Windows, unreachable without one.
    run: (command) => spawnSync(command, { shell: true, stdio: ['ignore', 'inherit', 'inherit'] }),
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
