import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RuntimeError, slotStore } from '../runtime/store';
import { describeSlotDriver } from '../runtime/storeContract';
import { browserSlots, SLOT_PREFIX, STORAGE_REFUSALS } from './browserStore';
import { pageStorage, REFUSING } from './agent/pageStorage';

const here = fileURLToPath(new URL('.', import.meta.url));

export function overStorage(limit?: number): ReturnType<typeof browserSlots> {
  const storage = pageStorage(limit);
  return browserSlots(() => storage);
}

describeSlotDriver('one localStorage key per slot', () => overStorage());

describe('a slot lives under a key of its own (c11, c12)', () => {
  it('keeps the bytes under the prefixed name and nothing around them', () => {
    const storage = pageStorage();
    const driver = browserSlots(() => storage);
    const payload = '{"version":11}\nnot even one line\n';

    driver.write('player', payload);

    expect(storage.getItem(`${SLOT_PREFIX}player`)).toBe(payload);
    expect(driver.read('player')).toBe(payload);
  });

  it('lists its own slots and nothing else the origin keeps here', () => {
    const storage = pageStorage();
    storage.setItem('some-other-app', 'not a slot');
    const driver = browserSlots(() => storage);
    driver.write('player', 'a');
    driver.write('autosave', 'b');

    expect(driver.names().sort()).toEqual(['autosave', 'player']);
  });

  it('keeps two prefixes apart under one storage', () => {
    const storage = pageStorage();
    const mine = browserSlots(() => storage, 'mine:');
    const theirs = browserSlots(() => storage, 'theirs:');

    mine.write('player', 'my game');
    theirs.write('player', 'their game');

    expect(mine.read('player')).toBe('my game');
    expect(theirs.read('player')).toBe('their game');
    expect(mine.names()).toEqual(['player']);
  });

  it('stamps a payload that carries no stamp, through the browser and back', () => {
    const clock = { at: 5_000 };
    const store = slotStore(overStorage(), () => clock.at);
    const payload = '{"time":5000}';

    store.write('player', payload);
    clock.at += 90_000;
    store.write('dev', payload);

    expect(store.read('player')).toEqual({ payload, writtenAt: 5_000 });
    expect(store.read('dev')).toEqual({ payload, writtenAt: 95_000 });
  });
});

describe('every way the browser can refuse to store is a message (c13)', () => {
  it('has a way to induce every refusal the adapter distinguishes', () => {
    expect(Object.keys(REFUSING).sort()).toEqual([...STORAGE_REFUSALS].sort());
  });

  for (const mode of STORAGE_REFUSALS) {
    it(`answers ${mode} with a RuntimeError on every verb, and never with a raw exception`, () => {
      const driver = browserSlots(REFUSING[mode]());
      const wide = 'x'.repeat(256);

      expect(() => driver.write('player', wide)).toThrow(RuntimeError);
      expect(() => driver.write('player', wide)).toThrow(/slot player could not be written/);

      if (mode === 'quota') {
        expect(driver.read('player')).toBeNull();
        return;
      }
      expect(() => driver.read('player')).toThrow(RuntimeError);
      expect(() => driver.remove('player')).toThrow(RuntimeError);
      expect(() => driver.names()).toThrow(RuntimeError);
    });
  }

  it('leaves a slot holding what it held when the write will not fit', () => {
    const storage = pageStorage(`${SLOT_PREFIX}player`.length + 32);
    const driver = browserSlots(() => storage);
    driver.write('player', 'an hour of play');

    expect(() => driver.write('player', 'x'.repeat(64))).toThrow(RuntimeError);
    expect(driver.read('player')).toBe('an hour of play');
  });
});

function modulesUnder(directory: string, prefix: string): Array<{ file: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, text: readFileSync(path, 'utf8') }];
  });
}

const ADAPTER = 'src/ui/browserStore.ts';

const STORAGE = /\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage|indexedDB)\b/;

describe('nothing in src/ui reaches storage except through the adapter (c14)', () => {
  const modules = [...modulesUnder(here, 'src/ui'), { file: 'src/main.tsx', text: readFileSync(join(here, '..', 'main.tsx'), 'utf8') }];

  it('reads the tree it is a rule about', () => {
    expect(modules.map((module) => module.file)).toContain(ADAPTER);
    expect(modules.map((module) => module.file)).toContain('src/main.tsx');
    expect(modules.length).toBeGreaterThan(20);
  });

  it('names browser storage in the adapter and nowhere else', () => {
    const reaching = modules.filter((module) => module.file !== ADAPTER && STORAGE.test(module.text)).map((module) => module.file);

    expect(reaching).toEqual([]);
  });

  it('would catch a module that reached storage, however it spelled it', () => {
    for (const written of ['window.localStorage.getItem(k)', 'sessionStorage.setItem(k, v)', 'const db = indexedDB.open("x")', 'localStorage . clear()']) {
      expect(STORAGE.test(written), written).toBe(true);
    }
  });
});
