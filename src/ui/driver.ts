import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { Addressed } from '../content/completion';
import { declaredBy } from '../content/references';
import type { ModuleSource } from '../content/universe';
import { shadowed } from './authoringSurface';
import { devRefusal } from './devMode';
import { type AuthoringContext, createTicker, newContext, type CommandContext, type CommandOutput, type LiveProgress, type LiveRun, runLine, type Ticker } from '../runtime/command';
import { type Localizer } from '../runtime/localized';
import { openUniverse, openWithLocalCleared, type OpenedUniverse, type UniverseProblem } from '../runtime/openUniverse';
import { createSaveContext, type SaveContext } from '../runtime/saveSlots';
import { sessionLocalizer, serializeSession, view, type PlayView } from '../runtime/session';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { EDITOR_SLOT } from './editorMemory';
import { appendOutputs, emptyTranscript, type Transcript } from './transcript';
import { createTransientChannel, type TransientChannel } from './transient';

export const REMEDIES = ['clear-local', 'reopen'] as const;

export type Remedy = (typeof REMEDIES)[number];

const asRead = (problems: readonly UniverseProblem[]): string => problems.map((problem) => `${problem.modules.join(' ')}: ${problem.message}`).join('\n');

function remediesFor(problems: readonly UniverseProblem[], ifCleared: () => readonly UniverseProblem[] | null): readonly Remedy[] {
  if (problems.length === 0) return [];
  const cleared = ifCleared();
  return cleared !== null && asRead(cleared) !== asRead(problems) ? ['clear-local', 'reopen'] : ['reopen'];
}

export interface DriverSnapshot {
  view: PlayView;
  transcript: Transcript;
  live: LiveProgress | null;
  problems: readonly UniverseProblem[];
  remedies: readonly Remedy[];
  dev: boolean;
  speed: number;
}

export interface Driver {
  subscribe(listener: () => void): () => void;
  snapshot(): DriverSnapshot;
  transient: TransientChannel;
  send(line: string): void;
  choose(position: number): void;
  answer(key: string, value: string): void;
  open(item: string): void;
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

  const warn = (text: string, detail?: string[]): CommandOutput => (detail ? { kind: 'message', words: 'tool', tone: 'warn', text, detail } : { kind: 'message', words: 'tool', tone: 'warn', text });

  const settled = (next: Omit<DriverSnapshot, 'dev' | 'speed'>): DriverSnapshot => ({ ...next, dev: save.dev, speed: context.live.speed });

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

    const authoring: AuthoringContext = {
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

  const send = (line: string): void => {
    const refusal = devRefusal(line, save.dev);
    if (refusal !== null) {
      complain(refusal);
      return;
    }
    if (running) close(true);
    const result = runLine(context, line);
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

  const reopen = (): void => {
    running = null;
    stopTicking?.();
    stopTicking = null;
    openOnce(current.transcript);
    publish();
  };

  const driver: Driver = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    transient: options.transient ?? createTransientChannel(),
    send,
    choose: (position) => send(String(position)),
    answer: (key, value) => send(`submit-modal: ${key}=${value}`),
    open: (item) => send(`/inv ${item}`),
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
