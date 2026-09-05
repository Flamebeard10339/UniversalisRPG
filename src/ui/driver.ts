import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { qualify } from '../content/namespace';
import type { Addressed } from '../content/completion';
import { declaredBy } from '../content/references';
import { withModulesOff, type ModuleSource } from '../content/universe';
import { shadowed } from './authoringSurface';
import { devRefusal } from './devMode';
import { type AuthoringContext, createTicker, liveAgain, newContext, outcomeOf, refusedLine, resumptionNotes, type CommandContext, type CommandOutput, type CommandResult, type LiveProgress, type LiveRun, runLine, type Ticker } from '../runtime/command';
import { type Localizer } from '../runtime/localized';
import { openUniverse, openWithLocalCleared, type OpenedUniverse, type UniverseProblem } from '../runtime/openUniverse';
import { dropRun, fileRun, renameRun, stagedRuns, type FiledRun } from '../runtime/runFiling';
import type { Answer } from '../runtime/localized';
import type { Directive } from '../content/sections/test';
import { advances, clamped, REPLAY_SPEED } from './replay';
import { type RecordedRun, type RunHeader, type RunNotes } from '../runtime/runLog';
import { createSaveContext, modulesTurnedOff, speedKept, turnModulesOff, type SaveContext } from '../runtime/saveSlots';
import { greetingBack, sessionLocalizer, serializeSession, startSession, testSteps, view, walkTest, type PlayView } from '../runtime/session';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { EDITOR_SLOT } from './editorMemory';
import { packsOf, type PortalPack } from '../content/packs';
import { appendOutputs, emptyTranscript, keptTranscript, TRANSCRIPT_SLOT, trimmedTranscript, type Transcript } from './transcript';
import { createRecorder } from './playtest';
import { createTransientChannel, type TransientChannel } from './transient';

export const REMEDIES = ['clear-local', 'reopen'] as const;

export type Filing = { readonly filed: true; readonly at: string } | { readonly filed: false; readonly because: string };

export type Remedy = (typeof REMEDIES)[number];

const asRead = (problems: readonly UniverseProblem[]): string => problems.map((problem) => `${problem.modules.join(' ')}: ${problem.message}`).join('\n');

function remediesFor(problems: readonly UniverseProblem[], ifCleared: () => readonly UniverseProblem[] | null): readonly Remedy[] {
  if (problems.length === 0) return [];
  const cleared = ifCleared();
  return cleared !== null && asRead(cleared) !== asRead(problems) ? ['clear-local', 'reopen'] : ['reopen'];
}

export interface ReplaySnapshot {
  readonly test: Answer;
  readonly steps: readonly Directive[];
  readonly at: number;
  readonly playing: boolean;
  readonly delay: number;
  readonly failure: string | null;
}

export interface ReplayControls {
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
  playtest: RecordedRun | null;
  replay: ReplaySnapshot | null;
  mods: readonly PortalPack[];
}

export interface PlaytestControls {
  start(): void;
  stop(): Filing;
  attach(turn: number, notes: RunNotes): void;
  moved(where: string): void;
  parts(): number;
  written(): string;
  filed(): readonly FiledRun[];
  drop(run: string): void;
  rename(run: string, to: string): void;
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
  readSkill(skill: string): void;
  cancel(): void;
  localizer(): Localizer;
  serialized(): string;
  localChanges(): string | null;
  baseSources(): readonly ModuleSource[];
  declared(): readonly Addressed[];
  editorMemory: { read(): string | null; write(text: string): void };
  note(text: string): void;
  reopen(): void;
  turnModulesOff(names: readonly string[]): void;
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
    context: newContext(session, first, { driving: true, authoring, save, speed: speedKept(save), recorder: { history: [], startSave: serializeSession(session) } }),
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

  const record = createRecorder(save.store, (text) => complain(text), header, () => serializeSession(context.session));

  const warn = (text: string, detail?: string[]): CommandOutput => (detail ? { kind: 'message', words: 'tool', tone: 'warn', text, detail } : { kind: 'message', words: 'tool', tone: 'warn', text });

  let replay: ReplaySnapshot | null = null;
  let authoring!: AuthoringContext;

  let logKept: Transcript | null = null;
  let keepingTheLog = true;

  function keepLog(): void {
    const transcript = current.transcript;
    if (!keepingTheLog || transcript === logKept) return;
    logKept = transcript;
    try {
      save.store.write(TRANSCRIPT_SLOT, JSON.stringify(trimmedTranscript(transcript)));
    } catch (error) {
      keepingTheLog = false;
      complain(`what is said here could not be kept, so this page is the last of it: ${because(error)}`);
    }
  }

  const readLog = (): { text: string | null; complaints: CommandOutput[] } => {
    try {
      return { text: save.store.read(TRANSCRIPT_SLOT)?.payload ?? null, complaints: [] };
    } catch (error) {
      return { text: null, complaints: [warn(`what was said before could not be read back: ${because(error)}`)] };
    }
  };

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

  const openOnce = (before: Transcript, log: { text: string | null; complaints: CommandOutput[] } = { text: null, complaints: [] }): void => {
    const local = readLocal();
    const localSource: ModuleSource = { name: LOCAL_CHANGES_MODULE_ID, text: local.text };
    const held = local.text.trim() === '' ? shipped : [...shipped, localSource];
    const sources = withModulesOff(held, modulesTurnedOff(save));
    const opened = openUniverse(sources, { save });

    authoring = {
      baseSources: shipped,
      dependencies: opened.modules.filter((id) => id !== LOCAL_CHANGES_MODULE_ID),
      localSource,
      writeLocalChanges: (text) => void save.store.write(LOCAL_CHANGES_MODULE_ID, text),
      readLocalChanges: stored,
    };

    const said = [...local.complaints, ...log.complaints, ...(opened.modules.includes(LOCAL_CHANGES_MODULE_ID) ? shadowing(local.text) : [])];
    const opening = open(opened, authoring, save, said);
    const kept = log.text === null || opened.resumed.kind !== 'resumed' ? null : keptTranscript(log.text, sessionLocalizer(opening.context.session).identifier);
    const carried = kept ?? before;
    context = opening.context;
    current = settled({
      view: opening.context.view,
      transcript: appendOutputs(carried, opening.output),
      live: null,
      problems: opened.problems,
      remedies: remediesFor(opened.problems, () => openWithLocalCleared(sources, authoring.dependencies)?.problems ?? null),
      mods: packsOf(opened.statuses),
    });
  };

  openOnce(emptyTranscript(), readLog());

  const ticker = options.ticker ?? createTicker();
  let running: LiveRun | null = null;
  let stopTicking: (() => void) | null = null;

  function publish(): void {
    keepLog();
    for (const listener of listeners) listener();
  }

  const changing = (act: () => void): void => {
    act();
    current = { ...current, playtest: record.run() };
    publish();
  };

  const filing = (result: CommandResult): void => {
    current = settled({ ...current, view: context.view, transcript: appendOutputs(current.transcript, result.output) });
    publish();
  };

  function complain(text: string): void {
    current = settled({ ...current, transcript: appendOutputs(current.transcript, [{ kind: 'message', words: 'tool', tone: 'warn', text }]) });
    publish();
  }

  const unhook = (): LiveRun | null => {
    const run = running;
    running = null;
    stopTicking?.();
    stopTicking = null;
    return run;
  };

  const settleRun = (run: LiveRun, cancelled: boolean): void => {
    const result = run.end(cancelled);
    record.settled(result.recorded);
    current = settled({ ...current, view: context.view, live: null, transcript: appendOutputs(current.transcript, result.output) });
    publish();
  };

  const close = (cancelled: boolean): void => {
    const run = unhook();
    if (run) settleRun(run, cancelled);
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

  function runOnUnderWay(): void {
    if (running !== null) return;
    if (greetingBack(context.view)) return;
    let live: LiveRun | null;
    try {
      live = liveAgain(context);
    } catch {
      return;
    }
    if (!live) return;
    running = live;
    stopTicking = ticker(advance);
    advance(0);
  }

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
    const held = unhook();
    if (held) settleRun(held, false);

    const result = runLine(context, line);
    record.opened(chose, outcomeOf(result), result.recorded);
    current = settled({ ...current, view: context.view, transcript: appendOutputs(current.transcript, result.output) });

    const live = result.live ?? (held ? liveAgain(context) : null);
    if (live) {
      running = live;
      current = settled({ ...current, transcript: appendOutputs(current.transcript, [{ kind: 'view', view: context.view, reread: false }]) });
      stopTicking = ticker(advance);
      advance(0);
      return;
    }
    runOnUnderWay();
    publish();
  };

  const send = sending;

  const reopen = (): void => {
    running = null;
    stopTicking?.();
    stopTicking = null;
    openOnce(current.transcript);
    runOnUnderWay();
    publish();
  };

  const restart = (): void => {
    const session = startSession(context.session.registry);
    context = newContext(session, view(session), { driving: true, authoring, save, speed: context.live.speed, recorder: { history: [], startSave: serializeSession(session) } });
  };

  const goTo = (step: number): void => {
    if (replay === null) return;
    const target = clamped(step, replay.steps);

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
    const every = record.everyPart();
    if (every.length === 0) return { filed: false, because: 'nothing is being recorded' };

    for (const kept of every) {
      const result = fileRun(context, kept, header());
      current = settled({ ...current, view: context.view, transcript: appendOutputs(current.transcript, result.output) });
      if (refusedLine(result)) {
        publish();
        return { filed: false, because: result.output.flatMap((output) => (output.kind === 'message' && output.words === 'tool' && output.tone === 'error' ? [output.text, ...(output.detail ?? [])] : [])).join(' ') };
      }
    }
    changing(() => record.stop());
    return { filed: true, at: qualify(LOCAL_CHANGES_MODULE_ID, every[every.length - 1].run.id) };
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
    readSkill: (skill) => send(`/skills ${skill}`),
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
      parts: () => record.parts(),
      written: () => record.written(),
      filed: () => stagedRuns(context),
      drop: (run) => filing(dropRun(context, run)),
      rename: (run, to) => filing(renameRun(context, run, to)),
    },
    reopen,
    turnModulesOff: (names) => {
      try {
        turnModulesOff(save, names);
      } catch (error) {
        complain(`which modules are turned off could not be kept: ${because(error)}`);
        return;
      }
      reopen();
    },
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

  runOnUnderWay();

  return driver;
}
