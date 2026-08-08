import { filterEvents, loadEvents, noteProblem, type TaskEvent } from '../lib/eventLog';
import { CLOSING_STATES, FAULTS, reportsCost, type Fault, type Task } from '../lib/taskStore';
import { allLessons, findLesson, unknownLessonIds } from './briefLessons';
import type { Flags } from './cli';
import { readStore, recordEvents, resolveConfig } from './context';

// The one query over the channel. Everything it reports is derived: the
// records are the store's, the occurrences and the checks are the log's, and
// nothing here is a tally anybody maintains. Two properties are load-bearing
// and are the reason this file exists rather than a `--fault` mode of `list`:
// `nobody` and unclassified are reported and never counted as defects, and no
// number is compared to anything.

// The fault values that are a defect measure. `nobody` is not one of them —
// a question nobody could have answered is real information about where
// knowledge was missing, and counting it creates pressure to write specs that
// pretend to know what they cannot.
const DEFECT_FAULTS: Fault[] = ['tooling', 'contract'];

// One predicate for "counts as a defect", so every section that presents a
// defect measure excludes the same records. Three sections did the filtering
// independently and two of them forgot, which is what let `nobody` be printed
// as counted in nothing and then counted twice below it. Undefined is a
// recurrence whose record is not in this store: unclassifiable, so not counted.
const isDefect = (task: Task | undefined): boolean => task !== undefined && task.fault !== null && DEFECT_FAULTS.includes(task.fault);

// Absence of a fault is its own answer and not a fourth value: a record
// written before the field existed says nothing about who was at fault, and
// folding it into `nobody` would empty the meaning the whole axis depends on.
type Bucket = Fault | 'unclassified';
const BUCKETS: Bucket[] = [...FAULTS, 'unclassified'];

const bucketOf = (task: Task): Bucket => task.fault ?? 'unclassified';

const BUCKET_NOTE: Record<Bucket, string> = {
  tooling: 'the tooling is at fault — these are the fixes',
  contract: 'the brief or the spec was at fault — these change how work is written, not what is built',
  nobody: 'nobody was at fault: the knowledge did not exist. Reported, and counted in nothing below',
  unclassified: 'filed before the channel existed. Not backfilled — guessing a fault for a record whose author is gone is how `nobody` becomes the catch-all. Counted in nothing below',
};

interface Denominator {
  label: string;
  count: number;
}

// Drawn from events the log already carries, never from a new tally: a
// denominator that is itself hand-kept is a second thing to drift. A
// `work-prompt` is a read and leaves no event, so `start` is the honest proxy
// for a dispatch. `tasks audit` emits one `audit` event for the pass and one
// more per finding the pass files, so the pass count is the subject-less ones:
// counting them all put the numerator inside its own denominator, and made
// filing a defect increment both sides of its own rate.
function denominators(events: TaskEvent[]): Denominator[] {
  return [
    { label: 'dispatches (start events)', count: filterEvents(events, { op: 'start' }).length },
    { label: 'audit passes (audit events carrying no record)', count: filterEvents(events, { op: 'audit' }).filter((event) => event.id === null).length },
    { label: 'specs closed (spec-done events)', count: filterEvents(events, { op: 'spec-done' }).length },
  ];
}

const rate = (count: number, over: number): string => (over === 0 ? 'no denominator yet' : `${((count / over) * 100).toFixed(0)} per 100`);

function printByFault(reporting: Task[]): void {
  console.log(`by fault, over ${reporting.length} record(s) that report what the work cost:`);
  for (const bucket of BUCKETS) {
    const held = reporting.filter((task) => bucketOf(task) === bucket);
    const open = held.filter((task) => !CLOSING_STATES.includes(task.state)).length;
    console.log(`  ${bucket.padEnd(13)} ${String(held.length).padStart(4)} record(s), ${open} still open — ${BUCKET_NOTE[bucket]}`);
  }
}

function printRates(reporting: Task[], events: TaskEvent[]): void {
  const defects = reporting.filter(isDefect);
  const excluded = reporting.length - defects.length;
  console.log(`\n${defects.length} of those are a defect measure — fault ${DEFECT_FAULTS.join(' or ')} only, with the other ${excluded} reported above and excluded here:`);
  for (const { label, count } of denominators(events)) console.log(`  ${defects.length} against ${count} ${label} — ${rate(defects.length, count)}`);
}

interface Occurrence {
  id: string;
  events: TaskEvent[];
}

// The derivation half of the recurrence clause: the count is whatever the log
// holds, computed here and stored nowhere, so it cannot disagree with the
// occurrences it counts.
function occurrencesByRecord(events: TaskEvent[]): Occurrence[] {
  const byId = new Map<string, TaskEvent[]>();
  for (const event of filterEvents(events, { op: 'recur' })) {
    if (event.id === null) continue;
    byId.set(event.id, [...(byId.get(event.id) ?? []), event]);
  }
  return [...byId].map(([id, held]) => ({ id, events: held }));
}

function printOccurrences(occurrences: Occurrence[], reporting: Task[]): void {
  const byId = new Map(reporting.map((task) => [task.id, task]));
  const sum = (held: Occurrence[]): number => held.reduce((running, entry) => running + entry.events.length, 0);
  const counted = occurrences.filter((entry) => isDefect(byId.get(entry.id)));
  const excluded = occurrences.filter((entry) => !isDefect(byId.get(entry.id)));
  const carryNone = reporting.filter(isDefect).length - counted.length;
  console.log(
    `\n${sum(counted)} recurrence(s) recorded against ${counted.length} record(s) of defect fault; the other ${carryNone} carry none. ` +
      `${sum(excluded)} further recurrence(s) against ${excluded.length} record(s) are reported below and excluded from that count. ` +
      `Every number here is counted off the occurrences themselves — nothing is stored, so nothing can disagree with them:`,
  );
  for (const { id, events } of occurrences) {
    const task = byId.get(id);
    const standing = task === undefined ? ', and no record in the store answers to that id' : ` (${task.state}${isDefect(task) ? '' : `, ${bucketOf(task)} — not counted above`})`;
    console.log(`  ${id} — ${events.length} occurrence(s)${standing}`);
    for (const event of events) console.log(`      ${event.t.slice(0, 10)}  ${event.by ?? '(unnamed)'}  ${event.note}`);
  }
}

// Zero breaches is otherwise ambiguous between the lesson working and nobody
// having looked, so the distinction is recorded by whoever looked rather than
// inferred from the absence.
function lastCheck(events: TaskEvent[], lessonId: string): TaskEvent | undefined {
  const checks = filterEvents(events, { op: 'checked', id: lessonId });
  return checks[checks.length - 1];
}

function printByLesson(reporting: Task[], events: TaskEvent[], occurrences: Occurrence[]): void {
  const occurrenceCount = new Map(occurrences.map((entry) => [entry.id, entry.events.length]));
  const lessons = allLessons();
  console.log(
    `\nby lesson breached, over ${lessons.length} live lesson(s), counting the defect faults only — this is the defect reading in actionable form, so it excludes what \`printRates\` excludes and names the excluded records anyway. ` +
      `The order is the briefs' own and never the count's — ranking by the number would be comparing it to something, and the number is a reading aid for a planner rather than a rule:`,
  );
  const width = Math.max(...lessons.map((lesson) => lesson.id.length));
  for (const lesson of lessons) {
    const cited = reporting.filter((task) => task.breaches.includes(lesson.id));
    const counted = cited.filter(isDefect);
    const recurrences = counted.reduce((sum, task) => sum + (occurrenceCount.get(task.id) ?? 0), 0);
    const check = lastCheck(events, lesson.id);
    const looked = check === undefined ? 'nobody has looked' : `checked clean ${check.t.slice(0, 10)} by ${check.by ?? '(unnamed)'}: ${check.note}`;
    const named = cited.map((task) => (isDefect(task) ? task.id : `${task.id} (${bucketOf(task)}, not counted)`)).join(', ');
    console.log(`  ${lesson.id.padEnd(width)}  ${String(counted.length).padStart(3)} record(s), ${recurrences} further occurrence(s) — ${cited.length === 0 ? looked : `${named}${check === undefined ? '' : `; ${looked}`}`}`);
  }

  const orphaned = reporting.flatMap((task) => unknownLessonIds(task.breaches).map((id) => ({ task, id })));
  if (orphaned.length === 0) return;
  console.log(`\n${orphaned.length} citation(s) name no live lesson, reported rather than dropped:`);
  for (const { task, id } of orphaned) console.log(`  ${task.id} cites ${id}`);
}

export function cmdFriction(args: Flags): void {
  const config = resolveConfig(args.flags);
  const tasks = readStore(config);
  const { events } = loadEvents(config.eventsPath);
  const reporting = tasks.filter((task) => reportsCost(task.kind));

  console.log('The channel: what working this process has cost, and where the fault lay.');
  console.log('');
  printByFault(reporting);
  printRates(reporting, events);
  const occurrences = occurrencesByRecord(events);
  printOccurrences(occurrences, reporting);
  printByLesson(reporting, events, occurrences);
  console.log('\nNothing here gates. No number above is compared to anything, in this command or any other — a planner reads them and decides.');
  console.log('`tasks add "<title>" --kind finding --fault tooling|contract|nobody --breaches <lesson-handle>` files into this channel; `tasks recur <id> --note "..."` records that one happened again; `tasks checked <lesson-handle> --note "..."` records that somebody looked and found it clean.');
}

// The other half of c7, and the reason it is an event rather than a field:
// "who looked, and when" is exactly what an append-only log answers well, and
// a field would hold one answer where the useful thing is the history. The
// subject of the event is the lesson, so its handle goes in `id` and
// `tasks log --id <handle>` answers it for free.
export function cmdChecked(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const handle = args.positional[0];
  const note = args.flags.note;
  if (!handle || !note) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const problem = noteProblem('a check', note);
  if (problem !== null) {
    console.error(`error: ${problem}`);
    process.exitCode = 1;
    return;
  }
  const lesson = findLesson(handle);
  if (lesson === undefined) {
    console.error(`error: no live lesson has the handle ${handle} — a check against a handle nothing answers to would read as a clean lesson that does not exist. \`tasks friction\` lists every live handle`);
    process.exitCode = 1;
    return;
  }

  recordEvents(config, 'checked', [{ id: handle, system: null, spec: null, note }]);
  console.log(`recorded a check of ${handle} in ${config.eventsPath} — "${lesson.title}"`);
  console.log(`\`tasks friction\` now distinguishes it from a lesson nobody looked at; a breach found instead is \`tasks add "<title>" --kind finding --fault contract --breaches ${handle} --deliverable "..."\``);
}
