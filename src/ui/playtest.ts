import { runAsSections, isPlayed, type KeptRun, type RecordedRun, type RunHeader, NOTE_FIELDS, parseRun, PLAYTEST_SLOT, runId, serializeRun, turnRecord, type RunLogEntry, type RunNotes, type TurnOutcome } from '../runtime/runLog';
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
  run(): RecordedRun | null;
  // The saved game the run walks forward from, taken when recording starts rather than when the
  // session opened: an author who plays twenty turns before starting a run means them.
  start(from: string): void;
  stop(): void;
  // What the player picked, and whether the engine took it. What it answered with is not recorded:
  // the author read it on the screen it was said on.
  opened(line: string, outcome: TurnOutcome, directives: readonly string[]): void;
  // Where in the app the player went, which the engine never hears about and which they may still
  // have something to say about.
  moved(where: string): void;
  attach(turn: number, notes: RunNotes): void;
  // The run as the `# test` section that replays it, under the name it was minted with.
  written(): string;
}

export function createRecorder(store: SlotStore, complain: (text: string) => void, header: () => RunHeader): Recorder {
  let held: KeptRun | null = null;

  try {
    held = parseRun(store.read(PLAYTEST_SLOT)?.payload ?? null);
  } catch {
    held = null;
  }

  const keep = (): void => {
    try {
      if (held === null) store.remove(PLAYTEST_SLOT);
      else store.write(PLAYTEST_SLOT, serializeRun(held));
    } catch (error) {
      complain(`the playtest run could not be kept: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const turning = (next: (log: readonly RunLogEntry[]) => readonly RunLogEntry[]): void => {
    if (held === null) return;
    held = { ...held, run: { ...held.run, log: next(held.run.log) } };
    keep();
  };

  return {
    run: () => held?.run ?? null,
    start: (from) => {
      held = { run: { id: runId(header().at), log: [] }, from };
      keep();
    },
    stop: () => {
      held = null;
      keep();
    },
    opened: (line, outcome, directives) => turning((log) => [...log, turnRecord(log.length + 1, line, outcome, directives, null)]),
    moved: (where) =>
      turning((log) => {
        const open = log[log.length - 1];
        if (open !== undefined && !isPlayed(open) && open.outcome === 'moved' && open.detail === where) return log;
        return [...log, { turn: log.length + 1, outcome: 'moved', detail: where, notes: emptyNotes() }];
      }),
    attach: (turn, notes) => turning((log) => attached(log, turn, notes)),
    written: () =>
      held === null
        ? ''
        : runAsSections(held, header())
            .map((block) => block.join('\n'))
            .join('\n\n'),
  };
}
