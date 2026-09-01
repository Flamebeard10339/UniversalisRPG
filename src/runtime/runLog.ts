import { NOTE_FIELDS, parseDirectiveLine, printDirective, type NoteName } from '../content/sections/test';
import type { Answer } from './localized';

export { NOTE_FIELDS, type NoteName };

export type RunNotes = { readonly [K in NoteName]: string };

export const NO_NOTES: RunNotes = Object.fromEntries(NOTE_FIELDS.map((field) => [field.name, ''])) as RunNotes;

export type TurnOutcome = 'applied' | 'refused';

export interface PlayedTurn {
  readonly turn: number;
  readonly outcome: TurnOutcome;
  readonly line: string;
  readonly directives: readonly string[];
  readonly detail: string;
  readonly notes: RunNotes;
}

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
    if (said !== '') return [`${field.name}: ${said}`];
    return field.required ? [`${field.name}: (none)`] : [];
  }).join('; ');
}

export const said = (notes: RunNotes): boolean => NOTE_FIELDS.some((field) => notes[field.name] !== '');

export function describeEntry(entry: RunLogEntry): string {
  if (!isPlayed(entry)) return `turn ${entry.turn} [${entry.outcome}] ${entry.detail}${said(entry.notes) ? ` — ${noted(entry.notes)}` : ''}`;
  return `turn ${entry.turn} [${entry.outcome}] ${entry.line} — ${noted(entry.notes)}${entry.detail === '' ? '' : `; result: ${entry.detail}`}`;
}

export interface RunHeader {
  readonly at: string;
  readonly built: string;
}

export const describeRun = (log: readonly RunLogEntry[], header?: RunHeader): string =>
  [...(header === undefined ? [] : [`# played ${header.at} against ${header.built}`, '']), ...log.map(describeEntry)].join('\n');

export const journalWindow = (log: readonly RunLogEntry[]): readonly RunLogEntry[] => log.slice(-JOURNAL_WINDOW);

export function journalWindowText(log: readonly RunLogEntry[]): string {
  const windowed = journalWindow(log);
  if (windowed.length === 0) return '(run just started; no turns yet)';
  return windowed.map(describeEntry).join('\n');
}

export const blocking = (entry: RunLogEntry): string => entry.notes.blocked;

export function turnRecord(turn: number, line: string, outcome: TurnOutcome, directives: readonly string[], detail: readonly string[] | null, notes: RunNotes = NO_NOTES): PlayedTurn {
  if (detail === null) return { notes, turn, line, directives, outcome, detail: '' };
  const answered = detail.filter((each) => each.trim() !== '').join('\n');
  return { notes, turn, line, directives, outcome, detail: answered === '' ? 'nothing happened' : answered };
}

function attempted(line: string): string[] {
  try {
    const directive = parseDirectiveLine(line);
    if (directive) return [printDirective(directive), 'refused'];
  } catch {
  }
  return [`note: refused, in no form a # test can hold: ${line}`];
}

const notesOf = (notes: RunNotes): string[] => NOTE_FIELDS.filter((field) => notes[field.name] !== '').map((field) => `${field.name}: ${notes[field.name]}`);

function turnLines(entry: RunLogEntry): string[] {
  if (!isPlayed(entry)) return [...(entry.outcome === 'moved' ? [`page: ${entry.detail}`] : []), ...notesOf(entry.notes)];
  return [...(entry.outcome === 'refused' ? attempted(entry.line) : entry.directives), ...notesOf(entry.notes)];
}

function runLines(kept: KeptRun, header?: RunHeader): string[] {
  const { run } = kept;
  return [
    `load: ${startsAtSave(kept.from) ? kept.from.save : startSaveId(run.id)}`,
    ...(header === undefined ? [] : [`note: played ${header.at} against ${header.built}`]),
    ...run.log.flatMap(turnLines),
    ...(kept.ends === undefined ? [] : [`expect: ${endSaveId(run.id)}`]),
  ];
}

export const startSaveId = (run: string): Answer => `${run}-start`;

export const endSaveId = (run: string): Answer => `${run}-end`;

export interface SectionAddress {
  readonly kind: Answer;
  readonly id: Answer;
}

export const RUN_SECTION = 'test';

const SAVE_SECTION = 'save';

const heading = (at: SectionAddress): string => `# ${at.kind} ${at.id}`;

export function runSections(run: string): readonly [SectionAddress, SectionAddress, SectionAddress] {
  return [
    { kind: SAVE_SECTION, id: startSaveId(run) },
    { kind: SAVE_SECTION, id: endSaveId(run) },
    { kind: RUN_SECTION, id: run },
  ];
}

export function runBlocks(kept: KeptRun, header?: RunHeader): (readonly [SectionAddress, readonly string[]])[] {
  const [start, end, walked] = runSections(kept.run.id);
  return [
    ...(startsAtSave(kept.from) ? [] : [[start, [kept.from.bytes]] as const]),
    ...(kept.ends === undefined ? [] : [[end, [kept.ends]] as const]),
    [walked, runLines(kept, header)] as const,
  ];
}

export function runAsSections(kept: KeptRun, header?: RunHeader): string[][] {
  return runBlocks(kept, header).map(([at, body]) => [heading(at), ...body]);
}

export const PLAYTEST_SLOT = 'playtest';

export interface RecordedRun {
  readonly id: Answer;
  readonly log: readonly RunLogEntry[];
}

export type RunStart = { readonly bytes: string } | { readonly save: Answer };

export const startsAtSave = (from: RunStart): from is { readonly save: Answer } => 'save' in from;

export function runStart(history: readonly string[], taken: string): { readonly from: RunStart; readonly lines: readonly string[] } {
  const opening = history[0] === undefined ? null : parseDirectiveLine(history[0]);
  if (opening?.kind === 'load') return { from: { save: opening.save }, lines: history.slice(1) };
  return { from: { bytes: taken }, lines: history };
}

export interface KeptRun {
  readonly run: RecordedRun;
  readonly from: RunStart;
  readonly ends?: string;
}

export const runId = (at: string): Answer => `run-${at.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;

export function serializeRun(kept: KeptRun): string {
  return JSON.stringify({ ...kept.run, from: kept.from, ends: kept.ends });
}

const isEntry = (value: unknown): value is RunLogEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const held = value as Record<string, unknown>;
  return Number.isInteger(held.turn) && typeof held.outcome === 'string' && typeof held.detail === 'string' && typeof held.notes === 'object' && held.notes !== null;
};

function keptStart(from: unknown): RunStart | null {
  if (typeof from === 'string') return { bytes: from };
  if (typeof from !== 'object' || from === null) return null;
  const held = from as Record<string, unknown>;
  if (typeof held.save === 'string') return { save: held.save };
  return typeof held.bytes === 'string' ? { bytes: held.bytes } : null;
}

export function parseRun(payload: string | null): KeptRun | null {
  if (payload === null) return null;
  try {
    const held = JSON.parse(payload) as Record<string, unknown>;
    if (typeof held !== 'object' || held === null || typeof held.id !== 'string') return null;
    const from = keptStart(held.from);
    if (from === null) return null;
    if (!Array.isArray(held.log) || !held.log.every(isEntry)) return null;
    return { run: { id: held.id, log: held.log as RunLogEntry[] }, from, ends: typeof held.ends === 'string' ? held.ends : undefined };
  } catch {
    return null;
  }
}
