import { describeRun, isPlayed, NOTE_FIELDS, parseRun, PLAYTEST_SLOT, serializeRun, turnRecord, type PlayedTurn, type RunLogEntry, type RunNotes } from '../runtime/runLog';
import type { SlotStore } from '../runtime/store';

// The app's own end of the playtest loop, and the counterpart of runPlaybot: it holds the run,
// the model's loop holds its own, and both write the shape src/runtime/runLog.ts declares.

export interface Feedback {
  readonly turn: number;
  readonly line: string;
  readonly held: RunNotes;
}

const notesOf = (entry: RunLogEntry): RunNotes =>
  Object.fromEntries(NOTE_FIELDS.map((field) => [field.name, isPlayed(entry) ? entry[field.name] : ''])) as RunNotes;

// Notes are about the turn that has just been answered, which is the last one played. An author
// writes them having seen what the line did, so attaching them to whatever comes next would say
// the opposite of what they meant — and with nothing played there is nothing to be about.
export function feedbackOn(log: readonly RunLogEntry[]): Feedback | null {
  for (let at = log.length - 1; at >= 0; at -= 1) {
    const entry = log[at];
    if (isPlayed(entry)) return { turn: entry.turn, line: entry.line, held: notesOf(entry) };
  }
  return null;
}

export function attached(log: readonly RunLogEntry[], turn: number, notes: RunNotes): RunLogEntry[] {
  return log.map((entry) => (entry.turn === turn && isPlayed(entry) ? { ...entry, ...notes } : entry));
}

export const edited = (held: RunNotes, field: 'note' | 'expected' | 'confusion' | 'blocked', said: string): RunNotes => ({ ...held, [field]: said });

export const emptyNotes = (): RunNotes => Object.fromEntries(NOTE_FIELDS.map((field) => [field.name, ''])) as RunNotes;

export const turnsPlayed = (log: readonly RunLogEntry[]): number => log.filter(isPlayed).length;

export interface Recorder {
  // The run being recorded, or null when none is. Holding one is the whole of being in playtest
  // mode; a second flag beside it would be the thing that could disagree with it.
  run(): readonly RunLogEntry[] | null;
  start(): void;
  stop(): void;
  // What the player picked, whether the engine took it, and where in the transcript its answer
  // begins.
  opened(line: string, outcome: PlayedTurn['outcome'], from: number): void;
  // Everything the transcript has gained since, which is how a live action's ending lines reach
  // the turn that began it rather than the next one.
  settle(said: (from: number) => readonly string[]): boolean;
  attach(turn: number, notes: RunNotes): void;
  written(): string;
}

export function createRecorder(store: SlotStore, complain: (text: string) => void): Recorder {
  let log: RunLogEntry[] | null = null;
  let answering = 0;

  try {
    log = parseRun(store.read(PLAYTEST_SLOT)?.payload ?? null);
  } catch {
    log = null;
  }

  const keep = (): void => {
    try {
      if (log === null) store.remove(PLAYTEST_SLOT);
      else store.write(PLAYTEST_SLOT, serializeRun(log));
    } catch (error) {
      complain(`the playtest run could not be kept: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return {
    run: () => log,
    start: () => {
      log = [];
      answering = 0;
      keep();
    },
    stop: () => {
      log = null;
      keep();
    },
    opened: (line, outcome, from) => {
      if (log === null) return;
      answering = from;
      log = [...log, turnRecord(log.length + 1, line, outcome, [])];
    },
    settle: (said) => {
      if (log === null || log.length === 0) return false;
      const open = log[log.length - 1];
      if (!isPlayed(open)) return false;
      const settled = turnRecord(open.turn, open.line, open.outcome, said(answering), open);
      if (open.detail === settled.detail) return false;
      log = [...log.slice(0, -1), settled];
      keep();
      return true;
    },
    attach: (turn, notes) => {
      if (log === null) return;
      log = attached(log, turn, notes);
      keep();
    },
    written: () => describeRun(log ?? []),
  };
}
