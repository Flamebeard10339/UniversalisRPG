import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';
import { shadowed } from './authoringSurface';
import { devRefusal } from './devMode';
import { type AuthoringContext, createTicker, newContext, type CommandContext, type CommandOutput, type LiveProgress, type LiveRun, runLine, type Ticker } from '../runtime/command';
import { type Localizer } from '../runtime/localized';
import { openUniverse, type OpenedUniverse, type UniverseProblem } from '../runtime/openUniverse';
import { createSaveContext, type SaveContext } from '../runtime/saveSlots';
import { sessionLocalizer, serializeSession, view, type PlayView } from '../runtime/session';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { EDITOR_SLOT } from './editorMemory';
import { appendOutputs, emptyTranscript, type Transcript } from './transcript';
import { createTransientChannel, type TransientChannel } from './transient';

// What can be done about the problems a universe opened with. Every state the
// door can leave the shell in has at least one: `reopen` needs nothing of the
// author and stands wherever the trouble is, and `clear-local` is offered
// exactly where the local module is one of the modules the door reports a
// problem against. One expression over the door's report, so there is no
// second answer here about which module is at fault.
export const REMEDIES = ['clear-local', 'reopen'] as const;

export type Remedy = (typeof REMEDIES)[number];

export function remediesFor(problems: readonly UniverseProblem[]): readonly Remedy[] {
  return problems.some((problem) => problem.modules.includes(LOCAL_CHANGES_MODULE_ID)) ? ['clear-local', 'reopen'] : ['reopen'];
}

export interface DriverSnapshot {
  view: PlayView;
  transcript: Transcript;
  // The run under way, as the run last reported itself; null when none is.
  live: LiveProgress | null;
  // What the door reported about the universe this session opened over, each
  // problem naming the modules it is against. Empty is a universe that opened
  // with nothing to say; a local module set aside leaves a problem and a
  // playable session at once, so this is not a question about the view.
  problems: readonly UniverseProblem[];
  // Whose session this is, and how fast its live clock runs, as the session
  // answers both. Readings rather than copies: nothing in this layer writes
  // either, and both move only where a command moved them (c6, c10).
  dev: boolean;
  speed: number | null;
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
  // Run the load again, over the same base sources and the local module as the
  // store holds it *now* — so a module another tab repaired is one this picks
  // up. It does not re-read the base: those are the bundle's, inlined at build
  // time, and the only thing that re-reads them is loading the page again,
  // which is what the control over this says (c4).
  reopen(): void;
  // Discard the local module and open again on what a first-ever launch finds.
  // A fresh module is written rather than the broken one edited, so this cannot
  // fail on text nothing can parse (c2).
  clearLocalChanges(): void;
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

function open(opened: OpenedUniverse, authoring: AuthoringContext, save: SaveContext, before: readonly CommandOutput[]): Opening {
  const { session } = opened;
  const first = view(session);
  return {
    // `driving`, because a screen can hold a run open and offer a way to stop
    // it. It is the same flag `--live` sets, so the two drivers arm the same
    // choices and resolve the rest.
    context: newContext(session, first, { driving: true, authoring, save, recorder: { history: [], startSave: serializeSession(session) } }),
    output: [
      ...before,
      ...opened.problems.map((problem): CommandOutput => ({ kind: 'message', words: 'tool', tone: 'warn', text: problem.message })),
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
  let current!: DriverSnapshot;
  let context!: CommandContext;

  const save = createSaveContext(options.slots ?? memoryDriver(), options.now ?? (() => Date.now()));
  // Read at the moment of asking rather than remembered, which is what the
  // command table's own re-read means: another tab that wrote the slot after
  // this session opened is the one being read.
  const stored = (): string => save.store.read(LOCAL_CHANGES_MODULE_ID)?.payload ?? '';

  const shipped = [...sources];

  const warn = (text: string, detail?: string[]): CommandOutput => (detail ? { kind: 'message', words: 'tool', tone: 'warn', text, detail } : { kind: 'message', words: 'tool', tone: 'warn', text });

  // Every snapshot is made here, so what the session answers about itself is
  // read at the one place a snapshot exists rather than copied in beside each
  // of the six that make one.
  const settled = (next: Omit<DriverSnapshot, 'dev' | 'speed'>): DriverSnapshot => ({ ...next, dev: save.dev, speed: context.live.speed });

  // What the slot holds, and a complaint instead when it cannot be read at all.
  // A store that refuses is never a reason for the session not to open: it
  // opens on the shipped modules and says so (c13).
  const readLocal = (): { text: string; complaints: CommandOutput[] } => {
    try {
      return { text: stored(), complaints: [] };
    } catch (error) {
      return { text: '', complaints: [warn(`local changes could not be read: ${because(error)}`)] };
    }
  };

  // Which addresses the local module speaks about that a shipped module already
  // declares, as lines. Said whether or not the merged text differs, because a
  // local copy that matches its base is exactly the copy that makes the next
  // edit to the shipped file invisible (c3).
  const shadowing = (local: string): CommandOutput[] => {
    const found = shadowed([...shipped, { name: LOCAL_CHANGES_MODULE_ID, text: local }]);
    if (found.length === 0) return [];
    return [warn(`${LOCAL_CHANGES_MODULE_ID} shadows ${found.length} shipped section(s), so editing the file will not change what is played`, found.map((each) => `# ${each.kind} ${each.address} — also in ${each.modules.join(', ')}`))];
  };

  // One load and one answer. The door is handed the sources — the shipped
  // modules, and the local module over them where the store holds one — and
  // hands back a session, the modules that loaded and what is wrong with them.
  // Nothing here decides which module is at fault and nothing here catches:
  // both were this file's guesses about facts the loader states.
  const openOnce = (before: Transcript): void => {
    const local = readLocal();
    const localSource: ModuleSource = { name: LOCAL_CHANGES_MODULE_ID, text: local.text };
    const opened = openUniverse(local.text.trim() === '' ? shipped : [...shipped, localSource], { save });

    const authoring: AuthoringContext = {
      baseSources: shipped,
      // What a staged edit stands on, as the door reported it. The module being
      // authored is not one of them.
      dependencies: opened.modules.filter((id) => id !== LOCAL_CHANGES_MODULE_ID),
      // Empty until something is staged: the module's own header is written by
      // the same edit that writes its first section, so nothing here mints one.
      localSource,
      writeLocalChanges: (text) => void save.store.write(LOCAL_CHANGES_MODULE_ID, text),
      readLocalChanges: stored,
    };

    // Asked of the report rather than of the text: a module the door did not
    // load has no addresses in the universe to be shadowing anything in.
    const said = [...local.complaints, ...(opened.modules.includes(LOCAL_CHANGES_MODULE_ID) ? shadowing(local.text) : [])];
    const opening = open(opened, authoring, save, said);
    context = opening.context;
    current = settled({ view: opening.context.view, transcript: appendOutputs(before, opening.output), live: null, problems: opened.problems });
  };

  openOnce(emptyTranscript());

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

  // The run decides whether it is over; this only passes it the time that went
  // by and hands React what came back. A tick is also where the world speaks:
  // what an action's completion said rides on the view that tick returns and
  // is drained from every view after it, so a driver that does not log it here
  // never shows it.
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

  // One run at a time, and a dispatch replaces the one under way rather than
  // queueing behind it or being refused. The sheet goes on offering the
  // world's choices while a run lasts, so this is the route every tap takes,
  // and stopping first is what keeps the next line from resolving against a
  // world the next tick was about to move.
  const send = (line: string): void => {
    // The one gate over every route in: a line typed at the console, a line a
    // control spells and a line an agent hands the harness all pass here, so a
    // dev power has one refusal and the shell has no second answer about whose
    // session this is (c6, c11).
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
      // Arming reports no output of its own; whatever the world said as the
      // action began rides on the view it handed back.
      current = settled({ ...current, transcript: appendOutputs(current.transcript, [{ kind: 'view', view: context.view, reread: false }]) });
      stopTicking = ticker(advance);
      // Zero elapsed, so the first frame is the run's own report of itself
      // rather than a shape this layer guessed while waiting for a tick.
      advance(0);
      return;
    }
    publish();
  };

  // Open again and keep what was said. A run under way belongs to the session
  // being replaced, so it is dropped rather than ticked into the next one.
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
        // A store that cannot be read has no text to hand over, and saying so
        // is a control that offers nothing rather than one that offers a guess.
        return null;
      }
    },
    baseSources: () => shipped,
    note: complain,
    reopen,
    clearLocalChanges: () => {
      // The command that mints a fresh module rather than editing the broken
      // one, which is what makes it the one command that can proceed from text
      // nothing can parse (c2). Sent rather than performed, because writing the
      // module is the table's and this layer has no second spelling of it.
      send(`/local clear`);
      // And open again over what the store holds now, so what is left is the
      // session a first-ever launch produces rather than the one that was
      // already standing when the module was set aside.
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

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    void import('./agent/testHarness').then(({ installTestHarness }) => installTestHarness(driver));
  }

  return driver;
}
