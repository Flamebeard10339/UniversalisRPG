import type { EngineKey } from '../content/locale';
import type { CommandResult } from './command';

// What a played run records, for both harnesses that record one: the model's loop in
// scripts/playbot.ts and the author's own in the app. A run either of them produces reads the
// same to whoever picks it up afterwards, and is addressed to them rather than to the player —
// so the headings below are the vocabulary of a run log and not something anybody translates.

export interface NoteField {
  // As a reply writes it, as an entry carries it, and as the JSON schema names it.
  readonly name: 'note' | 'expected' | 'confusion' | 'blocked';
  // What an author playing in the app is asked for it. The model is asked in the playbot's own
  // prompt, at the length a prompt wants; the two agree about the field and not about the wording.
  readonly asks: EngineKey;
  readonly heading: string;
  // What a described turn writes where nothing was said. Null leaves the field out entirely.
  readonly whenEmpty: string | null;
  // Whether a reply that does not carry it as a string is refused.
  readonly required: boolean;
}

export const NOTE_FIELDS: readonly NoteField[] = [
  { name: 'note', asks: 'engine.playtest.note', heading: 'note', whenEmpty: '(none)', required: true },
  { name: 'expected', asks: 'engine.playtest.expected', heading: 'expected', whenEmpty: '(none)', required: true },
  { name: 'confusion', asks: 'engine.playtest.confusion', heading: 'confusion', whenEmpty: '(none)', required: true },
  { name: 'blocked', asks: 'engine.playtest.blocked', heading: 'BLOCKED', whenEmpty: null, required: false },
];

export type NoteName = NoteField['name'];

export type RunNotes = { readonly [K in NoteName]: string };

export const NO_NOTES: RunNotes = Object.fromEntries(NOTE_FIELDS.map((field) => [field.name, ''])) as RunNotes;

export interface PlayedTurn extends RunNotes {
  readonly turn: number;
  readonly outcome: 'applied' | 'refused';
  readonly line: string;
  readonly detail: string;
}

export interface SkippedTurn {
  readonly turn: number;
  readonly outcome: 'reload-failed' | 'invalid-reply';
  readonly detail: string;
}

export type RunLogEntry = PlayedTurn | SkippedTurn;

export const isPlayed = (entry: RunLogEntry): entry is PlayedTurn => 'line' in entry;

export const JOURNAL_WINDOW = 10;

function noted(entry: PlayedTurn): string {
  return NOTE_FIELDS.flatMap((field) => {
    const said = entry[field.name];
    if (said !== '') return [`${field.heading}: ${said}`];
    return field.whenEmpty === null ? [] : [`${field.heading}: ${field.whenEmpty}`];
  }).join('; ');
}

export function describeEntry(entry: RunLogEntry): string {
  if (!isPlayed(entry)) return `turn ${entry.turn} [${entry.outcome}] ${entry.detail}`;
  return `turn ${entry.turn} [${entry.outcome}] ${entry.line} — ${noted(entry)}; result: ${entry.detail}`;
}

export const describeRun = (log: readonly RunLogEntry[]): string => log.map(describeEntry).join('\n');

export function journalWindowText(log: readonly RunLogEntry[]): string {
  const windowed = log.slice(-JOURNAL_WINDOW);
  if (windowed.length === 0) return '(run just started; no turns yet)';
  return windowed.map(describeEntry).join('\n');
}

export const blocking = (entry: RunLogEntry): string => (isPlayed(entry) ? entry.blocked : '');

// A turn as one of the two harnesses settles it: what the line was, whether the engine took it,
// and what it answered with in the words that harness's own player read.
export function turnRecord(turn: number, line: string, outcome: PlayedTurn['outcome'], detail: readonly string[], notes: RunNotes = NO_NOTES): PlayedTurn {
  const said = detail.filter((each) => each.trim() !== '').join('\n');
  return { ...notes, turn, line, outcome, detail: said === '' ? 'nothing happened' : said };
}

export const outcomeOf = (result: CommandResult): PlayedTurn['outcome'] => (refusedLine(result) ? 'refused' : 'applied');

// The engine, not a harness, decides what a line refuses: an error-toned message is the one signal
// command.ts already gives every driver, so this is not a second validation layer beside runLine.
export const refusedLine = (result: CommandResult): boolean => result.output.some((output) => output.kind === 'message' && output.tone === 'error');

// A run outlives the tab it was played in. Holding one is what recording *is* — there is no
// second flag saying the mode is on, so a reload picks the run back up where it was.
export const PLAYTEST_SLOT = 'playtest';

export function serializeRun(log: readonly RunLogEntry[]): string {
  return JSON.stringify(log);
}

const isEntry = (value: unknown): value is RunLogEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const held = value as Record<string, unknown>;
  return Number.isInteger(held.turn) && typeof held.outcome === 'string' && typeof held.detail === 'string';
};

// A run kept between sittings is read back leniently: a log this cannot make sense of is a run
// nobody can act on, and refusing to open the app over one would cost the author the session.
export function parseRun(payload: string | null): RunLogEntry[] | null {
  if (payload === null) return null;
  try {
    const held: unknown = JSON.parse(payload);
    return Array.isArray(held) && held.every(isEntry) ? (held as RunLogEntry[]) : null;
  } catch {
    return null;
  }
}
