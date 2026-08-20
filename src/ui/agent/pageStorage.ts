import type { StorageRefusal } from '../browserStore';

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

export function noStorage(): Storage {
  throw new Error('The operation is insecure.');
}

export const REFUSING: Record<StorageRefusal, () => () => Storage> = {
  unavailable: () => noStorage,
  quota: () => {
    const storage = pageStorage(64);
    return () => storage;
  },
};
