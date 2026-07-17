import { describe, expect, it } from 'vitest';
import { craft, createGameState, loadModule, Registry, RuntimeError, recipeCraftable } from './runtime';
import { startSession, view } from './session';

const MODULE = `
# item jug-of-water
examine: A clay jug of clean water.

# item pot-of-flour
examine: A small pot of milled flour.

# item dough
examine: A ball of raw dough.

# item bread
examine: A warm loaf.

# skill cooking

# entity oven
examine: A stone oven.

# location guide-house
x: 0, y: 0
starting
entities:
  oven

# location beach
x: 1, y: 0

# recipe dough
in: jug-of-water, pot-of-flour
out: dough
skill: cooking 2
say: You knead water and flour into a ball of dough.

# recipe bread
station: oven
in: dough
out: bread
skill: cooking 4
say: The oven bakes your dough into a golden loaf.
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

describe('recipe parsing', () => {
  it('parses a stationless recipe', () => {
    const registry = loaded();
    const dough = registry.recipes.get('dough')!;
    expect(dough.station).toBeUndefined();
    expect(dough.in).toEqual([{ item: 'jug-of-water' }, { item: 'pot-of-flour' }]);
    expect(dough.out).toEqual([{ item: 'dough' }]);
    expect(dough.skill).toEqual({ skill: 'cooking', amount: 2 });
    expect(dough.say).toBe('You knead water and flour into a ball of dough.');
  });

  it('parses a stationed recipe', () => {
    const registry = loaded();
    const bread = registry.recipes.get('bread')!;
    expect(bread.station).toBe('oven');
    expect(bread.in).toEqual([{ item: 'dough' }]);
    expect(bread.out).toEqual([{ item: 'bread' }]);
    expect(bread.skill).toEqual({ skill: 'cooking', amount: 4 });
  });
});

describe('craft', () => {
  it('consumes inputs, gives outputs, grants xp, and logs say when held and at station', () => {
    const registry = loaded();
    const state = createGameState('guide-house');
    state.inventory.dough = 1;
    craft('bread', registry, state);
    expect(state.inventory.dough).toBe(0);
    expect(state.inventory.bread).toBe(1);
    expect(state.xp.cooking).toBe(4);
    expect(state.log).toContain('The oven bakes your dough into a golden loaf.');
  });

  it('throws when an input is missing', () => {
    const registry = loaded();
    const state = createGameState('guide-house');
    expect(() => craft('dough', registry, state)).toThrow(RuntimeError);
  });

  it('throws for a stationed recipe when the station entity is absent from the current location', () => {
    const registry = loaded();
    const state = createGameState('beach');
    state.inventory.dough = 1;
    expect(() => craft('bread', registry, state)).toThrow(RuntimeError);
  });

  it('succeeds for a stationed recipe once the station entity is present', () => {
    const registry = loaded();
    const state = createGameState('guide-house');
    state.inventory.dough = 1;
    expect(() => craft('bread', registry, state)).not.toThrow();
    expect(state.inventory.bread).toBe(1);
  });

  it('crafts a stationless recipe regardless of location', () => {
    const registry = loaded();
    const state = createGameState('beach');
    state.inventory['jug-of-water'] = 1;
    state.inventory['pot-of-flour'] = 1;
    craft('dough', registry, state);
    expect(state.inventory.dough).toBe(1);
  });
});

describe('recipeCraftable', () => {
  it('reflects inventory and station presence', () => {
    const registry = loaded();
    const bread = registry.recipes.get('bread')!;
    const state = createGameState('guide-house');
    expect(recipeCraftable(bread, registry, state)).toBe(false);
    state.inventory.dough = 1;
    expect(recipeCraftable(bread, registry, state)).toBe(true);
    state.location = 'beach';
    expect(recipeCraftable(bread, registry, state)).toBe(false);
  });
});

describe('session craft choices', () => {
  it('enumerates a craft choice when craftable and omits it otherwise', () => {
    const registry = loaded();
    const session = startSession(registry, createGameState('guide-house'));
    let v = view(session);
    expect(v.choices.map((c) => c.id)).not.toContain('craft:dough');
    expect(v.choices.map((c) => c.id)).not.toContain('craft:bread');

    session.state.inventory['jug-of-water'] = 1;
    session.state.inventory['pot-of-flour'] = 1;
    v = view(session);
    expect(v.choices.map((c) => c.id)).toContain('craft:dough');
    expect(v.choices.map((c) => c.id)).not.toContain('craft:bread');
  });
});
