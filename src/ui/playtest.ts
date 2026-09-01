import { runAsSections, isPlayed, type KeptRun, type RecordedRun, type RunHeader, NOTE_FIELDS, parseRun, PLAYTEST_SLOT, runId, serializeRun, turnRecord, type RunLogEntry, type RunNotes, type TurnOutcome } from '../runtime/runLog';
import type { SlotStore } from '../runtime/store';

export interface Feedback {
  readonly turn: number;
  readonly line: string;
  readonly held: RunNotes;
}

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
  run(): RecordedRun | null;
  kept(): KeptRun | null;
  start(from: string): void;
  stop(): void;
  opened(line: string, outcome: TurnOutcome, directives: readonly string[]): void;
  settled(directives: readonly string[]): void;
  moved(where: string): void;
  attach(turn: number, notes: RunNotes): void;
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
    kept: () => held,
    start: (from) => {
      held = { run: { id: runId(header().at), log: [] }, from: { bytes: from } };
      keep();
    },
    stop: () => {
      held = null;
      keep();
    },
    opened: (line, outcome, directives) => turning((log) => [...log, turnRecord(log.length + 1, line, outcome, directives, null)]),
    settled: (directives) => {
      if (directives.length === 0) return;
      turning((log) => {
        const started = [...log].reverse().find(isPlayed);
        if (started === undefined) return log;
        return log.map((entry) => (entry === started ? { ...started, directives: [...started.directives, ...directives] } : entry));
      });
    },
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
