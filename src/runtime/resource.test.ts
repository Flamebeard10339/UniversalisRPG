import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { eventsFor, restorePools } from './effects';
import { applyResultsNow, createGameState, initResources } from './runtime';
import { Registry } from '../content/registry';
import { loadModule } from '../content/load';
import { initialState } from './save';
import { toMilliUnits } from './units';

const MODULE = `
# stat max-health
base: 20

# stat regeneration

# stat max-focus
base: 4

# flag fainted

# resource health
rate: regeneration
max: max-health
display: full

# resource focus
max: max-focus
start: 0
display: minimal

# event fainting
resource: health
trigger: on empty

# event focused
resource: focus
trigger: on full

# entity player
on fainting:
  say: You collapse.
  set: fainted
on focused:
  give: 1 focus-charge

# item focus-charge
examine: A crackle of pent-up focus.
`;

describe('# resource: parsing and defaults', () => {
  it('hydrates fields, defaulting title/display and leaving optional rate/start absent', () => {
    const registry = loadModule(MODULE);

    const health = registry.resources.get('health')!;
    expect(health.title).toBe('Health');
    expect(health.rate).toBe('regeneration');
    expect(health.max).toBe('max-health');
    expect(health.start).toBeUndefined();
    expect(health.display).toBe('full');
    expect(eventsFor(registry, 'health', 'on empty').map((event) => event.id)).toEqual(['fainting']);
    expect(eventsFor(registry, 'health', 'on full')).toEqual([]);

    const focus = registry.resources.get('focus')!;
    expect(focus.rate).toBeUndefined();
    expect(focus.start).toBe(0);
    expect(focus.display).toBe('minimal');
    expect(eventsFor(registry, 'focus', 'on full').map((event) => event.id)).toEqual(['focused']);
    expect(registry.player!.handlers.map((handler) => handler.event)).toEqual(['fainting', 'focused']);
  });

  it('initResources fills each pool: full for an absent start, the literal for an explicit one', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    initResources(state, registry);

    expect(state.resources['health']).toBe(toMilliUnits(20));
    expect(state.resources['focus']).toBe(0);
  });

  it('initResources only fills missing pools, so a loaded/mid-game level survives', () => {
    const registry = loadModule(MODULE);
    const state = createGameState();
    restorePools(state, { health: 7 });
    initResources(state, registry);

    expect(state.resources['health']).toBe(7);
    expect(state.resources['focus']).toBe(0);
  });

  it('a fresh baseline game carries full pools, so the save diff stays empty', () => {
    const registry = loadModule(MODULE);
    const base = initialState(registry);
    expect(base.resources).toEqual({ health: toMilliUnits(20), focus: 0 });
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
      { kind: 'pool', resource: 'health', delta: point(-5) },
      { kind: 'pool', resource: 'focus', delta: point(2.5) },
    ]);
  });

  it('moves the level in both directions', () => {
    const { registry, state } = started();
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: point(-7) }]);
    expect(state.resources['health']).toBe(toMilliUnits(13));
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: point(4) }]);
    expect(state.resources['health']).toBe(toMilliUnits(17));
  });

  it('clamps at 0 and at the live max rather than overshooting', () => {
    const { registry, state } = started();
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: point(-500) }]);
    expect(state.resources['health']).toBe(0);
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: point(500) }]);
    expect(state.resources['health']).toBe(toMilliUnits(20));
  });

  it('fires on empty once as the pool crosses to 0, and not again while it sits there', () => {
    const { registry, state } = started();
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: point(-25) }]);
    expect(state.resources['health']).toBe(0);
    expect(state.flags.fainted).toBe(true);
    expect(state.log).toEqual(['You collapse.']);

    delete state.flags.fainted;
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'health', delta: point(-5) }]);
    expect(state.flags.fainted).toBeUndefined();
    expect(state.log).toEqual(['You collapse.']);
  });

  it('rolls a meter over per fill, batching the handler and keeping the remainder', () => {
    const { registry, state } = started();
    applyResultsNow(state, registry, [{ kind: 'pool', resource: 'focus', delta: point(10) }]);
    expect(state.resources['focus']).toBe(toMilliUnits(2));
    expect(state.inventory['focus-charge']).toBe(2);
  });

  it('names the resource in the error when it does not exist', () => {
    const { registry, state } = started();
    expect(() => applyResultsNow(state, registry, [{ kind: 'pool', resource: 'stamina', delta: point(-1) }])).toThrow(/unknown resource: stamina/);
  });
});
