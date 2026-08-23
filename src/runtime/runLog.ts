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

export type TurnOutcome = 'applied' | 'refused';

export interface PlayedTurn {
  readonly turn: number;
  readonly outcome: TurnOutcome;
  readonly line: string;
  readonly detail: string;
  readonly notes: RunNotes;
}

// A turn the harness took that the engine never saw: a reload that failed, a reply that could not
// be read, or — in the app, which has pages a terminal does not — a move between them. It is still
// a turn, because a player who has just navigated somewhere is a player with something to say
// about having navigated there, and `notes` is how they say it.
export interface SkippedTurn {
  readonly turn: number;
  readonly outcome: 'reload-failed' | 'invalid-reply' | 'moved';
  readonly detail: string;
  readonly notes: RunNotes;
}

export type RunLogEntry = PlayedTurn | SkippedTurn;

export const isPlayed = (entry: RunLogEntry): entry is PlayedTurn => 'line' in entry;

export const JOURNAL_WINDOW = 10;

function noted(notes: RunNotes): string {
  return NOTE_FIELDS.flatMap((field) => {
    const said = notes[field.name];
    if (said !== '') return [`${field.heading}: ${said}`];
    return field.whenEmpty === null ? [] : [`${field.heading}: ${field.whenEmpty}`];
  }).join('; ');
}

export const said = (notes: RunNotes): boolean => NOTE_FIELDS.some((field) => notes[field.name] !== '');

export function describeEntry(entry: RunLogEntry): string {
  // A turn the engine never saw carries its notes only where there are any: a reload that failed
  // had no player to ask, and four empty fields under it would read as a player who said nothing.
  if (!isPlayed(entry)) return `turn ${entry.turn} [${entry.outcome}] ${entry.detail}${said(entry.notes) ? ` — ${noted(entry.notes)}` : ''}`;
  // What the line answered with is carried only by a harness whose player has no other sight of it.
  return `turn ${entry.turn} [${entry.outcome}] ${entry.line} — ${noted(entry.notes)}${entry.detail === '' ? '' : `; result: ${entry.detail}`}`;
}

// A run says when it was played and what it was played against, because a list of findings read
// against a tree nobody can name cannot be checked against that tree afterwards.
export interface RunHeader {
  readonly at: string;
  readonly built: string;
}

export const describeRun = (log: readonly RunLogEntry[], header?: RunHeader): string =>
  [...(header === undefined ? [] : [`# played ${header.at} against ${header.built}`, '']), ...log.map(describeEntry)].join('\n');

export function journalWindowText(log: readonly RunLogEntry[]): string {
  const windowed = log.slice(-JOURNAL_WINDOW);
  if (windowed.length === 0) return '(run just started; no turns yet)';
  return windowed.map(describeEntry).join('\n');
}

export const blocking = (entry: RunLogEntry): string => entry.notes.blocked;

// A turn as one of the two harnesses settles it: what the line was, whether the engine took it,
// and what it answered with in the words that harness's own player read.
// `detail` is null where the harness does not record answers at all, and empty where the turn
// genuinely answered with nothing. An author is looking at the screen the words were said on, and
// echoing them back tripled the length of the first run anybody read; the model's journal is the
// only sight it has of what its own last turn did.
export function turnRecord(turn: number, line: string, outcome: TurnOutcome, detail: readonly string[] | null, notes: RunNotes = NO_NOTES): PlayedTurn {
  if (detail === null) return { notes, turn, line, outcome, detail: '' };
  const answered = detail.filter((each) => each.trim() !== '').join('\n');
  return { notes, turn, line, outcome, detail: answered === '' ? 'nothing happened' : answered };
}

export const outcomeOf = (result: CommandResult): TurnOutcome => (refusedLine(result) ? 'refused' : 'applied');

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
  return Number.isInteger(held.turn) && typeof held.outcome === 'string' && typeof held.detail === 'string' && typeof held.notes === 'object' && held.notes !== null;
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
