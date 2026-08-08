import { existsSync, readFileSync } from 'node:fs';
import { filterEvents, loadEvents } from '../lib/eventLog';
import { isReadableGrant } from '../lib/planCheck';
import { clauseStandings, parseSpecDoc, type SpecDoc } from '../lib/specDoc';
import { trackedFiles } from '../lib/sourceFiles';
import { covers, normalizePath } from '../lib/systems';
import { clausesOf, fixNowQueue, type Task } from '../lib/taskStore';
import { printLessons, WORKER_LESSONS } from './briefLessons';
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
  const standings = clauseStandings(doc.proofClauses, doc.auditPasses);
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

// The root-record convention eleven specs carry: a task whose id is the spec
// slug and which declares no write grant, holding the whole picture and every
// member of the spec as a requirement. It is a container, not work, and a
// brief for it misdirects three times over — it opens "You are implementing
// audit-loop-costs-less" over a record whose own evidence reads "work the
// members, not this"; it prints BLOCKED against four waiting requirements
// that are the members ready to be picked up now, so a spec appears to be
// waiting on itself; and it then asks for the write grant whose collision
// with every slice beneath it is why the last root task was declined.
function isRootRecord(task: Task): boolean {
  return task.spec !== null && task.id === task.spec && task.writes.length === 0;
}

// The queue `tasks next --spec <slug>` reads, asked here rather than answered
// again: a second opinion on which member comes next is a second thing to
// keep in sync.
function memberQueue(tasks: Task[], spec: string): Task[] {
  return fixNowQueue(tasks, spec).filter((task) => !isRootRecord(task));
}

// A dispatcher holds the name of the work — the spec slug, which on a
// planning branch is the only name that exists yet — and not the id of
// whichever member happens to be unblocked. An ordinary exact id still wins
// outright; the fuzzy match comes last, because fuzzy-first is what answered
// `work-prompt audit-loop-costs-less` with five records matched on substrings
// of their titles while never looking in docs/specs at all.
function resolveWorkTarget(config: Config, tasks: Task[], name: string): Task | undefined {
  const exact = tasks.find((task) => task.id === name);
  if (exact !== undefined && !isRootRecord(exact)) return exact;

  const fuzzy = exact === undefined && !existsSync(specFile(config, name))
    // A read answers, and "no such task" with the nearest ids is the answer.
    // What it must never do is print a brief anyway: a dispatch instruction
    // for a record nobody holds is the one output here that would be invented.
    ? resolveTaskIds([name], tasks, { report: (line) => console.log(line) })?.[0]
    : undefined;
  // A fragment resolves to a record, and a root record is no more work when
  // it was reached by prefix than when it was named outright: `work-prompt
  // audit-loop` is one keystroke from the exact id and produced every
  // misdirection this clause exists to stop.
  if (fuzzy !== undefined && !isRootRecord(fuzzy)) return fuzzy;

  const spec = exact?.spec ?? fuzzy?.spec ?? (existsSync(specFile(config, name)) ? name : null);
  if (spec === null) return undefined;
  const root = exact ?? fuzzy;

  const [next, ...rest] = memberQueue(tasks, spec);
  const behind = rest.length > 0 ? ` (${rest.length} more behind it: ${rest.map((task) => task.id).join(', ')})` : '';
  if (next !== undefined) {
    console.log(
      root === undefined
        ? `resolved the spec ${spec} -> ${next.id}, its next open, unblocked member${behind}`
        : `${root.id} is ${spec}'s root record — no write grant, and every member of the spec as a requirement, so it is blocked by its own spec and is not work. Briefing ${next.id}, its next open, unblocked member${behind}. The whole picture is \`npm run tasks -- show ${root.id}\`.`,
    );
    return next;
  }
  // The container is briefed only when there is nothing it could stand in
  // for: a spec whose one record is its own root is a spec nobody decomposed,
  // and a brief for it beats silence. A decomposed spec whose members are all
  // blocked is a different answer and gets the explanation below — briefing
  // the root there reintroduces the whole defect through the back door, which
  // is what `audit-brief-arrives-complete` did: four members waiting behind
  // `audit-loop-costs-less`, and a brief that dispatched the container.
  if (root !== undefined && !tasks.some((task) => task.spec === spec && task.id !== root.id)) {
    console.log(`${spec} has no member besides its own root record, so that is what is briefed.`);
    return root;
  }
  // An empty queue is explained by the same function `next` prints, because
  // "no member tasks", "every member closed" and "every member blocked" are
  // different next moves and a dispatcher gets none of them from silence.
  console.log(`${spec} is a spec, and it has no open, unblocked member to brief`);
  explainEmptyQueue(tasks, spec, {});
  return undefined;
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
  console.log('');
  printLessons('What repeated rounds have already paid to learn — carry it forward:', WORKER_LESSONS);
}
