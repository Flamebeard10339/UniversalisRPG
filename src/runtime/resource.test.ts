import { describe, expect, it } from 'vitest';
import { restorePools } from './effects';
import { applyResultsNow, createGameState, initResources } from './runtime';
import { loadModule, Registry } from '../content/registry';
import { initialState } from './save';

const MODULE = `
# stat max-health
base: 20

# stat regeneration

# stat max-focus
base: 4

# resource health
rate: regeneration
max: max-health
display: full
on empty:
  say: You collapse.
  set: fainted

# resource focus
max: max-focus
start: 0
display: minimal
on full:
  give: 1 focus-charge

# item focus-charge
examine: A crackle of pent-up focus.
`;

describe('# resource: parsing and defaults', () => {
  it('hydrates fields, defaulting title/display and leaving optional rate/start absent', () => {
    const registry = loadModule(MODULE);

    const health = registry.resources.get('health')!;
    expect(health.title).toBe('Health'); // humanized default
    expect(health.rate).toBe('regeneration');
    expect(health.max).toBe('max-health');
    expect(health.start).toBeUndefined(); // absent => start full
    expect(health.display).toBe('full');
    expect(health.onEmpty.map((r) => r.kind)).toEqual(['say', 'set']);
    expect(health.onFull).toEqual([]);

    const focus = registry.resources.get('focus')!;
    expect(focus.rate).toBeUndefined(); // static pool, no rate stat
    expect(focus.start).toBe(0);
    expect(focus.display).toBe('minimal');
    expect(focus.onFull.map((r) => r.kind)).toEqual(['give']);
  });

  it('initResources fills each pool: full for an absent start, the literal for an explicit one', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    initResources(state, registry);

    expect(state.resources['health']).toBe(20); // full = statValue(max-health) base
    expect(state.resources['focus']).toBe(0); // explicit start
  });

  it('initResources only fills missing pools, so a loaded/mid-game level survives', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    restorePools(state, { health: 7 }); // pretend a save restored a damaged pool
    initResources(state, registry);

    expect(state.resources['health']).toBe(7); // untouched
    expect(state.resources['focus']).toBe(0); // still filled
  });

  it('a fresh baseline game carries full pools, so the save diff stays empty', () => {
    const registry = loadModule(MODULE);
    const base = initialState(registry);
    expect(base.resources).toEqual({ health: 20, focus: 0 });
  });

  it('rejects a resource with no max: stat', () => {
    expect(() => loadModule('# stat regeneration\n# resource broken\nrate: regeneration\n')).toThrow(/requires a max/);
  });

  it('rejects an unknown display mode', () => {
    expect(() => loadModule('# resource weird\nmax: max-health\ndisplay: sparkles\n')).toThrow(/display must be one of/);
  });
});

describe('drain: / restore: — the direct pool write', () => {
  function started(): { registry: Registry; state: ReturnType<typeof createGameState> } {
    const registry = loadModule(MODULE);
    const state = createGameState();
    initResources(state, registry);
    return { registry, state };
  }

  it('parses to one signed kind, the verb carrying the direction', () => {
    const registry = loadModule(`${MODULE}\n# entity trap\nspring:\n  drain: 5 health\n  restore: 2.5 focus\n`);
    expect(registry.entities.get('trap')!.actions[0].results).toEqual([
      { kind: 'pool', resource: 'health', delta: -5 },
      { kind: 'pool', resource: 'focus', delta: 2.5 },
    ]);
  });

  it('moves the level in both directions', () => {
    const { registry, state } = started();
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: -7 }]);
    expect(state.resources['health']).toBe(13);
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: 4 }]);
    expect(state.resources['health']).toBe(17);
  });

  it('clamps at 0 and at the live max rather than overshooting', () => {
    const { registry, state } = started();
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: -500 }]);
    expect(state.resources['health']).toBe(0);
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: 500 }]);
    expect(state.resources['health']).toBe(20);
  });

  it('fires on empty once as the pool crosses to 0, and not again while it sits there', () => {
    const { registry, state } = started();
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: -25 }]);
    expect(state.resources['health']).toBe(0);
    expect(state.flags.fainted).toBe(true);
    expect(state.log).toEqual(['You collapse.']);

    delete state.flags.fainted;
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: -5 }]);
    expect(state.flags.fainted).toBeUndefined(); // already empty: no second crossing
    expect(state.log).toEqual(['You collapse.']);
  });

  it('rolls a meter over per fill, batching the handler and keeping the remainder', () => {
    const { registry, state } = started();
    // focus caps at 4 and starts at 0; +10 is two full meters with 2 left over.
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'focus', delta: 10 }]);
    expect(state.resources['focus']).toBe(2);
    expect(state.inventory['focus-charge']).toBe(2);
  });

  it('names the resource in the error when it does not exist', () => {
    const { registry, state } = started();
    expect(() => applyResultsNow(state, registry, [{ kind: 'pool', resource: 'stamina', delta: -1 }])).toThrow(/unknown resource: stamina/);
  });
});
