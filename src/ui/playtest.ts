import { describeRun, isPlayed, type RunHeader, NOTE_FIELDS, parseRun, PLAYTEST_SLOT, serializeRun, turnRecord, type RunLogEntry, type RunNotes, type TurnOutcome } from '../runtime/runLog';
import type { SlotStore } from '../runtime/store';

// The app's own end of the playtest loop, and the counterpart of runPlaybot: it holds the run,
// the model's loop holds its own, and both write the shape src/runtime/runLog.ts declares.

export interface Feedback {
  readonly turn: number;
  readonly line: string;
  readonly held: RunNotes;
}

// Notes are about the turn that has just happened, whichever kind it was. An author writes them
// having seen what the turn did, so attaching them to whatever comes next would say the opposite of
// what they meant — and with nothing recorded there is nothing to be about.
export function feedbackOn(log: readonly RunLogEntry[]): Feedback | null {
  const entry = log[log.length - 1];
  if (entry === undefined) return null;
  return { turn: entry.turn, line: isPlayed(entry) ? entry.line : entry.detail, held: entry.notes };
}

export function attached(log: readonly RunLogEntry[], turn: number, notes: RunNotes): RunLogEntry[] {
  return log.map((entry) => (entry.turn === turn ? { ...entry, notes } : entry));
}

export const edited = (held: RunNotes, field: 'note' | 'expected' | 'confusion' | 'blocked', said: string): RunNotes => ({ ...held, [field]: said });

export const emptyNotes = (): RunNotes => Object.fromEntries(NOTE_FIELDS.map((field) => [field.name, ''])) as RunNotes;

export const turnsPlayed = (log: readonly RunLogEntry[]): number => log.length;

export interface Recorder {
  // The run being recorded, or null when none is. Holding one is the whole of being in playtest
  // mode; a second flag beside it would be the thing that could disagree with it.
  run(): readonly RunLogEntry[] | null;
  start(): void;
  stop(): void;
  // What the player picked, and whether the engine took it. What it answered with is not recorded:
  // the author read it on the screen it was said on.
  opened(line: string, outcome: TurnOutcome): void;
  // Where in the app the player went, which the engine never hears about and which they may still
  // have something to say about.
  moved(where: string): void;
  attach(turn: number, notes: RunNotes): void;
  written(): string;
}

export function createRecorder(store: SlotStore, complain: (text: string) => void, header: () => RunHeader): Recorder {
  let log: RunLogEntry[] | null = null;

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
      keep();
    },
    stop: () => {
      log = null;
      keep();
    },
    opened: (line, outcome) => {
      if (log === null) return;
      log = [...log, turnRecord(log.length + 1, line, outcome, null)];
      keep();
    },
    moved: (where) => {
      if (log === null) return;
      const open = log[log.length - 1];
      if (open !== undefined && !isPlayed(open) && open.outcome === 'moved' && open.detail === where) return;
      log = [...log, { turn: log.length + 1, outcome: 'moved', detail: where, notes: emptyNotes() }];
      keep();
    },
    attach: (turn, notes) => {
      if (log === null) return;
      log = attached(log, turn, notes);
      keep();
    },
    written: () => (log === null ? '' : describeRun(log, header())),
  };
}
