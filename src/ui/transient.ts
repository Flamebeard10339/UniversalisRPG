// A transient note carries text and nothing about where it came from, so the
// overlay rendering it cannot know which moment produced it.
export interface TransientNote {
  id: number;
  text: string;
}

export interface TransientChannel {
  announce(text: string): void;
  notes(): readonly TransientNote[];
  subscribe(listener: () => void): () => void;
}

export interface TransientOptions {
  lifetimeMs?: number;
  schedule?: (expire: () => void, ms: number) => void;
}

export const TRANSIENT_LIFETIME_MS = 1400;

export function createTransientChannel(options: TransientOptions = {}): TransientChannel {
  const lifetimeMs = options.lifetimeMs ?? TRANSIENT_LIFETIME_MS;
  const schedule = options.schedule ?? ((expire, ms) => setTimeout(expire, ms));
  const listeners = new Set<() => void>();
  let notes: readonly TransientNote[] = [];
  let nextId = 1;

  const publish = (next: readonly TransientNote[]): void => {
    notes = next;
    for (const listener of listeners) listener();
  };

  return {
    announce(text) {
      const note = { id: nextId++, text };
      publish([...notes, note]);
      schedule(() => publish(notes.filter((each) => each !== note)), lifetimeMs);
    },
    notes: () => notes,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
