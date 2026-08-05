import { existsSync, readFileSync } from 'node:fs';
import { filterEvents, loadEvents } from '../lib/eventLog';
import { isReadableGrant } from '../lib/planCheck';
import { clauseStandings, parseSpecDoc, type SpecDoc } from '../lib/specDoc';
import { trackedFiles } from '../lib/sourceFiles';
import { covers, normalizePath } from '../lib/systems';
import { clausesOf, fixNowQueue, type Task } from '../lib/taskStore';
import type { Flags } from './cli';
import { readStore, resolveConfig, specFile, type Config } from './context';
import { explainEmptyQueue } from './records';
import { clauseStandingLines, renderTask } from './render';
import { resolveTaskIds } from './resolveIds';

// One spec is one branch, so a worktree cut from `main` after the first
// member landed reads a store that looks current while missing what the
// branch closed — silent rather than empty. The brief states which branch
// the spec was last written from and stops: whoever spawned the worktree
// owns that environment and already knows which branch the work is on.
function lastWritingBranch(config: Config, spec: string): string | null {
  const { events } = loadEvents(config.eventsPath);
  const written = filterEvents(events, { spec });
  return written[written.length - 1]?.branch ?? null;
}

function specDocFor(config: Config, spec: string | null): SpecDoc | null {
  if (spec === null) return null;
  const path_ = specFile(config, spec);
  return existsSync(path_) ? parseSpecDoc(readFileSync(path_, 'utf8')) : null;
}

function printSpecProvenance(config: Config, task: Task): void {
  if (task.spec === null) {
    console.log('Spec: none — this record names no spec, so it discharges no clause and has no branch behind it.');
    return;
  }
  const path_ = specFile(config, task.spec);
  console.log(`Spec: ${path_}${existsSync(path_) ? '' : ' — no such file in this checkout'}`);
  const branch = lastWritingBranch(config, task.spec);
  console.log(branch === null ? `No store write has been recorded against ${task.spec} yet.` : `${task.spec} was last written from branch ${branch}.`);
}

function trackedOrNull(): string[] | null {
  try {
    return trackedFiles();
  } catch {
    return null;
  }
}

// What the grant resolves to now is the first thing a worker can check it
// against: a path matching no tracked file was forecast rather than opened,
// and a directory covering forty of them is a region nobody has narrowed.
function printGrant(task: Task): void {
  console.log(`Write grant (${task.grant ?? 'kind unstated'}), and the files it resolves to:`);
  if (task.writes.length === 0) {
    console.log('- none declared — decide what you will touch and record it before you write code');
    return;
  }
  const tracked = trackedOrNull();
  if (tracked === null) {
    for (const grant of task.writes) console.log(`- ${grant} — git could not be asked what this resolves to`);
    return;
  }
  for (const grant of task.writes) {
    if (!isReadableGrant(grant)) {
      console.log(`- ${grant} — a wildcard this cannot resolve to a region of the tree`);
      continue;
    }
    const normalized = normalizePath(grant);
    const files = tracked.filter((file) => covers(normalized, normalizePath(file)));
    if (files.length === 0) {
      console.log(`- ${grant} — matches no tracked file, so it is a path somebody forecast rather than one anybody opened`);
      continue;
    }
    if (files.length === 1 && normalizePath(files[0]) === normalized) {
      console.log(`- ${grant}`);
      continue;
    }
    console.log(`- ${grant} — ${files.length} tracked file(s):`);
    for (const file of files) console.log(`    ${file}`);
  }
}

function printClauses(task: Task, doc: SpecDoc | null): void {
  console.log('Proof clauses this task discharges:');
  // `discharges` first, because that is where an ordinary record keeps this:
  // `doctor` errors on a `clause` outside an `undelivered` record, so reading
  // `clause` alone made this branch unreachable for every task the brief is
  // actually generated for — the record block printed `discharges: c1, c2`
  // and eight lines later this printed "none recorded".
  const clauses = clausesOf(task);
  if (clauses.length === 0) {
    console.log(`- none recorded on this record${task.spec === null ? '' : `; \`npm run tasks -- spec show ${task.spec}\` lists every clause and where it stands`}`);
    return;
  }
  if (doc === null) {
    console.log(`- ${clauses.map((id) => `c${id}`).join(', ')} — the spec document is not in this checkout, so their standings cannot be read here`);
    return;
  }
  const standings = clauseStandings(doc.proofClauses, doc.auditPasses[doc.auditPasses.length - 1]?.verdicts);
  for (const id of clauses) {
    const standing = standings.find((verdict) => verdict.clause === id);
    if (standing === undefined) console.log(`- c${id} — ${task.spec} has no clause with this id`);
    else for (const line of clauseStandingLines(standing, doc.proofClauses)) console.log(line);
  }
}

function printObligations(task: Task): void {
  console.log('Three things the workflow puts on you before you write code:');
  console.log(`1. Claim the record: npm run tasks -- start ${task.id} --actor <you>`);
  console.log(`2. Correct the grant: npm run tasks -- edit ${task.id} --writes <what you will actually touch> --grant commitment. You have read the region and the planner had not, so the grant above is a forecast until you say otherwise — and \`tasks plan\` grades an overlap between two commitments as a defect and one resting on a forecast as a note, so the word is what makes the check mean anything. A diff that diverges from it later is information, not a violation — correct the record and say so in the commit body.`);
  console.log(`3. Register any durable capability this produces: npm run tasks -- concept "<system>" "<name>" --paths <paths> --note "produced by ${task.id}". A \`produces\` claim is a forecast, not a registration, and making that judgement is the point of the step.`);
  console.log('');
  console.log('You may refuse this grant, and the planner is expected to believe you. If reading the region says the work belongs somewhere else, is already done, is more than one task, or rests on something that does not exist, say so and stop rather than building around it.');
  console.log(`\`npm run tasks -- stop ${task.id}\` returns the record to the queue; \`npm run tasks -- decline ${task.id} --reason "..."\` closes it as work that should not be done.`);
  console.log('');
  console.log(`Then work: commit after each logical chunk, and close with \`npm run tasks -- done ${task.id} --commit HEAD\`.`);
}

// The queue `tasks next --spec <slug>` reads, asked here rather than answered
// again: a second opinion on which member comes next is a second thing to
// keep in sync. An empty one is explained by the same function `next` prints,
// because "no member tasks", "every member closed" and "every member blocked"
// are different next moves and a dispatcher gets none of them from silence.
function nextMemberOf(tasks: Task[], spec: string): Task | undefined {
  const queue = fixNowQueue(tasks, spec);
  if (queue.length === 0) {
    console.log(`${spec} is a spec, and it has no open, unblocked member to brief`);
    explainEmptyQueue(tasks, spec, {});
    return undefined;
  }
  const [next, ...rest] = queue;
  console.log(`resolved the spec ${spec} -> ${next.id}, its next open, unblocked member${rest.length > 0 ? ` (${rest.length} more behind it: ${rest.map((task) => task.id).join(', ')})` : ''}`);
  return next;
}

// A dispatcher holds the name of the work — the spec slug, which on a
// planning branch is the only name that exists yet — and not the id of
// whichever member happens to be unblocked. An exact task id still wins
// outright, so the eleven specs carrying a root task of the same slug brief
// that record unchanged; the fuzzy match comes last because fuzzy-first is
// what answered `work-prompt audit-loop-costs-less` with five records matched
// on substrings of their titles and never looked in docs/specs at all.
function resolveWorkTarget(config: Config, tasks: Task[], name: string): Task | undefined {
  const exact = tasks.find((task) => task.id === name);
  if (exact) return exact;
  if (existsSync(specFile(config, name))) return nextMemberOf(tasks, name);
  // A read answers, and "no such task" with the nearest ids is the answer.
  // What it must never do is print a brief anyway: a dispatch instruction
  // for a record nobody holds is the one output here that would be invented.
  return resolveTaskIds([name], tasks, { report: (line) => console.log(line) })?.[0];
}

export function cmdWorkPrompt(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const name = args.positional[0];
  if (!name) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const tasks = readStore(config);
  const task = resolveWorkTarget(config, tasks, name);
  if (task === undefined) return;

  console.log(`You are implementing ${task.id} on branch ${config.branch}.`);
  printSpecProvenance(config, task);
  console.log('');
  for (const line of renderTask(task, new Map(tasks.map((candidate) => [candidate.id, candidate])), 'full')) console.log(line);
  console.log('');
  printGrant(task);
  console.log('');
  printClauses(task, specDocFor(config, task.spec));
  console.log('');
  printObligations(task);
}
