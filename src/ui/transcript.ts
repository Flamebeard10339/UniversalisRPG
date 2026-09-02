import type { CommandHelp, CommandOutput, MessageTone } from '../runtime/command';
import type { Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

export type LogKind = 'said' | 'place' | 'describe' | 'message' | 'detail';

export interface PlayerLine {
  readonly id: number;
  readonly words: 'player';
  readonly kind: LogKind;
  readonly tone: MessageTone;
  readonly text: Localized;
  readonly repeats: number;
}

export interface ToolLine {
  readonly id: number;
  readonly words: 'tool';
  readonly kind: LogKind;
  readonly tone: MessageTone;
  readonly text: string;
  readonly repeats: number;
}

export type LogEntry = PlayerLine | ToolLine;

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
    case 'map':
      return [];
    default: {
      const unreached: never = output;
      return unreached;
    }
  }
}

const isRepeat = (held: LogEntry, line: Written): boolean =>
  held.words === line.words && held.kind === line.kind && held.tone === line.tone && held.text === line.text;

export function appendOutputs(transcript: Transcript, outputs: readonly CommandOutput[]): Transcript {
  const cursor: Cursor = { place: transcript.place, described: [...transcript.described] };
  const written = outputs.flatMap((output) => fromOutput(output, cursor));
  if (written.length === 0) return transcript;

  let nextId = transcript.nextId;
  const entries: LogEntry[] = [...transcript.entries];
  for (const line of written) {
    const held = entries[entries.length - 1];
    if (held !== undefined && isRepeat(held, line)) entries[entries.length - 1] = { ...held, repeats: held.repeats + 1 };
    else entries.push({ ...line, id: nextId++, repeats: 1 } as LogEntry);
  }
  return { entries, nextId, place: cursor.place, described: cursor.described };
}

export { TRANSCRIPT_SLOT } from '../runtime/saveSlots';

export const TRANSCRIPT_KEPT = 200;

export function trimmedTranscript(transcript: Transcript): Transcript {
  return transcript.entries.length <= TRANSCRIPT_KEPT ? transcript : { ...transcript, entries: transcript.entries.slice(-TRANSCRIPT_KEPT) };
}

const TONES: readonly MessageTone[] = ['plain', 'ok', 'warn', 'error'];

const KINDS: readonly LogKind[] = ['said', 'place', 'describe', 'message', 'detail'];

export type Minting = (text: string) => Localized;

function readEntry(value: unknown, minted: Minting): LogEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, words, kind, tone, text, repeats } = value as Partial<LogEntry>;
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  if (typeof repeats !== 'number' || !Number.isFinite(repeats)) return null;
  if (typeof text !== 'string') return null;
  if (!KINDS.includes(kind as LogKind) || !TONES.includes(tone as MessageTone)) return null;
  if (words === 'player') return { id, words, kind: kind as LogKind, tone: tone as MessageTone, text: minted(text), repeats };
  if (words === 'tool') return { id, words, kind: kind as LogKind, tone: tone as MessageTone, text, repeats };
  return null;
}

export function keptTranscript(text: string | null, minted: Minting): Transcript | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { entries, nextId, place, described } = parsed as Partial<Transcript>;
  if (!Array.isArray(entries) || typeof nextId !== 'number' || !Number.isFinite(nextId)) return null;
  if (place !== null && typeof place !== 'string') return null;
  if (!Array.isArray(described) || described.some((each) => typeof each !== 'string')) return null;
  const read = entries.map((entry) => readEntry(entry, minted));
  if (read.some((entry) => entry === null)) return null;
  return trimmedTranscript({ entries: read as LogEntry[], nextId, place, described: described as string[] });
}
