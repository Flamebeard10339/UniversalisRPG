import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../content/registry';
import type { ModuleSource } from '../content/universe';
import { type AuthoringContext, createTicker, newContext, type CommandContext, type CommandOutput, type LiveProgress, type LiveRun, runLine, type Ticker } from '../runtime/command';
import { BASE_LANGUAGE, localizerFor, type Localizer } from '../runtime/localized';
import { createSaveContext, type SaveContext } from '../runtime/saveSlots';
import { sessionLocalizer, serializeSession, startSession, view, type PlayView } from '../runtime/session';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { EDITOR_SLOT } from './editorMemory';
import { appendOutputs, emptyTranscript, type Transcript } from './transcript';
import { createTransientChannel, type TransientChannel } from './transient';

export interface DriverSnapshot {
  view: PlayView | null;
  transcript: Transcript;
  // The run under way, as the run last reported itself; null when none is.
  live: LiveProgress | null;
  // The message that stopped the session from opening at all, if one did.
  fault: string | null;
}

export interface Driver {
  subscribe(listener: () => void): () => void;
  snapshot(): DriverSnapshot;
  transient: TransientChannel;
  send(line: string): void;
  choose(position: number): void;
  answer(key: string, value: string): void;
  // What a row on the inventory ledger does, as the line the REPL types to do
  // the same thing: the screen it opens is the shared command's, so neither
  // driver reaches one the other has not got.
  open(item: string): void;
  cancel(): void;
  // The localizer of the session as it stands, which is what every word this
  // driver puts on a screen comes out of (c3). Asked for rather than held,
  // because `/dsl` adopts a new registry and the language being played is the
  // session's rather than the shell's.
  localizer(): Localizer;
  // What a save of this session would write, and null when there is no session
  // to save. The bytes are the whole of what the two drivers are compared on,
  // because a view is what a driver was told and this is what it is standing in.
  serialized(): string | null;
  // The module an author is editing, as the store holds it, and null when the
  // store cannot say. There is no second spelling of it in this layer: these
  // are the bytes `/local show` prints and the bytes the slot holds (c16).
  localChanges(): string | null;
  // Every base module this session was opened over, which is what an editing
  // surface reads a shipped section's text out of. The sources themselves, so
  // nothing here re-renders one.
  baseSources(): readonly ModuleSource[];
  // Where the shell keeps its own place — which section is open, where the map
  // is looking — in the same store the edits are in, so there is one thing to
  // be lost and it is not lost (c10). Opaque here: what is in it belongs to
  // whoever is standing in it, the way a payload belongs to a slot.
  editorMemory: { read(): string | null; write(text: string): void };
  // What the shell has to say on the tool's own channel. The command table has
  // no view of a gesture, so a drag it never heard about — one the map refused
  // before a line existed — is said here or nowhere (c8, c13).
  note(text: string): void;
}

export interface DriverOptions {
  transient?: TransientChannel;
  ticker?: Ticker;
  // Where this driver keeps slots. A driver handed none still stands in a
  // store, so `/save` and a staged edit behave the same way in a test as in a
  // browser; what differs is whether anything survives the page.
  slots?: SlotDriver;
  now?: () => number;
}

interface Opening {
  context: CommandContext;
  output: CommandOutput[];
}

type Loaded = ReturnType<typeof loadUniverseWithDiagnostics>;

function open(loaded: Loaded, authoring: AuthoringContext, save: SaveContext, before: readonly CommandOutput[]): Opening {
  const session = startSession(loaded.registry);
  const first = view(session);
  return {
    // `driving`, because a screen can hold a run open and offer a way to stop
    // it. It is the same flag `--live` sets, so the two drivers arm the same
    // choices and resolve the rest.
    context: newContext(session, first, { driving: true, authoring, save, recorder: { history: [], startSave: serializeSession(session) } }),
    output: [
      ...before,
      ...loaded.diagnostics.map((diagnostic): CommandOutput => ({ kind: 'message', words: 'tool', tone: 'warn', text: formatModuleDiagnostic(diagnostic) })),
      { kind: 'view', view: first, reread: false },
    ],
  };
}

const because = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// The GUI's session container: it holds the one context every dispatch goes
// through, and hands React a snapshot to render. Every route in spells a line
// the shared table already parses, so the table decides what a command does and
// this file decides nothing.
export function createDriver(sources: readonly ModuleSource[], options: DriverOptions = {}): Driver {
  const listeners = new Set<() => void>();
  let current: DriverSnapshot;
  let context: CommandContext | null = null;

  const save = createSaveContext(options.slots ?? memoryDriver(), options.now ?? (() => Date.now()));
  // Read at the moment of asking rather than remembered, which is what the
  // command table's own re-read means: another tab that wrote the slot after
  // this session opened is the one being read.
  const stored = (): string => save.store.read(LOCAL_CHANGES_MODULE_ID)?.payload ?? '';

  // What the slot held when the page opened, and a message instead when it
  // could not be read at all. A store that refuses is never a reason for the
  // session not to open: it opens on the shipped modules and says so (c13).
  let held = '';
  const complaints: CommandOutput[] = [];
  try {
    held = stored();
  } catch (error) {
    complaints.push({ kind: 'message', words: 'tool', tone: 'warn', text: `local changes could not be read: ${because(error)}` });
  }

  const base = loadUniverseWithDiagnostics(sources);
  const authoring: AuthoringContext = {
    baseSources: [...sources],
    dependencies: base.loadedModules,
    // Empty until something is staged: the module's own header is written by
    // the same edit that writes its first section, so nothing here mints one.
    localSource: { name: LOCAL_CHANGES_MODULE_ID, text: held },
    writeLocalChanges: (text) => void save.store.write(LOCAL_CHANGES_MODULE_ID, text),
    readLocalChanges: stored,
  };

  try {
    const loaded = held.trim() === '' ? base : loadUniverseWithDiagnostics([...sources, authoring.localSource]);
    const opening = open(loaded, authoring, save, complaints);
    context = opening.context;
    current = { view: opening.context.view, transcript: appendOutputs(emptyTranscript(), opening.output), live: null, fault: null };
  } catch (error) {
    const fault = because(error);
    current = { view: null, transcript: appendOutputs(emptyTranscript(), [...complaints, { kind: 'message', words: 'tool', tone: 'error', text: fault }]), live: null, fault };
  }

  // A shell with no session still draws its own tabs, so it still needs
  // somewhere to ask for their words. A registry with no content answers every
  // key with the key, which is what the localizer already does for a language
  // nothing translated — unmistakable on a screen that has just failed to open
  // a world, and one door rather than two.
  const wordless = (): Localizer => localizerFor(loadUniverseWithDiagnostics([]).registry, BASE_LANGUAGE);

  const ticker = options.ticker ?? createTicker();
  let running: LiveRun | null = null;
  let stopTicking: (() => void) | null = null;

  const publish = (): void => {
    for (const listener of listeners) listener();
  };

  // A store that refused something this layer asked for on its own account,
  // said out loud on the same channel the command table refuses on. The column
  // counts a line it is told again rather than writing it out, so a page that
  // asks every keystroke says it once (c13).
  const complain = (text: string): void => {
    current = { ...current, transcript: appendOutputs(current.transcript, [{ kind: 'message', words: 'tool', tone: 'warn', text }]) };
    publish();
  };

  const close = (cancelled: boolean): void => {
    const run = running;
    if (!run || !context) return;
    running = null;
    stopTicking?.();
    stopTicking = null;
    const result = run.end(cancelled);
    current = { ...current, view: context.view, live: null, transcript: appendOutputs(current.transcript, result.output) };
    publish();
  };

  const logging = (current: PlayView | undefined): CommandOutput[] => (current ? [{ kind: 'view', view: current, reread: false }] : []);

  // The run decides whether it is over; this only passes it the time that went
  // by and hands React what came back. A tick is also where the world speaks:
  // what an action's completion said rides on the view that tick returns and
  // is drained from every view after it, so a driver that does not log it here
  // never shows it.
  const advance = (elapsedMs: number): void => {
    const run = running;
    if (!run) return;
    const progress = run.tick(elapsedMs);
    current = {
      ...current,
      view: progress.view,
      live: progress.active ? progress : null,
      transcript: appendOutputs(current.transcript, logging(progress.view)),
    };
    if (!progress.active) {
      close(false);
      return;
    }
    publish();
  };

  // One run at a time, and a dispatch replaces the one under way rather than
  // queueing behind it or being refused. The sheet goes on offering the
  // world's choices while a run lasts, so this is the route every tap takes,
  // and stopping first is what keeps the next line from resolving against a
  // world the next tick was about to move.
  const send = (line: string): void => {
    if (!context) return;
    if (running) close(true);
    const result = runLine(context, line);
    current = { ...current, view: context.view, transcript: appendOutputs(current.transcript, result.output) };
    if (result.live) {
      running = result.live;
      // Arming reports no output of its own; whatever the world said as the
      // action began rides on the view it handed back.
      current = { ...current, transcript: appendOutputs(current.transcript, logging(result.view)) };
      stopTicking = ticker(advance);
      // Zero elapsed, so the first frame is the run's own report of itself
      // rather than a shape this layer guessed while waiting for a tick.
      advance(0);
      return;
    }
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
    localizer: () => (context ? sessionLocalizer(context.session) : wordless()),
    cancel: () => close(true),
    serialized: () => (context ? serializeSession(context.session) : null),
    localChanges: () => {
      try {
        return stored();
      } catch {
        // A store that cannot be read has no text to hand over, and saying so
        // is a control that offers nothing rather than one that offers a guess.
        return null;
      }
    },
    baseSources: () => authoring.baseSources,
    note: complain,
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

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    void import('./agent/testHarness').then(({ installTestHarness }) => installTestHarness(driver));
  }

  return driver;
}
