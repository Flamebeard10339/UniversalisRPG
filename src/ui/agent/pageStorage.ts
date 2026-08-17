import type { StorageRefusal } from '../browserStore';

// The browser's storage stood up in memory, for whoever has no browser under
// them. It exists to be driven and nothing that ships imports it, which is what
// puts it in this directory: a module is agent-only by where it is, and a
// fixture beside the adapter would have been one more thing the rule about that
// directory could not see. It lives in a module of its own rather than inside
// one test file because three test files need it, and a test that imports
// another test runs that one's cases twice.

// A `Storage` as the DOM declares one: keyed strings, an index and a length,
// and nothing that knows what a slot is. The adapter is driven through this
// rather than stood in for, so what these tests exercise is the code a browser
// would run. `limit` is the whole of what makes a quota inducible — measured in
// characters, which is what a browser's own quota is measured in.
export function pageStorage(limit = Number.POSITIVE_INFINITY): Storage {
  const held = new Map<string, string>();
  const sizeOf = (key: string, value: string): number => key.length + value.length;
  const used = (skip?: string): number => [...held].reduce((total, [key, value]) => (key === skip ? total : total + sizeOf(key, value)), 0);

  return {
    get length(): number {
      return held.size;
    },
    key: (at: number) => [...held.keys()][at] ?? null,
    getItem: (key: string) => held.get(key) ?? null,
    setItem(key: string, value: string) {
      if (used(key) + sizeOf(key, value) > limit) {
        throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
      }
      held.set(key, value);
    },
    removeItem: (key: string) => void held.delete(key),
    clear: () => held.clear(),
  };
}

// A browser with storage switched off, which raises on the property itself
// rather than handing back something that refuses.
export function noStorage(): Storage {
  throw new Error('The operation is insecure.');
}

// One way into each refusal the adapter can tell apart, keyed by the adapter's
// own name for it: exhaustive by construction, so a mode added to
// `STORAGE_REFUSALS` stops this compiling until there is a way to induce it.
// Each entry hands back a reach that goes on refusing the same way.
export const REFUSING: Record<StorageRefusal, () => () => Storage> = {
  unavailable: () => noStorage,
  quota: () => {
    const storage = pageStorage(64);
    return () => storage;
  },
};
