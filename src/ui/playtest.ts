import { runAsSections, isPlayed, type KeptRun, type RecordedRun, type RunHeader, NOTE_FIELDS, parseRun, partRunId, partsHeld, partSlot, PLAYTEST_SLOT, serializeRun, turnRecord, TURNS_PER_PART, type RunLogEntry, type RunNotes, type TurnOutcome } from '../runtime/runLog';
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

export const rollsOver = (log: readonly RunLogEntry[]): boolean => log.length >= TURNS_PER_PART;

export interface Recorder {
  run(): RecordedRun | null;
  kept(): KeptRun | null;
  parts(): number;
  everyPart(): readonly KeptRun[];
  start(from: string): void;
  stop(): void;
  opened(line: string, outcome: TurnOutcome, directives: readonly string[]): void;
  settled(directives: readonly string[]): void;
  moved(where: string): void;
  attach(turn: number, notes: RunNotes): void;
  written(): string;
}

export function createRecorder(store: SlotStore, complain: (text: string) => void, header: () => RunHeader, taken: () => string): Recorder {
  let held: KeptRun | null = null;

  const readingSlot = (name: string): KeptRun | null => {
    try {
      return parseRun(store.read(name)?.payload ?? null);
    } catch {
      return null;
    }
  };

  held = readingSlot(PLAYTEST_SLOT);

  const partsKept = (): number[] => {
    try {
      return partsHeld(store.list());
    } catch {
      return [];
    }
  };

  let parts = partsKept().length;

  const keep = (): void => {
    try {
      if (held === null) store.remove(PLAYTEST_SLOT);
      else store.write(PLAYTEST_SLOT, serializeRun(held));
    } catch (error) {
      complain(`the playtest run could not be kept: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const clear = (): void => {
    for (const part of partsKept()) {
      try {
        store.remove(partSlot(part));
      } catch (error) {
        complain(`part ${part} of the last run could not be dropped: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    parts = partsKept().length;
  };

  const rollOver = (): void => {
    if (held === null) return;
    const next = (partsKept().pop() ?? 0) + 1;
    try {
      store.write(partSlot(next), serializeRun(held));
    } catch (error) {
      complain(`part ${next} of this run could not be set aside, so it goes on in one piece: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    parts = next;
    held = { run: { id: partRunId(header().at, next + 1), log: [] }, from: { bytes: taken() } };
  };

  const turning = (next: (log: readonly RunLogEntry[]) => readonly RunLogEntry[]): void => {
    if (held === null) return;
    held = { ...held, run: { ...held.run, log: next(held.run.log) } };
    keep();
  };

  const appending = (next: (log: readonly RunLogEntry[]) => readonly RunLogEntry[]): void => {
    if (held !== null && rollsOver(held.run.log)) rollOver();
    turning(next);
  };

  const everyPart = (): readonly KeptRun[] => {
    const kept = partsKept().flatMap((part) => {
      const run = readingSlot(partSlot(part));
      return run === null ? [] : [run];
    });
    return held === null ? kept : [...kept, held];
  };

  return {
    run: () => held?.run ?? null,
    kept: () => held,
    parts: () => parts,
    everyPart,
    start: (from) => {
      clear();
      held = { run: { id: partRunId(header().at, 1), log: [] }, from: { bytes: from } };
      keep();
    },
    stop: () => {
      clear();
      held = null;
      keep();
    },
    opened: (line, outcome, directives) => appending((log) => [...log, turnRecord(log.length + 1, line, outcome, directives, null)]),
    settled: (directives) => {
      if (directives.length === 0) return;
      turning((log) => {
        const started = [...log].reverse().find(isPlayed);
        if (started === undefined) return log;
        return log.map((entry) => (entry === started ? { ...started, directives: [...started.directives, ...directives] } : entry));
      });
    },
    moved: (where) =>
      appending((log) => {
        const open = log[log.length - 1];
        if (open !== undefined && !isPlayed(open) && open.outcome === 'moved' && open.detail === where) return log;
        return [...log, { turn: log.length + 1, outcome: 'moved', detail: where, notes: emptyNotes() }];
      }),
    attach: (turn, notes) => turning((log) => attached(log, turn, notes)),
    written: () =>
      everyPart()
        .flatMap((part) => runAsSections(part, header()))
        .map((block) => block.join('\n'))
        .join('\n\n'),
  };
}
