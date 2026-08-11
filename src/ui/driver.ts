import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../content/registry';
import type { ModuleSource } from '../content/universe';
import { newContext, type CommandContext, type CommandOutput, type LiveProgress, type LiveRun, runLine } from '../runtime/command';
import { serializeSession, startSession, view, type PlayView } from '../runtime/session';
import { createTicker, type Ticker } from './live';
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
  cancel(): void;
}

export interface DriverOptions {
  transient?: TransientChannel;
  ticker?: Ticker;
}

interface Opening {
  context: CommandContext;
  output: CommandOutput[];
}

function open(sources: readonly ModuleSource[]): Opening {
  const loaded = loadUniverseWithDiagnostics(sources);
  const session = startSession(loaded.registry);
  const first = view(session);
  return {
    // `driving`, because a screen can hold a run open and offer a way to stop
    // it. It is the same flag `--live` sets, so the two drivers arm the same
    // choices and resolve the rest.
    context: newContext(session, first, { driving: true, recorder: { history: [], startSave: serializeSession(session) } }),
    output: [
      ...loaded.diagnostics.map((diagnostic): CommandOutput => ({ kind: 'message', tone: 'warn', text: formatModuleDiagnostic(diagnostic) })),
      { kind: 'view', view: first, reread: false },
    ],
  };
}

// The GUI's session container: it holds the one context every dispatch goes
// through, and hands React a snapshot to render. Every route in spells a line
// the shared table already parses, so the table decides what a command does and
// this file decides nothing.
export function createDriver(sources: readonly ModuleSource[], options: DriverOptions = {}): Driver {
  const listeners = new Set<() => void>();
  let current: DriverSnapshot;
  let context: CommandContext | null = null;

  try {
    const opening = open(sources);
    context = opening.context;
    current = { view: opening.context.view, transcript: appendOutputs(emptyTranscript(), opening.output), live: null, fault: null };
  } catch (error) {
    const fault = error instanceof Error ? error.message : String(error);
    current = { view: null, transcript: appendOutputs(emptyTranscript(), [{ kind: 'message', tone: 'error', text: fault }]), live: null, fault };
  }

  const ticker = options.ticker ?? createTicker();
  let running: LiveRun | null = null;
  let stopTicking: (() => void) | null = null;

  const publish = (): void => {
    for (const listener of listeners) listener();
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

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    transient: options.transient ?? createTransientChannel(),
    send,
    choose: (position) => send(String(position)),
    answer: (key, value) => send(`submit-modal: ${key}=${value}`),
    cancel: () => close(true),
  };
}
