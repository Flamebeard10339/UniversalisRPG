import { describe, expect, it } from 'vitest';
import { slotStore, type SlotDriver } from './store';

const DECLARED: Record<keyof SlotDriver, true> = { read: true, write: true, remove: true, names: true };

export const SLOT_DRIVER_METHODS: readonly string[] = Object.keys(DECLARED).sort();

const LONG = 'é 😀 line\n'.repeat(40_000);

export const CONTRACT_PAYLOADS: readonly string[] = [
  '',
  '   ',
  'not json at all',
  '{"version":11,"time":5000}',
  '{ "version" : 11 ,  "time" : 5000 }',
  '"already a json string"',
  '{"nested":{"unicode":"é 😀"}}',
  'line one\nline two\r\nline three\n',
  '\n\n trailing and leading \n\n',
  LONG,
];

function recording(driver: SlotDriver, seen: Set<string>): SlotDriver {
  return new Proxy(driver, {
    get(target, key) {
      const held: unknown = Reflect.get(target, key);
      if (typeof held !== 'function') return held;
      return (...args: unknown[]): unknown => {
        seen.add(String(key));
        return (held as (...given: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

const SLOT = 'player';
const OTHER = 'dev-snapshot';

export function describeSlotDriver(what: string, make: () => SlotDriver): void {
  const exercised = new Set<string>();
  const fresh = (): SlotDriver => recording(make(), exercised);

  describe(`${what} is a slot driver`, () => {
    it('reads nothing out of a slot nothing was written to, and lists none', () => {
      const driver = fresh();

      expect(driver.read(SLOT)).toBeNull();
      expect(driver.names()).toEqual([]);
    });

    for (const payload of CONTRACT_PAYLOADS) {
      it(`hands back ${JSON.stringify(payload.slice(0, 24))}${payload.length > 24 ? `… (${payload.length} chars)` : ''} byte for byte`, () => {
        const driver = fresh();
        driver.write(SLOT, payload);

        expect(driver.read(SLOT)).toBe(payload);
      });
    }

    it('holds what the last write put there rather than a merge of the writes before it', () => {
      const driver = fresh();
      driver.write(SLOT, 'first');
      driver.write(SLOT, 'second');

      expect(driver.read(SLOT)).toBe('second');
    });

    it('keeps slots apart, and lists every one that was written', () => {
      const driver = fresh();
      driver.write(SLOT, 'mine');
      driver.write(OTHER, 'theirs');

      expect(driver.read(SLOT)).toBe('mine');
      expect(driver.read(OTHER)).toBe('theirs');
      expect(driver.names().sort()).toEqual([OTHER, SLOT]);
    });

    it('forgets a removed slot, and removing what is not there is not a failure', () => {
      const driver = fresh();
      driver.write(SLOT, 'mine');
      driver.write(OTHER, 'theirs');
      driver.remove(SLOT);

      expect(driver.read(SLOT)).toBeNull();
      expect(driver.names()).toEqual([OTHER]);
      expect(() => driver.remove(SLOT)).not.toThrow();
    });

    it('carries a store, so a payload comes back stamped and unparsed', () => {
      const clock = { at: 1_000 };
      const store = slotStore(fresh(), () => clock.at);
      const payload = '{"version":11,"time":5000}';

      expect(store.write(SLOT, payload).writtenAt).toBe(1_000);
      clock.at += 60_000;
      store.write(OTHER, payload);

      expect(store.read(SLOT)).toEqual({ payload, writtenAt: 1_000 });
      expect(store.read(OTHER)).toEqual({ payload, writtenAt: 61_000 });
      expect(store.list()).toEqual([OTHER, SLOT]);
    });

    it('is exercised on every verb the interface declares', () => {
      expect([...exercised].sort()).toEqual(SLOT_DRIVER_METHODS);
    });
  });
}
