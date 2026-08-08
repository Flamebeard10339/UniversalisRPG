import { existsSync } from 'node:fs';
import * as git from '../lib/git';
import { checkStore, coldClaimIssues, loadStoreTolerantly, misfiledSystem, type CheckIssue, type Task } from '../lib/taskStore';
import type { Flags } from './cli';
import {
  closedCommitIssues,
  CLOSING_STATES,
  dirtyStoreIssue,
  pathOwner,
  recordEvents,
  resolveConfig,
  saveStoreAndWarn,
  specFile,
  specIssues,
  subjectOf,
  systemNames,
  today,
  workingTreeOnlyIssues,
  type Config,
} from './context';

// The one repair with exactly one correct answer. A record outside a
// closing state is not closed, so a close date on it describes a close that
// was undone, and clearing it is not a choice between defensible fixes.
// Everything else this scan finds has several — a missing decline reason, an
// unresolved requirement, a cycle, a duplicate id — and a doctor that picks
// one of them is worse than one that describes them all.
function repairStore(tasks: Task[]): Array<{ task: Task; message: string }> {
  const repaired: Array<{ task: Task; message: string }> = [];
  for (const task of tasks) {
    if (CLOSING_STATES.includes(task.state) || (task.closed === null && task.closedCommit === null)) continue;
    repaired.push({ task, message: `${task.id} is ${task.state}: cleared its close date (${task.closed ?? 'none'}) and closing commit (${task.closedCommit ?? 'none'})` });
    task.closed = null;
    task.closedCommit = null;
  }
  return repaired;
}

// Every check `doctor` reports, in one place, so a caller that needs the
// count — `merge-ready`, whose summary was swallowing five warnings about
// closes that existed only in the working tree — reads the same list the
// report prints rather than parsing it back out of the output.
function misfiledSystemIssues(config: Config, tasks: Task[]): CheckIssue[] {
  const owner = pathOwner(config);
  return tasks.flatMap((task) => misfiledSystem(task, owner) ?? []);
}

export function doctorIssues(config: Config, tasks: Task[]): CheckIssue[] {
  const dirtyIssue = dirtyStoreIssue(config);
  // Mid-merge, HEAD is still the pre-merge commit: every record the other
  // side closed reads as a working-tree edit and every commit that closed
  // one reads as unreachable. Both checks answer about a tree that does not
  // exist yet, so they are suspended — the store-only checks are the ones
  // worth reading while resolving a conflict.
  const gitAnchored = git.mergeInProgress() ? [] : [...closedCommitIssues(tasks), ...workingTreeOnlyIssues(config, tasks)];
  return [
    ...checkStore(tasks, systemNames(config), (spec) => existsSync(specFile(config, spec))),
    ...misfiledSystemIssues(config, tasks),
    ...gitAnchored,
    ...coldClaimIssues(tasks, today()),
    ...specIssues(config),
    ...(dirtyIssue ? [dirtyIssue] : []),
  ];
}

export function cmdDoctor(args: Flags): void {
  const config = resolveConfig(args.flags);
  const { tasks, skipped } = loadStoreTolerantly(config.storePath);

  const merging = git.mergeInProgress();
  const issues = doctorIssues(config, tasks);

  if (merging) console.log('a merge is in progress (MERGE_HEAD exists) — the git-anchored checks (working-tree-only state, closing-commit reachability) are suspended until it is committed');

  let repaired: Array<{ task: Task; message: string }> = [];
  if (args.flags.fix === 'true') {
    if (skipped.length > 0) console.log(`--fix declined to write: ${skipped.length} line(s) did not parse, and saving would delete them`);
    else {
      repaired = repairStore(tasks);
      if (repaired.length > 0) {
        saveStoreAndWarn(tasks, config);
        recordEvents(config, 'doctor-fix', repaired.map((entry) => subjectOf(entry.task, entry.message)));
      }
    }
  }

  if (issues.length > 0) {
    console.log(`${issues.length} issue(s) — reported, not enforced:`);
    for (const issue of issues) console.log(`  [${issue.level}] ${issue.message}`);
  }
  if (repaired.length > 0) {
    console.log(`repaired ${repaired.length}:`);
    for (const entry of repaired) console.log(`  ${entry.message}`);
  } else if (issues.length > 0 && args.flags.fix !== 'true') {
    console.log('none of these has exactly one correct repair; `--fix` clears a close date left on a record that is not closed, and nothing else');
  }

  const count = (level: CheckIssue['level']): number => issues.filter((issue) => issue.level === level).length;
  const dangling = count('dangling');
  console.log(`${tasks.length} task(s), ${dangling} dangling reference(s), ${count('error')} error(s), ${count('warning')} warning(s), ${skipped.length} unparseable line(s)`);

  // The two conditions that exit non-zero, and what they have in common is
  // that neither is a disagreement about the work. A store that will not
  // parse is malformed input, and it is the one state a later write would
  // destroy rather than merely disagree with. A dangling reference is the
  // store having drifted out of step with the tree — a system name, a spec
  // file or a record id that resolves to nothing — which is decidable, unlike
  // every other line above.
  if (skipped.length > 0) {
    for (const message of skipped) console.error(`error: ${message}`);
    console.error(`error: ${config.storePath} does not parse`);
    process.exitCode = 1;
  }
  if (dangling > 0) {
    console.error(`error: ${dangling} record reference(s) resolve to nothing — a record must point at something real, which is the one thing about the store a machine can check`);
    process.exitCode = 1;
  }
}

export type { CheckIssue };
