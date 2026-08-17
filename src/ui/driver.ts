import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../content/registry';
import type { ModuleSource } from '../content/universe';
import { shadowed } from './authoringSurface';
import { devRefusal } from './devMode';
import { type AuthoringContext, createTicker, newContext, type CommandContext, type CommandOutput, type LiveProgress, type LiveRun, runLine, type Ticker } from '../runtime/command';
import { BASE_LANGUAGE, localizerFor, type Localizer } from '../runtime/localized';
import { createSaveContext, type SaveContext } from '../runtime/saveSlots';
import { sessionLocalizer, serializeSession, startSession, view, type PlayView } from '../runtime/session';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { EDITOR_SLOT } from './editorMemory';
import { appendOutputs, emptyTranscript, type Transcript } from './transcript';
import { createTransientChannel, type TransientChannel } from './transient';

// Where a failed opening came from. Two, because only one of them is the
// author's to clear: a local module that will not load is work somebody did and
// can discard, and a shipped file that will not load is a bug discarding it
// would not touch (c5). Declared as the list rather than as a union of literals
// so that everything downstream of a fault derives its cases from it.
export const FAULT_AT = ['base', 'local'] as const;

export type FaultAt = (typeof FAULT_AT)[number];

export interface Fault {
  at: FaultAt;
  why: string;
}

// What can be done from a fault. Every fault has at least one, which is the
// whole of c4: `reopen` is the answer that needs nothing of the author and
// stands wherever the trouble is, and `clear-local` is offered exactly where
// discarding the local module is what would help.
export const REMEDIES = ['clear-local', 'reopen'] as const;

export type Remedy = (typeof REMEDIES)[number];

export function remediesFor(fault: Fault): readonly Remedy[] {
  return fault.at === 'local' ? ['clear-local', 'reopen'] : ['reopen'];
}

export interface DriverSnapshot {
  view: PlayView | null;
  transcript: Transcript;
  // The run under way, as the run last reported itself; null when none is.
  live: LiveProgress | null;
  // What the session is not what the store asked for, and where that came
  // from. A local module set aside leaves a fault and a playable session at
  // once (c1), so this is not the same question as whether there is a view.
  fault: Fault | null;
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

// What is wrong with the local module in a universe that loaded, and nothing
// when it is in there whole. Both halves of the same question, because a module
// can be dropped with something said about it and can also be absent with
// nothing said: only "it is loaded and nobody complained" is a module the
// session is actually playing.
//
// Named for the module it is about rather than taking one. It reads the local
// module's id either way, so a parameter would be a signature promising a
// second caller something the body does not do.
function localTrouble(loaded: Loaded): string | null {
  const complaints = loaded.diagnostics.filter((diagnostic) => diagnostic.moduleId === LOCAL_CHANGES_MODULE_ID || diagnostic.sourceName === LOCAL_CHANGES_MODULE_ID);
  if (complaints.length > 0) return complaints.map(formatModuleDiagnostic).join('; ');
  const status = loaded.modules.find((module) => module.moduleId === LOCAL_CHANGES_MODULE_ID || module.sourceName === LOCAL_CHANGES_MODULE_ID);
  return status?.loaded === true ? null : `${LOCAL_CHANGES_MODULE_ID} is not in the universe that loaded`;
}

// The GUI's session container: it holds the one context every dispatch goes
// through, and hands React a snapshot to render. Every route in spells a line
// the shared table already parses, so the table decides what a command does and
// this file decides nothing.
export function createDriver(sources: readonly ModuleSource[], options: DriverOptions = {}): Driver {
  const listeners = new Set<() => void>();
  let current!: DriverSnapshot;
  let context: CommandContext | null = null;

  const save = createSaveContext(options.slots ?? memoryDriver(), options.now ?? (() => Date.now()));
  // Read at the moment of asking rather than remembered, which is what the
  // command table's own re-read means: another tab that wrote the slot after
  // this session opened is the one being read.
  const stored = (): string => save.store.read(LOCAL_CHANGES_MODULE_ID)?.payload ?? '';

  const shipped = [...sources];
  let authoring: AuthoringContext | null = null;

  const warn = (text: string, detail?: string[]): CommandOutput => (detail ? { kind: 'message', words: 'tool', tone: 'warn', text, detail } : { kind: 'message', words: 'tool', tone: 'warn', text });

  // Every snapshot is made here, so what the session answers about itself is
  // read at the one place a snapshot exists rather than copied in beside each
  // of the six that make one.
  const settled = (next: Omit<DriverSnapshot, 'dev' | 'speed'>): DriverSnapshot => ({ ...next, dev: save.dev, speed: context?.live.speed ?? null });

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

  const seated = (before: Transcript, opening: Opening, fault: Fault | null): void => {
    context = opening.context;
    current = settled({ view: opening.context.view, transcript: appendOutputs(before, opening.output), live: null, fault });
  };

  const stranded = (before: Transcript, said: CommandOutput[], fault: Fault): void => {
    context = null;
    authoring = null;
    current = settled({ view: null, transcript: appendOutputs(before, [...said, { kind: 'message', words: 'tool', tone: 'error', text: fault.why }]), live: null, fault });
  };

  // One attempt at opening, and the whole of where a fault can come from. The
  // base modules first; then the local module over them where the store holds
  // one. A local module that will not load is set aside and the session opens
  // on the base alone (c1), and a base that will not load leaves no session at
  // all — so the two are told apart by which of these paths was taken rather
  // than by anybody reading an error message (c5).
  const openOnce = (before: Transcript): void => {
    const local = readLocal();
    const said = [...local.complaints];

    // One catch, at the edge, and it answers `base`. Everything under it either
    // returns a reason or opens: the load path says what it could not make
    // sense of in diagnostics rather than raising, and the one thing that does
    // raise is a registry no session can start in — which is the base's, since
    // seven shapes of broken local module were tried against this and every one
    // came back as a diagnostic. So a raise here is either that, or a bug in
    // this file, and neither may stop the shell mounting.
    try {
      openOver(before, local.text, said);
    } catch (error) {
      stranded(before, said, { at: 'base', why: because(error) });
    }
  };

  const openOver = (before: Transcript, held: string, said: CommandOutput[]): void => {
    const base = loadUniverseWithDiagnostics(shipped);

    authoring = {
      baseSources: shipped,
      dependencies: base.loadedModules,
      // Empty until something is staged: the module's own header is written by
      // the same edit that writes its first section, so nothing here mints one.
      localSource: { name: LOCAL_CHANGES_MODULE_ID, text: held },
      writeLocalChanges: (text) => void save.store.write(LOCAL_CHANGES_MODULE_ID, text),
      readLocalChanges: stored,
    };

    let setAside: string | null = null;
    if (held.trim() !== '') {
      const loaded = loadUniverseWithDiagnostics([...shipped, authoring.localSource]);
      // The load path drops a module it cannot make sense of and says so in a
      // diagnostic rather than raising, so whether the local module is in the
      // universe that came back is asked of the report — the same question
      // `/reload` asks before it adopts anything.
      setAside = localTrouble(loaded);
      if (setAside === null) {
        seated(before, open(loaded, authoring, save, [...said, ...shadowing(held)]), null);
        return;
      }
      said.push(warn(`${LOCAL_CHANGES_MODULE_ID} was set aside, so this session is the shipped content alone — it is still in the store to read or clear: ${setAside}`));
    }

    seated(before, open(base, authoring, save, said), setAside === null ? null : { at: 'local', why: setAside });
  };

  openOnce(emptyTranscript());

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
    current = settled({ ...current, transcript: appendOutputs(current.transcript, [{ kind: 'message', words: 'tool', tone: 'warn', text }]) });
    publish();
  };

  const close = (cancelled: boolean): void => {
    const run = running;
    if (!run || !context) return;
    running = null;
    stopTicking?.();
    stopTicking = null;
    const result = run.end(cancelled);
    current = settled({ ...current, view: context.view, live: null, transcript: appendOutputs(current.transcript, result.output) });
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
    current = settled({
      ...current,
      view: progress.view,
      live: progress.active ? progress : null,
      transcript: appendOutputs(current.transcript, logging(progress.view)),
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
    if (!context) return;
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
      current = settled({ ...current, transcript: appendOutputs(current.transcript, logging(result.view)) });
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
