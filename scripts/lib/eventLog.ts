import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The verbs that write, plus the two writes that exist only to be recorded.
// `decision` is its own op rather than a note by convention, because "what
// was decided about this" has to be answerable without a text heuristic.
export const EVENT_OPS = ['add', 'edit', 'start', 'stop', 'done', 'decline', 'triage', 'import', 'audit', 'spec-add', 'spec-remove', 'spec-defer', 'spec-done', 'doctor-fix', 'note', 'decision'] as const;

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
