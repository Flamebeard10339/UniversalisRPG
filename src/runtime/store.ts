import { RuntimeError } from './runtime';

// One named slot: whatever text was written into it, and when. The stamp is the
// store's, never the payload's — a payload is opaque here, and a store that
// looked inside one would be a save store rather than a slot store.
export interface Slot {
  readonly payload: string;
  readonly writtenAt: number;
}

// What a driver supplies, and the only thing in this file that touches the
// world: the bytes of a named slot, in and out. A file under the CLI, a Map
// under test. Everything a slot means — the stamp, the ordering, an absent slot
// reading as nothing — is decided above this and cannot differ between drivers.
export interface SlotDriver {
  read(name: string): string | null;
  write(name: string, text: string): void;
  remove(name: string): void;
  names(): string[];
}

export interface SlotStore {
  read(name: string): Slot | null;
  write(name: string, payload: string): Slot;
  remove(name: string): void;
  list(): string[];
}

interface Envelope {
  writtenAt: number;
  payload: string;
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const held = value as Partial<Envelope>;
  return typeof held.payload === 'string' && typeof held.writtenAt === 'number' && Number.isFinite(held.writtenAt);
}

function decode(name: string, text: string): Slot {
  if (text.trim() === '') throw new RuntimeError(`slot ${name} is empty`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RuntimeError(`slot ${name} does not parse`);
  }
  if (!isEnvelope(parsed)) throw new RuntimeError(`slot ${name} is not a slot: ${text.slice(0, 80)}`);
  return { payload: parsed.payload, writtenAt: parsed.writtenAt };
}

export function slotStore(driver: SlotDriver, now: () => number): SlotStore {
  return {
    read(name) {
      const text = driver.read(name);
      return text === null ? null : decode(name, text);
    },
    write(name, payload) {
      const slot: Slot = { writtenAt: now(), payload };
      driver.write(name, JSON.stringify(slot));
      return slot;
    },
    remove(name) {
      driver.remove(name);
    },
    list() {
      return [...driver.names()].sort();
    },
  };
}

export function memoryDriver(): SlotDriver {
  const held = new Map<string, string>();
  return {
    read: (name) => held.get(name) ?? null,
    write: (name, text) => void held.set(name, text),
    remove: (name) => void held.delete(name),
    names: () => [...held.keys()],
  };
}
