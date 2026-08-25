import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { qualify } from '../content/namespace';
import type { Addressed } from '../content/completion';
import { declaredBy } from '../content/references';
import type { ModuleSource } from '../content/universe';
import { shadowed } from './authoringSurface';
import { devRefusal } from './devMode';
import { type AuthoringContext, createTicker, newContext, outcomeOf, refusedLine, resumptionNotes, type CommandContext, type CommandOutput, type LiveProgress, type LiveRun, runLine, type Ticker } from '../runtime/command';
import { type Localizer } from '../runtime/localized';
import { openUniverse, openWithLocalCleared, type OpenedUniverse, type UniverseProblem } from '../runtime/openUniverse';
import { dropRun, fileRun, stagedRuns, type FiledRun } from '../runtime/runFiling';
import type { Answer } from '../runtime/localized';
import type { Directive } from '../content/sections/test';
import { advances, clamped, REPLAY_SPEED } from './replay';
import { type RecordedRun, type RunHeader, type RunNotes } from '../runtime/runLog';
import { createSaveContext, type SaveContext } from '../runtime/saveSlots';
import { sessionLocalizer, serializeSession, startSession, testSteps, view, walkTest, type PlayView } from '../runtime/session';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { EDITOR_SLOT } from './editorMemory';
import { appendOutputs, emptyTranscript, type Transcript } from './transcript';
import { createRecorder } from './playtest';
import { createTransientChannel, type TransientChannel } from './transient';

export const REMEDIES = ['clear-local', 'reopen'] as const;

// Where a stopped run was filed, or why it could not be. Only a run that files clears the slot: the
// author who cannot land one has not stopped wanting it, and dropping it here is the one loss
// nothing else in the app could make good.
export type Filing = { readonly filed: true; readonly at: string } | { readonly filed: false; readonly because: string };

export type Remedy = (typeof REMEDIES)[number];

const asRead = (problems: readonly UniverseProblem[]): string => problems.map((problem) => `${problem.modules.join(' ')}: ${problem.message}`).join('\n');

function remediesFor(problems: readonly UniverseProblem[], ifCleared: () => readonly UniverseProblem[] | null): readonly Remedy[] {
  if (problems.length === 0) return [];
  const cleared = ifCleared();
  return cleared !== null && asRead(cleared) !== asRead(problems) ? ['clear-local', 'reopen'] : ['reopen'];
}

// A `# test` being watched happen: which one, what it is made of, how far the cursor has walked,
// and where the record and the world parted. A replay is a function of that cursor — the state, the
// page and what has been said all follow from it — which is why there is nothing else here.
export interface ReplaySnapshot {
  readonly test: Answer;
  readonly steps: readonly Directive[];
  readonly at: number;
  readonly playing: boolean;
  readonly delay: number;
  readonly failure: string | null;
}

export interface ReplayControls {
  // The test to watch, or null to stop watching. The world is left standing where the replay left
  // it, since that is usually the thing the author opened one to look at.
  watching(test: string | null): void;
  at(step: number): void;
  playing(on: boolean): void;
  every(seconds: number): void;
}

export interface DriverSnapshot {
  view: PlayView;
  transcript: Transcript;
  live: LiveProgress | null;
  problems: readonly UniverseProblem[];
  remedies: readonly Remedy[];
  dev: boolean;
  speed: number;
  // The run being recorded, or null when none is. Holding one is the whole of being in playtest
  // mode; there is no second flag to disagree with it.
  playtest: RecordedRun | null;
  // The run being watched, or null when none is.
  replay: ReplaySnapshot | null;
}

export interface PlaytestControls {
  start(): void;
  // Stopping files the run into the local changes, adopting them as `/dsl` does, so the `# test` is
  // in the registry at once and a reload runs through what was just played. A run the game could
  // not be left holding is refused, said, and still recorded afterwards.
  stop(): Filing;
  attach(turn: number, notes: RunNotes): void;
  // Where in the app the player went. The engine never hears about a page, and a player who has
  // just navigated somewhere is a player with something to say about having navigated there.
  moved(where: string): void;
  // The run as the `# test` section that replays it, under the name it was minted with.
  written(): string;
  // The runs already filed into the game, read fresh rather than kept in the snapshot: a list only
  // whoever is drawing it wants, and one the engine's own clock has no reason to recompute.
  filed(): readonly FiledRun[];
  // Dropping one, both its sections in the one edit that files them.
  drop(run: string): void;
}

export interface Driver {
  subscribe(listener: () => void): () => void;
  snapshot(): DriverSnapshot;
  transient: TransientChannel;
  send(line: string): void;
  choose(position: number): void;
  answer(key: string, value: string): void;
  open(item: string): void;
  swap(one: string, other: string): void;
  readQuest(quest: string): void;
  readStat(stat: string): void;
  cancel(): void;
  localizer(): Localizer;
  serialized(): string;
  localChanges(): string | null;
  baseSources(): readonly ModuleSource[];
  declared(): readonly Addressed[];
  editorMemory: { read(): string | null; write(text: string): void };
  note(text: string): void;
  reopen(): void;
  clearLocalChanges(): void;
  playtest: PlaytestControls;
  replay: ReplayControls;
}

export interface DriverOptions {
  transient?: TransientChannel;
  ticker?: Ticker;
  slots?: SlotDriver;
  now?: () => number;
}

interface Opening {
  context: CommandContext;
  output: CommandOutput[];
}

function open(opened: OpenedUniverse, authoring: AuthoringContext, save: SaveContext, before: readonly CommandOutput[]): Opening {
  const { session } = opened;
  const first = view(session);
  return {
    context: newContext(session, first, { driving: true, authoring, save, recorder: { history: [], startSave: serializeSession(session) } }),
    output: [
      ...before,
      ...opened.problems.map((problem): CommandOutput => ({ kind: 'message', words: 'tool', tone: 'warn', text: problem.message })),
      ...resumptionNotes(opened.resumed),
      { kind: 'view', view: first, reread: false },
    ],
  };
}

const because = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createDriver(sources: readonly ModuleSource[], options: DriverOptions = {}): Driver {
  const listeners = new Set<() => void>();
  let current!: DriverSnapshot;
  let context!: CommandContext;

  const save = createSaveContext(options.slots ?? memoryDriver(), options.now ?? (() => Date.now()));
  const stored = (): string => save.store.read(LOCAL_CHANGES_MODULE_ID)?.payload ?? '';

  const shipped = [...sources];

  const header = (): RunHeader => ({ at: new Date(save.now()).toISOString(), built: typeof __BUILT_FROM__ === 'string' ? __BUILT_FROM__ : 'unknown' });

  // A run is read back out of its slot before anything else, so a reload lands mid-playtest with
  // what was already played rather than starting a second run beside it.
  const record = createRecorder(save.store, (text) => complain(text), header);

  const warn = (text: string, detail?: string[]): CommandOutput => (detail ? { kind: 'message', words: 'tool', tone: 'warn', text, detail } : { kind: 'message', words: 'tool', tone: 'warn', text });

  let replay: ReplaySnapshot | null = null;
  let authoring!: AuthoringContext;

  const settled = (next: Omit<DriverSnapshot, 'dev' | 'speed' | 'playtest' | 'replay'>): DriverSnapshot => ({ ...next, dev: save.dev, speed: context.live.speed, playtest: record.run(), replay });

  const readLocal = (): { text: string; complaints: CommandOutput[] } => {
    try {
      return { text: stored(), complaints: [] };
    } catch (error) {
      return { text: '', complaints: [warn(`local changes could not be read: ${because(error)}`)] };
    }
  };

  const shadowing = (local: string): CommandOutput[] => {
    const found = shadowed([...shipped, { name: LOCAL_CHANGES_MODULE_ID, text: local }]);
    if (found.length === 0) return [];
    return [warn(`${LOCAL_CHANGES_MODULE_ID} shadows ${found.length} shipped section(s), so editing the file will not change what is played`, found.map((each) => `# ${each.kind} ${each.address} — also in ${each.modules.join(', ')}`))];
  };

  const openOnce = (before: Transcript): void => {
    const local = readLocal();
    const localSource: ModuleSource = { name: LOCAL_CHANGES_MODULE_ID, text: local.text };
    const sources = local.text.trim() === '' ? shipped : [...shipped, localSource];
    const opened = openUniverse(sources, { save });

    authoring = {
      baseSources: shipped,
      dependencies: opened.modules.filter((id) => id !== LOCAL_CHANGES_MODULE_ID),
      localSource,
      writeLocalChanges: (text) => void save.store.write(LOCAL_CHANGES_MODULE_ID, text),
      readLocalChanges: stored,
    };

    const said = [...local.complaints, ...(opened.modules.includes(LOCAL_CHANGES_MODULE_ID) ? shadowing(local.text) : [])];
    const opening = open(opened, authoring, save, said);
    context = opening.context;
    current = settled({
      view: opening.context.view,
      transcript: appendOutputs(before, opening.output),
      live: null,
      problems: opened.problems,
      remedies: remediesFor(opened.problems, () => openWithLocalCleared(sources, authoring.dependencies)?.problems ?? null),
    });
  };

  openOnce(emptyTranscript());

  const ticker = options.ticker ?? createTicker();
  let running: LiveRun | null = null;
  let stopTicking: (() => void) | null = null;

  const publish = (): void => {
    for (const listener of listeners) listener();
  };

  const changing = (act: () => void): void => {
    act();
    current = { ...current, playtest: record.run() };
    publish();
  };

  const complain = (text: string): void => {
    current = settled({ ...current, transcript: appendOutputs(current.transcript, [{ kind: 'message', words: 'tool', tone: 'warn', text }]) });
    publish();
  };

  const close = (cancelled: boolean): void => {
    const run = running;
    if (!run) return;
    running = null;
    stopTicking?.();
    stopTicking = null;
    const result = run.end(cancelled);
    current = settled({ ...current, view: context.view, live: null, transcript: appendOutputs(current.transcript, result.output) });
    publish();
  };

  const advance = (elapsedMs: number): void => {
    const run = running;
    if (!run) return;
    const progress = run.tick(elapsedMs);
    current = settled({
      ...current,
      view: progress.view,
      live: progress.active ? progress : null,
      transcript: appendOutputs(current.transcript, [{ kind: 'view', view: progress.view, reread: false }]),
    });
    if (!progress.active) {
      close(false);
      return;
    }
    publish();
  };

  // What the player picked, rather than how the line spelled it. Answering a numbered choice is the
  // one place the two differ — the engine's protocol for picking one is its position, and a run log
  // of 1, 2, 3 says nothing to whoever reads it afterwards. Read off the line rather than off which
  // control sent it, because a tap on the map sends the same position the choice list does.
  const picked = (line: string): string => {
    const at = /^[ 	]*(\d+)[ 	]*$/.exec(line);
    return at === null ? line : (current.view.choices[Number(at[1]) - 1]?.id ?? line);
  };

  const sending = (line: string): void => {
    const chose = picked(line);
    const refusal = devRefusal(line, save.dev);
    if (refusal !== null) {
      record.opened(chose, 'refused', []);
      complain(refusal);
      return;
    }
    if (running) close(true);
    const result = runLine(context, line);
    record.opened(chose, outcomeOf(result), result.recorded);
    current = settled({ ...current, view: context.view, transcript: appendOutputs(current.transcript, result.output) });
    if (result.live) {
      running = result.live;
      current = settled({ ...current, transcript: appendOutputs(current.transcript, [{ kind: 'view', view: context.view, reread: false }]) });
      stopTicking = ticker(advance);
      advance(0);
      return;
    }
    publish();
  };

  const send = sending;

  const reopen = (): void => {
    running = null;
    stopTicking?.();
    stopTicking = null;
    openOnce(current.transcript);
    publish();
  };

  // A session over the same world standing at the beginning. A replay scrubbing backwards walks
  // forward from nothing rather than undoing anything, so this is what nothing is.
  const restart = (): void => {
    const session = startSession(context.session.registry);
    context = newContext(session, view(session), { driving: true, authoring, save, recorder: { history: [], startSave: serializeSession(session) } });
  };

  const goTo = (step: number): void => {
    if (replay === null) return;
    const target = clamped(step, replay.steps);

    // Walking a step at a time is what lets each step say its own words. Going anywhere behind the
    // cursor — or anywhere at all once the record and the world have parted — starts over.
    const backwards = target < replay.at || replay.failure !== null;
    if (backwards) restart();
    const from = backwards ? 0 : replay.at;
    const walked = walkTest(context.session, replay.steps, target, from);

    context.view = view(context.session);
    replay = { ...replay, at: from + walked.walked.length, failure: walked.failure };
    if (!advances(replay)) replay = { ...replay, playing: false };
    current = settled({
      ...current,
      view: context.view,
      live: null,
      transcript: appendOutputs(backwards ? emptyTranscript() : current.transcript, [{ kind: 'view', view: context.view, reread: false }]),
    });
    publish();
  };

  let sinceStep = 0;
  let stopReplayTicking: (() => void) | null = null;

  const stopReplayTicks = (): void => {
    stopReplayTicking?.();
    stopReplayTicking = null;
    sinceStep = 0;
  };

  // A replay is watched, so it advances on the clock rather than as fast as the engine can settle
  // the steps. It runs off the same ticker every other timed thing here does.
  const replayTick = (elapsedMs: number): void => {
    if (replay === null || !replay.playing) return;
    sinceStep += elapsedMs;
    if (sinceStep < replay.delay * 1000) return;
    sinceStep = 0;
    goTo(replay.at + 1);
    if (replay === null || !replay.playing) stopReplayTicks();
  };

  const replaying = (next: (held: ReplaySnapshot) => ReplaySnapshot): void => {
    if (replay === null) return;
    replay = next(replay);
    current = { ...current, replay };
    publish();
  };

  const fileAndStop = (): Filing => {
    const kept = record.kept();
    if (kept === null) return { filed: false, because: 'nothing is being recorded' };

    const result = fileRun(context, kept, header());
    current = settled({ ...current, view: context.view, transcript: appendOutputs(current.transcript, result.output) });
    if (refusedLine(result)) {
      publish();
      return { filed: false, because: result.output.flatMap((output) => (output.kind === 'message' && output.words === 'tool' && output.tone === 'error' ? [output.text, ...(output.detail ?? [])] : [])).join(' ') };
    }
    changing(() => record.stop());
    return { filed: true, at: qualify(LOCAL_CHANGES_MODULE_ID, kept.run.id) };
  };

  const driver: Driver = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    transient: options.transient ?? createTransientChannel(),
    send,
    choose: (position) => sending(String(position)),
    answer: (key, value) => send(`submit-modal: ${key}=${value}`),
    open: (item) => send(`/inv ${item}`),
    swap: (one, other) => send(`swap: ${one} with ${other}`),
    readQuest: (quest) => send(`/quests ${quest}`),
    readStat: (stat) => send(`/stat ${stat}`),
    localizer: () => sessionLocalizer(context.session),
    cancel: () => close(true),
    serialized: () => serializeSession(context.session),
    localChanges: () => {
      try {
        return stored();
      } catch {
        return null;
      }
    },
    baseSources: () => shipped,
    declared: () => declaredBy(context.session.registry),
    note: complain,
    replay: {
      watching: (test) => {
        stopReplayTicks();
        if (test === null) {
          replay = null;
          current = { ...current, replay };
          publish();
          return;
        }
        try {
          const steps = testSteps(test, context.session.registry);
          restart();
          replay = { test, steps, at: 0, playing: false, delay: REPLAY_SPEED, failure: null };
          current = settled({ ...current, view: context.view, live: null, transcript: emptyTranscript() });
          publish();
        } catch (error) {
          complain(because(error));
        }
      },
      at: goTo,
      playing: (on) => {
        stopReplayTicks();
        replaying((held) => ({ ...held, playing: on && advances(held) }));
        if (replay?.playing === true) stopReplayTicking = ticker(replayTick);
      },
      every: (seconds) => replaying((held) => ({ ...held, delay: seconds })),
    },
    playtest: {
      start: () => changing(() => record.start(serializeSession(context.session))),
      stop: fileAndStop,
      attach: (turn, notes) => changing(() => record.attach(turn, notes)),
      moved: (where) => changing(() => record.moved(where)),
      written: () => record.written(),
      filed: () => stagedRuns(context),
      drop: (run) => {
        const result = dropRun(context, run);
        current = settled({ ...current, view: context.view, transcript: appendOutputs(current.transcript, result.output) });
        publish();
      },
    },
    reopen,
    clearLocalChanges: () => {
      send(`/local clear`);
      reopen();
    },
    editorMemory: {
      read: () => {
        try {
          return save.store.read(EDITOR_SLOT)?.payload ?? null;
        } catch (error) {
          complain(`where the editor was could not be read: ${because(error)}`);
          return null;
        }
      },
      write: (text) => {
        try {
          save.store.write(EDITOR_SLOT, text);
        } catch (error) {
          complain(`where the editor was could not be kept: ${because(error)}`);
        }
      },
    },
  };

  return driver;
}
