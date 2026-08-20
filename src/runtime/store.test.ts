import { RuntimeError } from './error';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { memoryDriver, slotStore, type SlotDriver } from './store';

const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*(['"`])([^'"`]+)\1/g;

function moduleAt(specifier: string): string {
  const found = ['.ts', '.tsx', '/index.ts'].map((ending) => `${specifier}${ending}`).find((candidate) => existsSync(candidate));
  if (found === undefined) throw new Error(`${specifier} resolves to no module`);
  return found;
}

function reachedFrom(entry: string): { modules: string[]; outside: string[] } {
  const modules = new Set<string>();
  const outside = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (modules.has(file)) continue;
    modules.add(file);
    const directory = posix.dirname(file);
    for (const [, , specifier] of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      if (specifier.startsWith('.')) queue.push(moduleAt(posix.join(directory, specifier)));
      else outside.add(specifier);
    }
  }
  return { modules: [...modules].sort(), outside: [...outside].sort() };
}

function turning(start = 1_000): { now: () => number; pass: (ms: number) => void } {
  let at = start;
  return { now: () => at, pass: (ms) => void (at += ms) };
}

const stored = (now: () => number = () => 0): ReturnType<typeof slotStore> => slotStore(memoryDriver(), now);

const PAYLOADS = [
  '{"version":11,"time":5000}',
  '{ "version" : 11 ,  "time" : 5000 }',
  '{"time":5000,"version":11}',
  'not json at all',
  '',
  '   ',
  '{"nested":{"unicode":"é 😀"}}',
  'line one\nline two\r\nline three\n',
  '"already a json string"',
];

describe('the slot store keeps named text and nothing else (c1)', () => {
  it('reads, writes, removes and lists, and an absent slot is nothing rather than a raise', () => {
    const store = stored();

    expect(store.read('player')).toBeNull();
    expect(store.list()).toEqual([]);

    store.write('player', 'first');
    store.write('dev', 'second');
    expect(store.list()).toEqual(['dev', 'player']);
    expect(store.read('player')?.payload).toBe('first');

    store.remove('player');
    expect(store.read('player')).toBeNull();
    expect(store.list()).toEqual(['dev']);
    expect(() => store.remove('player')).not.toThrow();
  });

  it('reaches neither a save nor the filesystem, so a driver is the only thing that touches either', () => {
    expect(reachedFrom('src/runtime/store.ts')).toEqual({ modules: ['src/runtime/error.ts', 'src/runtime/store.ts'], outside: [] });
  });

  it('never parses a payload: what the store holds is the driver text it was handed', () => {
    const driver = memoryDriver();
    const store = slotStore(driver, () => 7);
    store.write('player', '{"version":11}');

    expect(JSON.parse(driver.read('player')!)).toEqual({ writtenAt: 7, payload: '{"version":11}' });
  });
});

describe('a slot knows when it was written, and the payload does not (c2)', () => {
  it('stamps the write off the clock it was built with', () => {
    const clock = turning();
    const store = stored(clock.now);

    expect(store.write('player', 'a').writtenAt).toBe(1_000);
    clock.pass(4_500);
    expect(store.write('player', 'a').writtenAt).toBe(5_500);
    expect(store.read('player')?.writtenAt).toBe(5_500);
  });

  it('stamps a payload that carries no stamp of its own, and leaves it carrying none', () => {
    const clock = turning();
    const store = stored(clock.now);
    const fixture = '{"version":11,"time":5000}';

    store.write('player', fixture);
    clock.pass(60_000);
    store.write('dev', fixture);

    const player = store.read('player')!;
    const dev = store.read('dev')!;
    expect(player.payload).toBe(dev.payload);
    expect(dev.writtenAt - player.writtenAt).toBe(60_000);
  });
});

describe('a slot reads back byte-identical (c3)', () => {
  for (const payload of PAYLOADS) {
    it(`round-trips ${JSON.stringify(payload).slice(0, 40)}`, () => {
      const store = stored();
      store.write('snapshot', payload);

      expect(store.read('snapshot')?.payload).toBe(payload);
    });
  }

  it('hands back what the last write put there, not a merge of the writes before it', () => {
    const store = stored();
    store.write('player', 'first');
    store.write('player', 'second');

    expect(store.read('player')?.payload).toBe('second');
  });
});

describe('a slot the driver cannot hand back is a message, not a crash (c7)', () => {
  const holding = (text: string): ReturnType<typeof slotStore> => {
    const driver: SlotDriver = { ...memoryDriver(), read: () => text, names: () => ['player'] };
    return slotStore(driver, () => 0);
  };

  it('names the slot when it is empty, when it does not parse, and when it is not a slot', () => {
    expect(() => holding('').read('player')).toThrow(new RuntimeError('slot player is empty'));
    expect(() => holding('{{{').read('player')).toThrow(/slot player does not parse/);
    expect(() => holding('{"payload":3}').read('player')).toThrow(/slot player is not a slot/);
    expect(() => holding('{"payload":"a"}').read('player')).toThrow(/slot player is not a slot/);
  });
});
