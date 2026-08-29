import { NOTE_FIELDS, parseDirectiveLine, printDirective, type NoteName } from '../content/sections/test';
import type { Answer } from './localized';

// What a played run records, for both harnesses that record one: the model's loop in
// scripts/playbot.ts and the author's own in the app. A run either of them produces is written as
// the `# test` section that replays it, so the fields a note carries are the `# test` grammar's and
// live with the kind rather than here.

export { NOTE_FIELDS, type NoteName };

export type RunNotes = { readonly [K in NoteName]: string };

export const NO_NOTES: RunNotes = Object.fromEntries(NOTE_FIELDS.map((field) => [field.name, ''])) as RunNotes;

export type TurnOutcome = 'applied' | 'refused';

export interface PlayedTurn {
  readonly turn: number;
  readonly outcome: TurnOutcome;
  readonly line: string;
  // What the engine settled the line into, in the canonical form a `# test` replays. A line the
  // engine refused settles into nothing, which is what `refused` written under it is for.
  readonly directives: readonly string[];
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
    if (said !== '') return [`${field.name}: ${said}`];
    return field.required ? [`${field.name}: (none)`] : [];
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

// The turns a player is still holding in mind, which is the whole of what any harness may reason
// about a run's own past from: there is no second store, and a turn older than this is gone.
export const journalWindow = (log: readonly RunLogEntry[]): readonly RunLogEntry[] => log.slice(-JOURNAL_WINDOW);

export function journalWindowText(log: readonly RunLogEntry[]): string {
  const windowed = journalWindow(log);
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
export function turnRecord(turn: number, line: string, outcome: TurnOutcome, directives: readonly string[], detail: readonly string[] | null, notes: RunNotes = NO_NOTES): PlayedTurn {
  if (detail === null) return { notes, turn, line, directives, outcome, detail: '' };
  const answered = detail.filter((each) => each.trim() !== '').join('\n');
  return { notes, turn, line, directives, outcome, detail: answered === '' ? 'nothing happened' : answered };
}

// A line the engine refused settled into no directive, so the record writes the line that was tried
// and marks it refused. A line in no form a `# test` can hold — a slash command, or an id the model
// invented — is said in a note instead, because a section that will not parse is a run nobody can
// read at all.
function attempted(line: string): string[] {
  try {
    const directive = parseDirectiveLine(line);
    if (directive) return [printDirective(directive), 'refused'];
  } catch {
    // no directive to write; the note below says what was tried
  }
  return [`note: refused, in no form a # test can hold: ${line}`];
}

const notesOf = (notes: RunNotes): string[] => NOTE_FIELDS.filter((field) => notes[field.name] !== '').map((field) => `${field.name}: ${notes[field.name]}`);

function turnLines(entry: RunLogEntry): string[] {
  if (!isPlayed(entry)) return [...(entry.outcome === 'moved' ? [`page: ${entry.detail}`] : []), ...notesOf(entry.notes)];
  return [...(entry.outcome === 'refused' ? attempted(entry.line) : entry.directives), ...notesOf(entry.notes)];
}

// A run as the `# test` that replays it, which is the only written form a run has: where it began,
// what each turn settled into, whether the engine refused it, what its player said about it, and —
// where its harness took one — the sheet it finished on. A turn neither harness's player took — a
// reply that could not be read, a reload that failed — is a fact about the harness rather than
// about the world, and is left to the harness's own report.
function runLines(kept: KeptRun, header?: RunHeader): string[] {
  const { run } = kept;
  return [
    `load: ${startsAtSave(kept.from) ? kept.from.save : startSaveId(run.id)}`,
    ...(header === undefined ? [] : [`note: played ${header.at} against ${header.built}`]),
    ...run.log.flatMap(turnLines),
    // The whole sheet rather than the keys it names, which is the form that has to earn itself: a
    // run is a record of a whole session, and what it claims is that replaying it reproduces that
    // world — including a key the state has stopped holding, which no narrower form can say.
    ...(kept.ends === undefined ? [] : [`expect: ${endSaveId(run.id)}`]),
  ];
}

// The saved game a run walks forward from, and the sheet it ends on, under the run's own name.
// Every harness that writes a run reads the names off these rather than spelling a suffix a second
// time.
export const startSaveId = (run: string): Answer => `${run}-start`;

export const endSaveId = (run: string): Answer => `${run}-end`;

export interface SectionAddress {
  readonly kind: Answer;
  readonly id: Answer;
}

// The kind a run is written as, which is also the kind whatever lists filed runs picks them out by.
export const RUN_SECTION = 'test';

const SAVE_SECTION = 'save';

const heading = (at: SectionAddress): string => `# ${at.kind} ${at.id}`;

// Every section a run of this name could be filed as, in the order they are written: where it
// began, the sheet it ended on, and what was done in between. A run brings whichever of them its
// own harness wrote — one starting at a `# save` the world already holds brings no start of its
// own, and one nobody asked a sheet of ends on none — so filing writes a subset of this and
// dropping takes back whatever of it is there. Neither act can be about a different set of sections
// than the other.
export function runSections(run: string): readonly [SectionAddress, SectionAddress, SectionAddress] {
  return [
    { kind: SAVE_SECTION, id: startSaveId(run) },
    { kind: SAVE_SECTION, id: endSaveId(run) },
    { kind: RUN_SECTION, id: run },
  ];
}

// A run as the sections it is filed as, each under the address it is filed at. Every harness that
// files a run — the app, the playbot, /create-test — writes these and not its own list, and
// whatever adopts one into a live registry walks the same pairs, so nothing can land under a name
// the written form does not use.
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

// A run outlives the tab it was played in. Holding one is what recording *is* — there is no
// second flag saying the mode is on, so a reload picks the run back up where it was.
export const PLAYTEST_SLOT = 'playtest';

// A run and the name it is filed under. The id is minted when the run starts rather than when it
// is written out, so a second run played the same sitting cannot land on the first one's heading.
export interface RecordedRun {
  readonly id: Answer;
  readonly log: readonly RunLogEntry[];
}

// Where a run walks forward from. There is always one — a run is a replay and a replay has to begin
// somewhere — and it is either the bytes its harness took when the run started or a `# save` the
// world already holds. A run that names one does not own it, so filing brings no save and dropping
// takes none.
export type RunStart = { readonly bytes: string } | { readonly save: Answer };

export const startsAtSave = (from: RunStart): from is { readonly save: Answer } => 'save' in from;

// A history that opens by loading a saved game has already said where the run begins, so that is
// where it begins and the line is not its first move. Writing both would state one fact twice,
// which is why nothing downstream of this asks again whether a run declares its own start.
export function runStart(history: readonly string[], taken: string): { readonly from: RunStart; readonly lines: readonly string[] } {
  const opening = history[0] === undefined ? null : parseDirectiveLine(history[0]);
  if (opening?.kind === 'load') return { from: { save: opening.save }, lines: history.slice(1) };
  return { from: { bytes: taken }, lines: history };
}

// The run as its harness keeps it: the run, where it walks forward from, and the sheet it ended on
// where its harness took one. An author starts recording partway through a session, so a replay
// beginning at a new game would begin somewhere else entirely. It holds the run rather than
// extending it, because nothing draws a saved game and neither end has any business on the surface
// the app hands its own panels.
export interface KeptRun {
  readonly run: RecordedRun;
  readonly from: RunStart;
  readonly ends?: string;
}

// A `# test` id is a path segment and a path segment opens with a letter, which an instant does not.
export const runId = (at: string): Answer => `run-${at.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;

export function serializeRun(kept: KeptRun): string {
  return JSON.stringify({ ...kept.run, from: kept.from, ends: kept.ends });
}

const isEntry = (value: unknown): value is RunLogEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const held = value as Record<string, unknown>;
  return Number.isInteger(held.turn) && typeof held.outcome === 'string' && typeof held.detail === 'string' && typeof held.notes === 'object' && held.notes !== null;
};

// A run kept before a start could be a name kept its bytes as plain text, and that is still what
// they are. Reading one as anything else would lose a sitting the author is in the middle of.
function keptStart(from: unknown): RunStart | null {
  if (typeof from === 'string') return { bytes: from };
  if (typeof from !== 'object' || from === null) return null;
  const held = from as Record<string, unknown>;
  if (typeof held.save === 'string') return { save: held.save };
  return typeof held.bytes === 'string' ? { bytes: held.bytes } : null;
}

// A run kept between sittings is read back leniently: a run this cannot make sense of is a run
// nobody can act on, and refusing to open the app over one would cost the author the session.
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
