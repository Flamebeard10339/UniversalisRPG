import type { CommandHelp, CommandOutput, MessageTone } from '../runtime/command';
import type { Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

export type LogKind = 'said' | 'place' | 'describe' | 'message' | 'detail';

// What the engine said, in the language being played. Every one of these came
// from a key, which is what a driver may show a player.
export interface PlayerLine {
  readonly id: number;
  readonly words: 'player';
  readonly kind: LogKind;
  readonly tone: MessageTone;
  readonly text: Localized;
  // How many times in a row the column has been told this. A skill worked at
  // for a minute says the same sentence a hundred times, and a hundred copies
  // of it is a column with nothing else left in it.
  readonly repeats: number;
}

// What the authoring tool said to whoever is driving it: a parser diagnostic, a
// staged section, the command table. `text` is a plain string because a
// `DslError` is `src/grammar`'s and a load diagnostic is `src/content`'s, both
// below the layer that declares the brand.
export interface ToolLine {
  readonly id: number;
  readonly words: 'tool';
  readonly kind: LogKind;
  readonly tone: MessageTone;
  readonly text: string;
  readonly repeats: number;
}

// The discriminant `CommandOutput`'s message arm carries, kept to the screen
// rather than dropped one function short of it: a shell that cannot ask whose
// words an entry is cannot grey a diagnostic, hide one, or refuse to show one.
export type LogEntry = PlayerLine | ToolLine;

// The column, plus the two things deciding whether a view repeats itself: the
// place the last entry left the player in, and the places already described.
export interface Transcript {
  entries: readonly LogEntry[];
  nextId: number;
  place: string | null;
  described: readonly string[];
}

type Written = Omit<PlayerLine, 'id' | 'repeats'> | Omit<ToolLine, 'id' | 'repeats'>;

interface Cursor {
  place: string | null;
  described: string[];
}

export function emptyTranscript(): Transcript {
  return { entries: [], nextId: 1, place: null, described: [] };
}

function helpLine(entry: CommandHelp): string {
  const spelling = [entry.name, ...entry.aliases].join(', ');
  return `${entry.argHint ? [spelling, entry.argHint].join(' ') : spelling} — ${entry.summary}`;
}

const said = (kind: LogKind, tone: MessageTone, text: Localized): Written => ({ words: 'player', kind, tone, text });

const noted = (kind: LogKind, tone: MessageTone, text: string): Written => ({ words: 'tool', kind, tone, text });

function fromView(current: PlayView, reread: boolean, cursor: Cursor): Written[] {
  const written: Written[] = current.said.map((text) => said('said', 'plain', text));
  if (!reread && current.location.id === cursor.place) return written;

  cursor.place = current.location.id;
  written.push(said('place', 'plain', current.location.title));
  const described = cursor.described.includes(current.location.id);
  if (!described) cursor.described.push(current.location.id);
  if ((reread || !described) && current.location.description) {
    written.push(said('describe', 'plain', current.location.description));
  }
  return written;
}

// A status, an inventory or a choice list is a re-read of what the surrounding
// shell shows continuously, so it says nothing the column has to keep.
function fromOutput(output: CommandOutput, cursor: Cursor): Written[] {
  switch (output.kind) {
    case 'message':
      return output.words === 'player'
        ? [said('message', output.tone, output.text), ...(output.detail ?? []).map((text) => said('detail', output.tone, text))]
        : [noted('message', output.tone, output.text), ...(output.detail ?? []).map((text) => noted('detail', output.tone, text))];
    case 'view':
      return fromView(output.view, output.reread, cursor);
    case 'help':
      return output.entries.map((entry) => noted('detail', 'plain', helpLine(entry)));
    case 'source':
      return output.lines.map((text) => noted('detail', 'plain', text));
    case 'authored':
      return output.blocks.flat().map((text) => noted('detail', 'plain', text));
    case 'status':
    case 'choices':
      return [];
  }
}

// The same line again, by everything about it a reader could tell apart. Whose
// words it is counts: a diagnostic that reads like something the world said is
// still not the same line.
const isRepeat = (held: LogEntry, line: Written): boolean =>
  held.words === line.words && held.kind === line.kind && held.tone === line.tone && held.text === line.text;

export function appendOutputs(transcript: Transcript, outputs: readonly CommandOutput[]): Transcript {
  const cursor: Cursor = { place: transcript.place, described: [...transcript.described] };
  const written = outputs.flatMap((output) => fromOutput(output, cursor));
  if (written.length === 0) return transcript;

  // A line the column has just been told again is counted rather than written
  // out: it keeps its place and its id, so nothing above it moves and the
  // acknowledgement it played when it first arrived is not played again.
  let nextId = transcript.nextId;
  const entries: LogEntry[] = [...transcript.entries];
  for (const line of written) {
    const held = entries[entries.length - 1];
    if (held !== undefined && isRepeat(held, line)) entries[entries.length - 1] = { ...held, repeats: held.repeats + 1 };
    else entries.push({ ...line, id: nextId++, repeats: 1 } as LogEntry);
  }
  return { entries, nextId, place: cursor.place, described: cursor.described };
}
