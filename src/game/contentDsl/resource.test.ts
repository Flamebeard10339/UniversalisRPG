import { describe, expect, it } from 'vitest';
import { createGameState, initResources, loadModule } from './runtime';
import { initialState } from './save';

// Chunk 1 (data plumbing): a `# resource` section parses, hydrates with the
// right defaults, drives initial pool levels, and validates its required max.
// Rate integration itself is covered by the resolver gates in resolve.test.ts.
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
    state.resources['health'] = 7; // pretend a save restored a damaged pool
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
    expect(() => loadModule('# resource broken\nrate: regeneration\n')).toThrow(/requires a max/);
  });

  it('rejects an unknown display mode', () => {
    expect(() => loadModule('# resource weird\nmax: max-health\ndisplay: sparkles\n')).toThrow(/display must be one of/);
  });
});
