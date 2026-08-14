import type { CommandHelp, CommandOutput, MessageTone } from '../runtime/command';
import type { PlayView } from '../runtime/session';

export type LogKind = 'said' | 'place' | 'describe' | 'message' | 'detail';

export interface LogEntry {
  id: number;
  kind: LogKind;
  tone: MessageTone;
  text: string;
}

// The column, plus the two things deciding whether a view repeats itself: the
// place the last entry left the player in, and the places already described.
export interface Transcript {
  entries: readonly LogEntry[];
  nextId: number;
  place: string | null;
  described: readonly string[];
}

interface Written {
  kind: LogKind;
  tone: MessageTone;
  text: string;
}

interface Cursor {
  place: string | null;
  described: string[];
}

export function emptyTranscript(): Transcript {
  return { entries: [], nextId: 1, place: null, described: [] };
}

function helpLine(entry: CommandHelp): string {
  const spelling = [entry.name, ...entry.aliases].join(', ');
  return `${entry.argHint ? `${spelling} ${entry.argHint}` : spelling} — ${entry.summary}`;
}

function fromView(current: PlayView, reread: boolean, cursor: Cursor): Written[] {
  const written: Written[] = current.said.map((text) => ({ kind: 'said', tone: 'plain', text }));
  if (!reread && current.location.id === cursor.place) return written;

  cursor.place = current.location.id;
  written.push({ kind: 'place', tone: 'plain', text: current.location.title });
  const described = cursor.described.includes(current.location.id);
  if (!described) cursor.described.push(current.location.id);
  if ((reread || !described) && current.location.description) {
    written.push({ kind: 'describe', tone: 'plain', text: current.location.description });
  }
  return written;
}

// A status, an inventory or a choice list is a re-read of what the surrounding
// shell shows continuously, so it says nothing the column has to keep.
function fromOutput(output: CommandOutput, cursor: Cursor): Written[] {
  switch (output.kind) {
    case 'message':
      return [
        { kind: 'message', tone: output.tone, text: output.text },
        ...(output.detail ?? []).map((text): Written => ({ kind: 'detail', tone: output.tone, text })),
      ];
    case 'view':
      return fromView(output.view, output.reread, cursor);
    case 'help':
      return output.entries.map((entry) => ({ kind: 'detail', tone: 'plain', text: helpLine(entry) }));
    case 'source':
      return output.lines.map((text) => ({ kind: 'detail', tone: 'plain', text }));
    case 'authored':
      return output.blocks.flat().map((text) => ({ kind: 'detail', tone: 'plain', text }));
    case 'status':
    case 'choices':
      return [];
  }
}

export function appendOutputs(transcript: Transcript, outputs: readonly CommandOutput[]): Transcript {
  const cursor: Cursor = { place: transcript.place, described: [...transcript.described] };
  const written = outputs.flatMap((output) => fromOutput(output, cursor));
  if (written.length === 0) return transcript;

  let nextId = transcript.nextId;
  const entries = [...transcript.entries, ...written.map((line) => ({ id: nextId++, ...line }))];
  return { entries, nextId, place: cursor.place, described: cursor.described };
}
