import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../content/registry';
import type { ModuleSource } from '../content/universe';
import { newContext, type CommandContext, type CommandOutput, runLine } from '../runtime/command';
import { serializeSession, startSession, view, type PlayView } from '../runtime/session';
import { appendOutputs, emptyTranscript, type Transcript } from './transcript';
import { createTransientChannel, type TransientChannel } from './transient';

export interface DriverSnapshot {
  view: PlayView | null;
  transcript: Transcript;
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
}

export interface DriverOptions {
  transient?: TransientChannel;
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
    context: newContext(session, first, { recorder: { history: [], startSave: serializeSession(session) } }),
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
    current = { view: opening.context.view, transcript: appendOutputs(emptyTranscript(), opening.output), fault: null };
  } catch (error) {
    const fault = error instanceof Error ? error.message : String(error);
    current = { view: null, transcript: appendOutputs(emptyTranscript(), [{ kind: 'message', tone: 'error', text: fault }]), fault };
  }

  const send = (line: string): void => {
    if (!context) return;
    const result = runLine(context, line);
    current = { ...current, view: context.view, transcript: appendOutputs(current.transcript, result.output) };
    for (const listener of listeners) listener();
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
  };
}
