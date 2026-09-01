import { RuntimeError, type SlotDriver } from '../runtime/store';

export const SLOT_PREFIX = 'universalis:slot:';

export const STORAGE_REFUSALS = ['unavailable', 'quota'] as const;

export type StorageRefusal = (typeof STORAGE_REFUSALS)[number];

function attempting<T>(what: string, act: () => T): T {
  try {
    return act();
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function browserSlots(reach: () => Storage = () => window.localStorage, prefix: string = SLOT_PREFIX): SlotDriver {
  const keyed = (name: string): string => `${prefix}${name}`;

  return {
    read: (name) => attempting(`slot ${name} could not be read`, () => reach().getItem(keyed(name))),
    write: (name, text) => attempting(`slot ${name} could not be written. It still holds what it held`, () => reach().setItem(keyed(name), text)),
    remove: (name) => attempting(`slot ${name} could not be removed`, () => reach().removeItem(keyed(name))),
    names: () =>
      attempting('the slots kept here could not be listed', () => {
        const storage = reach();
        const found: string[] = [];
        for (let at = 0; at < storage.length; at += 1) {
          const key = storage.key(at);
          if (key !== null && key.startsWith(prefix)) found.push(key.slice(prefix.length));
        }
        return found;
      }),
  };
}
