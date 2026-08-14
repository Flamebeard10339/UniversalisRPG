import { describe, expect, it } from 'vitest';
import { craft, createGameState, RuntimeError, recipeCraftable, resolve } from './runtime';
import { CRAFT_LABEL, loadModule, Registry } from '../content/registry';
import { applyDirective, startSession, view } from './session';
import { SAVE_VERSION } from './save';
import { secondsToMs, toMilliUnits } from './units';

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
stations: oven

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

# save stocked
{"version":${SAVE_VERSION},"inventory":{"jug-of-water":1,"pot-of-flour":1}}
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

describe('recipe parsing', () => {
  it('parses a stationless recipe', () => {
    const registry = loaded();
    const dough = registry.recipes.get('dough')!;
    expect(dough.requiresCapability).toBeUndefined();
    expect(dough.in).toEqual([{ item: 'jug-of-water' }, { item: 'pot-of-flour' }]);
    expect(dough.out).toEqual([{ item: 'dough' }]);
    expect(dough.skill).toEqual({ skill: 'cooking', amount: 2 });
    expect(dough.say).toBe('You knead water and flour into a ball of dough.');
  });

  it('parses a stationed recipe', () => {
    const registry = loaded();
    const bread = registry.recipes.get('bread')!;
    expect(bread.requiresCapability).toBe('oven');
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
    // bread has no time:, so it compiles to an instant, non-repeating craft.
    expect(state.time).toBe(0);
    expect(state.activeAction).toBeNull();
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
    const session = startSession(registry);
    let v = view(session);
    expect(v.choices.map((c) => c.id)).not.toContain('craft:dough');
    expect(v.choices.map((c) => c.id)).not.toContain('craft:bread');

    applyDirective(session, { kind: 'load', save: 'stocked' });
    v = view(session);
    expect(v.choices.map((c) => c.id)).toContain('craft:dough');
    expect(v.choices.map((c) => c.id)).not.toContain('craft:bread');
  });
});

// A differently-named capability ("stove"), so the match is proved to be on the
// capability id rather than a coincidence of reusing the word "oven".
const STATION_MODULE = `
# item water
examine: A splash of water.

# item broth
examine: A simple vegetable broth.

# entity stovetop
examine: A small camp stove.
stations: stove

# location camp
x: 2, y: 0
entities:
  stovetop

# location clearing
x: 3, y: 0

# recipe soup
station: stove
in: water
out: broth

# recipe stew
in: water
out: broth
`;

describe('recipe station capability', () => {
  it('a station-gated recipe is craftable where the capability is present, not where it is absent; a stationless recipe is craftable anywhere', () => {
    const registry = loadModule(STATION_MODULE);
    const soup = registry.recipes.get('soup')!;
    const stew = registry.recipes.get('stew')!;

    const atCamp = createGameState('camp');
    atCamp.inventory.water = 1;
    expect(recipeCraftable(soup, registry, atCamp)).toBe(true);

    const atClearing = createGameState('clearing');
    atClearing.inventory.water = 1;
    expect(recipeCraftable(soup, registry, atClearing)).toBe(false);

    // Stationless: craftable at both, purely on input affordability.
    expect(recipeCraftable(stew, registry, atCamp)).toBe(true);
    expect(recipeCraftable(stew, registry, atClearing)).toBe(true);
  });
});

// A time>0 recipe leaves a `recipe.<id>` activeAction for a later resolve().
const SPANNABLE_MODULE = `
# item raw-clay
examine: A lump of raw clay.

# item clay-brick
examine: A fired clay brick.

# location kiln-yard
x: 0, y: 0
starting

# recipe brick
time: 2
in: raw-clay
out: clay-brick
`;

describe('spannable repeating craft', () => {
  it('craft() on a time>0 recipe fires one completion then leaves an activeAction a later resolve() continues', () => {
    const registry = loadModule(SPANNABLE_MODULE);
    const state = createGameState('kiln-yard');
    state.inventory['raw-clay'] = 3;

    craft('brick', registry, state);
    expect(state.inventory['clay-brick']).toBe(1);
    expect(state.inventory['raw-clay']).toBe(2);
    expect(state.time).toBe(secondsToMs(2));
    expect(state.activeAction).toEqual({ ownerRef: 'recipe.brick', actionSlug: CRAFT_LABEL, repeating: true, implicitTarget: toMilliUnits(1), cadences: { player: { progress: 0, attemptsMade: 0 } }, roster: { player: { ownerRef: 'recipe.brick', actionSlug: CRAFT_LABEL, target: 'brick' } } });

    resolve(state, registry, secondsToMs(6)); // two more completions' worth of time
    expect(state.inventory['clay-brick']).toBe(3);
    expect(state.inventory['raw-clay']).toBe(0);
    expect(state.activeAction).toBeNull(); // input exhausted mid-way through the span
  });
});

// Success + burnt must total the craft count, each consuming exactly one input.
const BURN_MODULE = `
# stat firing
base: 80

# stat tile-complexity
base: 60

# item raw-clay
examine: A lump of raw clay.

# item clay-tile
examine: A fired clay tile.

# item slag
examine: A ruined, half-melted lump of clay.

# location kiln-yard
x: 0, y: 0
starting

# recipe tile
time: 1
accuracy: firing
evasion: tile-complexity
in: raw-clay
out: clay-tile
burnt: slag
`;

describe('burn: accuracy < 1 with a burnt output', () => {
  it('produces both fired and burnt outcomes over many crafts, each consuming exactly one input, fired + burnt totaling the craft count', () => {
    const registry = loadModule(BURN_MODULE);
    const attempts = 500;
    const state = createGameState('kiln-yard');
    state.inventory['raw-clay'] = attempts;

    craft('tile', registry, state);
    resolve(state, registry, secondsToMs(attempts * 10)); // generous horizon; input exhausts well before this

    const fired = state.inventory['clay-tile'] ?? 0;
    const burnt = state.inventory['slag'] ?? 0;
    expect(state.inventory['raw-clay']).toBe(0);
    expect(fired).toBeGreaterThan(0);
    expect(burnt).toBeGreaterThan(0);
    expect(fired + burnt).toBe(attempts);
    expect(state.activeAction).toBeNull();
  });
});
