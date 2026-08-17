import { RuntimeError, type SlotDriver } from '../runtime/store';

// The browser's end of the slot store, and the only module under src/ui that
// names the browser's storage at all. Everything a slot means — the stamp, an
// absent slot reading as nothing, the bytes being opaque — belongs to the
// interface this satisfies and is not restated here: this moves text, and says
// so when it cannot.

// What one origin's slots are keyed under. `localStorage` is one flat namespace
// per origin, so the prefix is what keeps a slot apart from whatever else is
// kept there, and prefix-plus-name is one key for one slot whatever the name.
export const SLOT_PREFIX = 'universalis:slot:';

// Every way this adapter can be refused, told apart. Reaching storage at all
// fails on a browser with it switched off — the property itself raises — and a
// write fails when there is no room for it. Neither is a reason to stop
// playing, so both come back as a `RuntimeError` the command table prints.
export const STORAGE_REFUSALS = ['unavailable', 'quota'] as const;

export type StorageRefusal = (typeof STORAGE_REFUSALS)[number];

// What the browser said, in this driver's own words: a refusal reaches the
// command table as a message it can print rather than as an exception that ends
// the session standing behind it.
function attempting<T>(what: string, act: () => T): T {
  try {
    return act();
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Reached through a function rather than held, because a browser that refuses
// storage refuses at the property: a driver built once over a value could only
// ever be built by throwing where nobody is standing to catch it.
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
