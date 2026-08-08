import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The verbs that write, plus the three writes that exist only to be recorded.
// `decision` is its own op rather than a note by convention, because "what
// was decided about this" has to be answerable without a text heuristic.
// `recur` is its own op for the same reason and a stronger one: it is counted,
// and a count assembled by matching prose would be a different number every
// time the prose was reworded. `checked` is the one place an event's `id` is
// not a task id but a lesson handle — the subject of the event is the lesson,
// and "who looked, and when" is what an append-only log answers well.
// `remove` is the one verb the store's removal path had none of: saveStore
// rewrites the whole file from the array it was given, so any caller dropping
// a record removed it with nothing able to say that it had, or why.
export const EVENT_OPS = ['add', 'edit', 'start', 'stop', 'done', 'decline', 'triage', 'import', 'audit', 'spec-add', 'spec-remove', 'spec-defer', 'spec-done', 'doctor-fix', 'note', 'decision', 'recur', 'checked', 'remove'] as const;

export type EventOp = (typeof EVENT_OPS)[number];

export interface TaskEvent {
  t: string;
  by: string | null;
  branch: string;
  head: string | null;
  op: string;
  // Null for an event that names a system or a spec and no task, which is
  // what a project-level decision is.
  id: string | null;
  // `system` and `spec` are what the record carried when the event was
  // written, not a join to the record as it stands now: re-pointing a task
  // must not rewrite the history of what was done to it under its old spec.
  system: string | null;
  spec: string | null;
  note: string;
}

export class EventLogError extends Error {}

const EVENTS_FILENAME = 'events.jsonl';

// The log follows the store. Deriving it rather than configuring it is what
// makes it impossible for a run against a scratch store to append to the
// project's real history.
export function eventsPathFor(storePath: string): string {
  return path.join(path.dirname(storePath), EVENTS_FILENAME);
}

// The one place an event's field order is fixed, so every line in the log
// reads the same way and a hand-inspected diff stays legible.
function renderEvent(event: TaskEvent): string {
  const known: { [K in keyof TaskEvent]: TaskEvent[K] } = {
    t: event.t,
    by: event.by,
    branch: event.branch,
    head: event.head,
    op: event.op,
    id: event.id,
    system: event.system,
    spec: event.spec,
    note: event.note,
  };
  return JSON.stringify(known);
}

// Append-only, and appending is the whole write path: nothing here reads the
// file first, so two processes writing at once interleave lines rather than
// losing one, and `merge=union` handles two branches doing it.
export function appendEvents(events: TaskEvent[], eventsPath: string): void {
  if (events.length === 0) return;
  appendFileSync(eventsPath, `${events.map(renderEvent).join('\n')}\n`, 'utf8');
}

// One event is one line, and every reader of this log depends on it: `tasks
// log` renders a row per event and a paragraph inside one is unreadable in a
// column. Checked where a note enters rather than at render, because
// `JSON.stringify` escapes the newline happily and hides the problem in the
// file. Returns the line count of an offending note, so a caller can name it.
export function multilineNote(note: string): number | null {
  return /[\r\n]/.test(note) ? note.split(/\r\n|\r|\n/).length : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new EventLogError(`${where}: event requires ${key}`);
  return value;
}

function nullableString(record: Record<string, unknown>, key: string, where: string): string | null {
  const value = record[key] ?? null;
  if (value !== null && typeof value !== 'string') throw new EventLogError(`${where}: event has non-string ${key}`);
  return value;
}

function normalizeEvent(value: unknown, where: string): TaskEvent {
  if (!isRecord(value)) throw new EventLogError(`${where}: event record must be an object`);
  return {
    t: requireString(value, 't', where),
    by: nullableString(value, 'by', where),
    branch: requireString(value, 'branch', where),
    head: nullableString(value, 'head', where),
    op: requireString(value, 'op', where),
    id: nullableString(value, 'id', where),
    system: nullableString(value, 'system', where),
    spec: nullableString(value, 'spec', where),
    note: requireString(value, 'note', where),
  };
}

export interface ToleratedEvents {
  events: TaskEvent[];
  skipped: string[];
}

// A log is only useful if reading it always answers, so an unreadable line
// is reported beside the ones that read rather than instead of them. There
// is no strict twin: nothing ever rewrites this file, so skipping a line
// here can never delete it.
export function parseEvents(text: string, label: string): ToleratedEvents {
  const events: TaskEvent[] = [];
  const skipped: string[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line.length === 0) return;
    const where = `${label}:${index + 1}`;
    try {
      events.push(normalizeEvent(JSON.parse(line) as unknown, where));
    } catch (error) {
      skipped.push(error instanceof EventLogError ? error.message : `${where}: malformed JSONL event record: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return { events, skipped };
}

export function loadEvents(eventsPath: string): ToleratedEvents {
  if (!existsSync(eventsPath)) return { events: [], skipped: [] };
  return parseEvents(readFileSync(eventsPath, 'utf8'), eventsPath);
}

// What a record leaving the store looks like from the log's side. `remove` is
// the precise answer and `decline` is the weaker one — a record declined and
// then dropped was dropped deliberately, and reading it as unexplained would
// bury the absences nobody can account for under the ones everybody can.
const EXPLAINS_ABSENCE: string[] = ['remove', 'decline'];

export interface ExplainedAbsence {
  id: string;
  op: string;
  note: string;
}

export interface Reconciliation {
  // Ids the log has seen created and the store still holds.
  accounted: string[];
  absentExplained: ExplainedAbsence[];
  // The finding. Everything above is the proof that it is complete.
  absentUnexplained: string[];
  // How much of the store this could not check at all: a record predating the
  // log carries no `add` event, so nothing here can say whether it ever left.
  // Reported on every run, clean ones included — a check that says
  // "reconciled" over the quarter of the store it can see is a false proof.
  storeRecords: number;
  outsideCoverage: number;
  // The same statement about the other input. One malformed log line used to
  // take an unexplained absence from 1 to 0 with nothing said and exit 0 — the
  // check failing open on the input it exists to read. The number was already
  // in hand and the caller destructured past it, so it is a field here: the
  // coverage is part of the answer, not something a printer may forget.
  logLinesUnread: number;
}

// The log and the store, compared. Three disjoint sets over the ids the log
// has ever seen created, plus the coverage the comparison does not have — of
// the store, and of the log. It takes the whole read rather than the events
// out of it, because a caller holding only `events` cannot state its coverage.
export function reconcile(read: ToleratedEvents, storeIds: string[]): Reconciliation {
  const { events, skipped } = read;
  const present = new Set(storeIds);
  const created = [...new Set(filterEvents(events, { op: 'add' }).map((event) => event.id))].filter((id): id is string => id !== null);

  const accounted = created.filter((id) => present.has(id));
  const absent = created.filter((id) => !present.has(id));
  const absentExplained: ExplainedAbsence[] = [];
  const absentUnexplained: string[] = [];
  for (const id of absent) {
    const explanation = lastExplanation(events, id);
    if (explanation === undefined) absentUnexplained.push(id);
    else absentExplained.push({ id, op: explanation.op, note: explanation.note });
  }

  return { accounted, absentExplained, absentUnexplained, storeRecords: storeIds.length, outsideCoverage: storeIds.filter((id) => !created.includes(id)).length, logLinesUnread: skipped.length };
}

// The last explanation *after* the id's last `add`, which is not the same as
// the last explanation. A record removed on purpose, re-filed under the same
// id, and then lost silently reported as accounted for under the old reason —
// so the third set was nearly the finding rather than the finding. Re-filing
// under a used id and retriage after a decline are both ordinary here.
function lastExplanation(events: TaskEvent[], id: string): TaskEvent | undefined {
  const own = events.filter((event) => event.id === id);
  for (let i = own.length - 1; i >= 0; i--) {
    if (own[i].op === 'add') return undefined;
    if (EXPLAINS_ABSENCE.includes(own[i].op)) return own[i];
  }
  return undefined;
}

export interface EventFilter {
  id?: string;
  system?: string;
  spec?: string;
  op?: string;
  text?: string;
}

// The topic search. `head`, `branch` and `t` are deliberately out of it:
// they are provenance, and matching a topic against a sha would answer a
// question nobody asked with results nobody can read.
function searchable(event: TaskEvent): string {
  return [event.id, event.system, event.spec, event.op, event.by, event.note].filter((field) => field !== null).join('\n').toLowerCase();
}

// Every filter given is ANDed, and each is answered from the log alone —
// never by joining to the store, which is what would let a re-pointed record
// rewrite its own history.
export function filterEvents(events: TaskEvent[], filter: EventFilter = {}): TaskEvent[] {
  return events
    .filter((event) => filter.id === undefined || event.id === filter.id)
    .filter((event) => filter.system === undefined || event.system === filter.system)
    .filter((event) => filter.spec === undefined || event.spec === filter.spec)
    .filter((event) => filter.op === undefined || event.op === filter.op)
    .filter((event) => filter.text === undefined || searchable(event).includes(filter.text.toLowerCase()));
}
