import { describe, expect, it } from 'vitest';
import type { ActionResult } from '../grammar/actionResult';
import { loadInEnglish } from '../content/engineLocale';
import { Registry } from '../content/registry';
import { applyResultsNow, createGameState, grantBuff, PLAYER } from './runtime';
import { GameState } from './state';

const ITEMS = ['# item bones', '# item coins', '# item gem', '# item tail'];

const loaded = new Map<string, { registry: Registry; results: ActionResult[] }>();

function fight(...body: string[]) {
  const source = [...ITEMS, '# stat luck', 'base: 60', '# stat ward', 'base: 60', '# item charm', 'food, +400 luck, 60s', '# flag lit', '# entity giant-rat', 'fight:', ...body.map((line) => `  ${line}`)].join('\n');
  const held = loaded.get(source);
  if (held) return held;
  const registry = loadInEnglish(source);
  const built = { registry, results: registry.entities.get('giant-rat')!.actions[0].results };
  loaded.set(source, built);
  return built;
}

function run(seed: number, body: string[], count = 1, before: (state: GameState, registry: Registry) => void = () => {}): GameState {
  const { registry, results } = fight(...body);
  const state = createGameState();
  state.rng = seed;
  before(state, registry);
  applyResultsNow(state, registry, results, count);
  return state;
}

function rate(body: string[], runs = 4000, before?: (state: GameState, registry: Registry) => void): (item: string) => number {
  const counts: Record<string, number> = {};
  for (let seed = 1; seed <= runs; seed++) {
    const state = run(seed, body, 1, before);
    for (const [item, held] of Object.entries(state.inventory)) counts[item] = (counts[item] ?? 0) + held;
  }
  return (item) => (counts[item] ?? 0) / runs;
}

describe('a wrapper draws for its own selector', () => {
  it('fires authored odds at the rate it authored', () => {
    expect(rate(['1 in 5: give: 1 tail'])('tail')).toBeCloseTo(0.2, 1);
    expect(rate(['1 in 2: give: 1 tail'])('tail')).toBeCloseTo(0.5, 1);
  });

  it('rolls each sibling independently, which is what every-entry means', () => {
    const observed = rate(['give: 1 bones', '1 in 2: give: 1 coins', '1 in 2: give: 1 tail']);
    expect(observed('bones')).toBe(1);
    expect(observed('coins')).toBeCloseTo(0.5, 1);
    expect(observed('tail')).toBeCloseTo(0.5, 1);
  });

  it('selects exactly one row of a one of:, in proportion to weight', () => {
    const body = ['one of:', '  6x: nothing', '  3x: give: 1 coins', '  1x: give: 1 gem'];
    const observed = rate(body);
    expect(observed('coins')).toBeCloseTo(0.3, 1);
    expect(observed('gem')).toBeCloseTo(0.1, 1);
    for (let seed = 1; seed <= 200; seed++) {
      const held = run(seed, body).inventory;
      expect((held.coins ?? 0) + (held.gem ?? 0)).toBeLessThanOrEqual(1);
    }
  });

  it('reads a row weight from a stat, so a buff shifts the distribution', () => {
    const body = ['one of:', '  1x: give: 1 coins', '  luck: give: 1 gem'];
    expect(rate(body)('gem')).toBeGreaterThan(0.9);
  });

  it('fires a contest at hitChance, and a bonus on the left side moves it', () => {
    const even = rate(['luck vs ward: give: 1 gem']);
    expect(even('gem')).toBeCloseTo(0.5, 1);
    const favoured = rate(['luck vs ward: give: 1 gem'], 4000, (state, registry) => {
      grantBuff(state, PLAYER, registry.items.get('charm')!, Infinity);
    });
    expect(favoured('gem')).toBeGreaterThan(even('gem'));
    expect(favoured('gem')).toBeGreaterThan(0.9);
  });

  it('applies a gate as a certainty, drawing nothing either way', () => {
    expect(run(1, ['if lit: give: 1 gem']).inventory.gem).toBeUndefined();
    const lit = run(1, ['if lit: give: 1 gem'], 1, (state) => {
      state.flags.lit = true;
    });
    expect(lit.inventory.gem).toBe(1);
    expect(lit.rng).toBe(1);
  });
});

describe('a gated row leaves the pool before the draw', () => {
  const body = ['one of:', '  1x if lit: give: 1 coins', '  1x: give: 1 gem'];

  it('gives the survivors the failed row s share rather than voiding a selection', () => {
    expect(rate(body, 500)('gem')).toBe(1);
    const both = rate(body, 2000, (state) => {
      state.flags.lit = true;
    });
    expect(both('gem')).toBeCloseTo(0.5, 1);
    expect(both('coins')).toBeCloseTo(0.5, 1);
  });

  it('produces nothing when every row is gated off', () => {
    expect(run(1, ['one of:', '  1x if lit: give: 1 coins']).inventory).toEqual({});
  });
});

describe('draw order is fixed and total', () => {
  const layered = ['give: 1 bones', '1 in 2:', '  one of:', '    1x: give: 5-10 coins', '    1x: give: 1 gem', 'luck vs ward: give: 1 tail'];

  it('gives one sequence from one seed', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(run(seed, layered).inventory).toEqual(run(seed, layered).inventory);
    }
  });

  it('leaves a certainty free of the rng, so a plain grant costs no draw', () => {
    const { registry, results } = fight('give: 1 bones', 'say: done');
    const state = createGameState();
    state.rng = 12345;
    applyResultsNow(state, registry, results);
    expect(state.rng).toBe(12345);
  });

  it('spends one draw on a range and none on a point', () => {
    const { registry } = fight('give: 1 bones');
    const state = createGameState();
    state.rng = 12345;
    applyResultsNow(state, registry, [{ kind: 'give', item: 'coins', amount: { min: 1, max: 1 } }]);
    expect(state.rng).toBe(12345);
    applyResultsNow(state, registry, [{ kind: 'give', item: 'coins', amount: { min: 1, max: 4 } }]);
    expect(state.rng).not.toBe(12345);
  });

  it('samples a produced count as an integer covering both ends of the range', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 400; seed++) {
      const held = run(seed, ['give: 5-10 coins']).inventory.coins!;
      expect(Number.isInteger(held)).toBe(true);
      seen.add(held);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10]);
  });
});

describe('a stochastic group is applied count times, not scaled once', () => {
  it('rolls a chance per repetition', () => {
    const between = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) between.add(run(seed, ['1 in 2: give: 1 tail'], 10).inventory.tail ?? 0);
    expect(between.size).toBeGreaterThan(3);
    expect(Math.max(...between)).toBeLessThanOrEqual(10);
  });

  it('rolls a range per repetition', () => {
    const totals = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) totals.add(run(seed, ['give: 1-2 coins'], 4).inventory.coins!);
    expect([...totals].some((total) => total > 4 && total < 8)).toBe(true);
  });

  it('leaves what a batch says alone, so adding a chance does not multiply the line', () => {
    const speaks = (body: string[]): number => {
      const { registry, results } = fight(...body);
      const state = createGameState();
      applyResultsNow(state, registry, results, 5);
      return state.log.filter((line) => line === 'hi').length;
    };
    expect(speaks(['say: hi', 'give: 1 bones'])).toBe(1);
    expect(speaks(['say: hi', '1 in 1000000: give: 1 gem'])).toBe(1);
  });

  it('opens a modal once for the batch too, the other line a count ignores', () => {
    const { registry } = fight('give: 1 bones');
    const state = createGameState();
    applyResultsNow(state, registry, [{ kind: 'open-modal', modal: 'name-yourself' }, { kind: 'give', item: 'coins', amount: { min: 1, max: 4 } }], 5);
    expect(state.log.filter((line) => line === 'modal:name-yourself')).toHaveLength(1);
    expect(state.modals.map((frame) => frame.name)).toEqual(['name-yourself']);
  });

  it('lets a say inside a wrapper speak on every repetition that reaches it', () => {
    const { registry, results } = fight('1 in 1: say: hi');
    const state = createGameState();
    applyResultsNow(state, registry, results, 5);
    expect(state.log.filter((line) => line === 'hi')).toHaveLength(5);
  });

  it('still scales a certainty, which is what keeps a batched craft cheap', () => {
    const { registry } = fight('give: 1 bones');
    const state = createGameState();
    state.rng = 7;
    applyResultsNow(state, registry, [{ kind: 'give', item: 'coins', amount: { min: 3, max: 3 } }], 10);
    expect(state.inventory.coins).toBe(30);
    expect(state.rng).toBe(7);
  });
});

describe('roll: applies a named table', () => {
  const TABLES = ['# droptable rare', 'one of:', '  1x: give: 1 gem', '# droptable common', 'give: 1 bones', '1 in 2:', '  roll: rare'];

  it('reaches the table s results, and the table s own wrappers roll', () => {
    const registry = loadInEnglish([...ITEMS, ...TABLES, '# entity giant-rat', 'fight:', '  roll: common'].join('\n'));
    const results = registry.entities.get('giant-rat')!.actions[0].results;
    let gems = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const state = createGameState();
      state.rng = seed;
      applyResultsNow(state, registry, results);
      expect(state.inventory.bones).toBe(1);
      gems += state.inventory.gem ?? 0;
    }
    expect(gems / 400).toBeCloseTo(0.5, 1);
  });
});
