import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { armAction, armFightAction, createGameState, encounterView, GameState, grantBuff, initResources, PLAYER, resolve, statRange, statValue, useFight } from './runtime';
import { Registry } from '../content/registry';
import { loadModule } from '../content/load';
import { diffState, initialState, loadSave, SAVE_VERSION } from './save';
import { secondsToMs, toMilliUnits } from './units';

const MODULE = `
# variable engagement-seconds
value: 0

# stat attack
base: 10

# stat wild-attack
base: 4-7

# stat dr

# stat max-health
base: 30

# stat regeneration

# resource health
rate: regeneration
max: max-health

# stat max-sawdust
base: 8

# resource sawdust
max: max-sawdust

# event death
resource: health
trigger: on empty

# item straw
examine: A fistful of straw.

# item war-brew
food, +50 attack, 60s

# action strike
title: strike
continuous
time: 1
damage: my attack vs their dr
depletes: their health

# action flail
title: flail
continuous
time: 1
damage: my wild-attack vs their dr
depletes: their health

# action chip
title: chip
time: 1
damage: my attack vs their dr
depletes: their health

# entity player
stats: max-health 30, attack 10, wild-attack 4-7
uses: strike, flail, chip
on death:
  say: You black out.

# entity training-dummy
flags: dummies-felled
stats: max-health 12, dr 2
on death:
  add: dummies-felled 1
  restore: 4 sawdust

# entity straw-man
stats: max-health 40, dr 1
on death:
  credit:
    give: 1 straw

# entity iron-golem
stats: max-health 3, dr 99

# entity clay-golem
stats: max-health 3.5, dr 99

# entity wild-boar
stats: max-health 500, wild-attack 4-7
uses: flail

# entity anvil
// One-sided — an ordinary action, which must open no encounter at all.
dent:
  time: 1
  say: Clang.

# entity sparring-partner
stats: max-health 40, dr 1
allies: sparring-dog

# entity sparring-dog
stats: max-health 4, dr 0

# location training-hall
x: 0, y: 0
entities: 3 training-dummy, anvil

# location sparring-yard
x: 1, y: 0
entities: 2 sparring-partner
`;

function loaded(): Registry {
  return loadModule(MODULE);
}

function started(registry: Registry): GameState {
  const state = createGameState('nowhere');
  initResources(state, registry);
  return state;
}

describe('# entity stats: — an actor sheet', () => {
  it('parses assignments into ranges, point or interval alike', () => {
    const registry = loaded();
    expect(registry.entities.get('training-dummy')!.stats).toEqual({ 'max-health': point(12), dr: point(2) });
    expect(loadModule('# stat attack\n# entity ogre\nstats: attack 4-7').entities.get('ogre')!.stats).toEqual({ attack: { min: 4, max: 7 } });
  });

  it('leaves an entity that declares nothing with an empty sheet', () => {
    expect(loaded().entities.get('anvil')!.stats).toEqual({});
  });

  it('reads an actor own base where it names one and the global default where it does not', () => {
    const registry = loaded();
    const state = started(registry);
    expect(statValue('max-health', state, registry, 'training-dummy')).toBe(12);
    expect(statValue('max-health', state, registry, PLAYER)).toBe(30);
    expect(statValue('attack', state, registry, 'training-dummy')).toBe(10);
  });

  it('keeps the player buffs and the running action off other actors', () => {
    const registry = loaded();
    const state = started(registry);
    grantBuff(state, PLAYER, registry.items.get('war-brew')!, secondsToMs(60));

    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(60));
    expect(statRange('attack', state, registry, 'training-dummy')).toEqual(point(10));
  });
});

describe('encounter state', () => {
  it('arms a two-sided action with the fought entity and its own pools', () => {
    const registry = loaded();
    const state = started(registry);
    armFightAction('strike', 'training-dummy', registry, state);

    expect(state.activeAction!.actors).toEqual({ 'training-dummy': { resources: { health: toMilliUnits(12), sawdust: toMilliUnits(8) }, rateRemainders: {} } });
    expect(state.resources['health']).toBe(toMilliUnits(30));
  });

  it('fills an actor from its own max even when the resource declares a start:', () => {
    const registry = loadModule(MODULE.replace('max: max-health\n', 'max: max-health\nstart: 5\n'));
    const state = started(registry);
    expect(state.resources['health']).toBe(toMilliUnits(5));

    armFightAction('strike', 'training-dummy', registry, state);
    expect(state.activeAction!.actors!['training-dummy'].resources.health).toBe(toMilliUnits(12));
  });

  it('opens no encounter for a one-sided action', () => {
    const registry = loaded();
    const state = started(registry);
    armAction('entity', 'anvil', 'dent', registry, state);
    expect(state.activeAction!.actors).toBeUndefined();
  });

  it('survives a save round-trip', () => {
    const registry = loaded();
    const state = started(registry);
    armFightAction('strike', 'training-dummy', registry, state);

    const diff = diffState(state, initialState(registry));
    const restored = createGameState();
    loadSave(restored, { version: SAVE_VERSION, diff }, registry);
    expect(restored.activeAction).toEqual(state.activeAction);
  });
});

describe('damage against a target pool', () => {
  it('drains the target by attack minus its own dr, truncated', () => {
    const registry = loaded();
    const state = started(registry);
    useFight('strike', 'training-dummy', registry, state);

    expect(state.time).toBe(secondsToMs(1));
    expect(state.activeAction!.actors!['training-dummy'].resources.health).toBe(toMilliUnits(4));
  });

  it('ends the fight when the pool empties, firing on success, and stands a fresh target up', () => {
    const registry = loaded();
    const state = started(registry);
    useFight('strike', 'training-dummy', registry, state);
    resolve(state, registry, secondsToMs(2));

    expect(state.flags['training-dummy.dummies-felled']).toBe(1);
    expect(state.activeAction!.actors!['training-dummy'].resources.health).toBe(toMilliUnits(12));
    expect(state.time).toBe(secondsToMs(2));
  });

  it('runs the felled actor own handler on the felled actor', () => {
    const registry = loaded();
    const state = started(registry);
    (state.resources as Record<string, number>)['sawdust'] = 0;
    useFight('strike', 'training-dummy', registry, state);
    resolve(state, registry, secondsToMs(10));

    expect(state.activeAction!.actors!['training-dummy'].resources['sawdust']).toBeGreaterThan(0);
    expect(state.resources['sawdust']).toBe(0);
    expect(state.log).not.toContain('You black out.');
    expect(state.resources['health']).toBe(toMilliUnits(30));
  });

  it('floors at min-damage so a target harder than the attacker still dies', () => {
    const registry = loaded();
    const state = started(registry);
    useFight('chip', 'iron-golem', registry, state);
    expect(state.activeAction!.actors!['iron-golem'].resources.health).toBe(toMilliUnits(2));

    resolve(state, registry, secondsToMs(3));
    expect(state.activeAction).toBeNull();
  });

  it('is down a whole unit short of nothing, so a sliver of health is never a standing foe', () => {
    const registry = loaded();
    const state = started(registry);
    useFight('chip', 'clay-golem', registry, state);
    expect(state.activeAction!.actors!['clay-golem'].resources.health).toBe(toMilliUnits(2.5));

    resolve(state, registry, secondsToMs(2));
    expect(state.activeAction!.actors!['clay-golem'].resources.health).toBe(toMilliUnits(1.5));

    resolve(state, registry, secondsToMs(3));
    expect(state.activeAction).toBeNull();
  });

  it('spends a foe its own declared range, so two of its swings differ', () => {
    const registry = loaded();
    const state = started(registry);
    armFightAction('chip', 'wild-boar', registry, state);

    const levels: number[] = [];
    for (let t = 1; t <= 4; t++) {
      resolve(state, registry, secondsToMs(t));
      levels.push(state.resources['health']);
    }
    const bites = levels.map((level, i) => (i === 0 ? toMilliUnits(30) : levels[i - 1]) - level);
    for (const bite of bites) expect(bite).toBeGreaterThanOrEqual(toMilliUnits(4));
    for (const bite of bites) expect(bite).toBeLessThanOrEqual(toMilliUnits(7));
    expect(new Set(bites).size).toBeGreaterThan(1);
  });

  it('samples ranged damage per hit rather than averaging it', () => {
    const registry = loaded();
    const state = started(registry);
    armFightAction('flail', 'straw-man', registry, state);

    const levels: number[] = [];
    for (let t = 1; t <= 8; t++) {
      resolve(state, registry, secondsToMs(t));
      levels.push(state.activeAction!.actors!['straw-man'].resources.health);
    }
    const hits = levels.map((level, i) => (i === 0 ? toMilliUnits(40) : levels[i - 1]) - level);
    for (const hit of hits) expect(hit).toBeGreaterThanOrEqual(toMilliUnits(3));
    for (const hit of hits) expect(hit).toBeLessThanOrEqual(toMilliUnits(6));
    expect(new Set(hits).size).toBeGreaterThan(1);
  });
});

describe('a two-sided action resolves per attempt, and stays associative doing it', () => {
  it('matches one jump against random split points, pools and rng alike', () => {
    const registry = loaded();
    function fighting(): GameState {
      const state = started(registry);
      armFightAction('flail', 'straw-man', registry, state);
      return state;
    }

    const oneShot = fighting();
    resolve(oneShot, registry, secondsToMs(200));
    expect(oneShot.inventory['straw']).toBeGreaterThan(0);

    let seed = 5;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 25; trial++) {
      const waypoints = new Set<number>();
      for (let i = 0; i < 3 + Math.floor(rand() * 6); i++) waypoints.add(rand() * 200);
      const sorted = [...waypoints].filter((t) => t > 0 && t < 200).sort((a, b) => a - b);
      sorted.push(200);

      const folded = fighting();
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.time).toBe(oneShot.time);
      expect(folded.rng).toBe(oneShot.rng);
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
      expect(folded.resources).toEqual(oneShot.resources);
    }
  });
});

describe('how many of a foe are left is read off the population, not counted twice', () => {
  const inTheHall = (registry: Registry): GameState => {
    const state = createGameState('training-hall');
    initResources(state, registry);
    return state;
  };

  it('falls as the population falls', () => {
    const registry = loaded();
    const state = inTheHall(registry);
    armFightAction('strike', 'training-dummy', registry, state);
    expect(encounterView(state, registry)!.foes.map((foe) => [foe.id, foe.remaining])).toEqual([['training-dummy', 3]]);

    resolve(state, registry, secondsToMs(2));
    expect(state.populations['training-hall']['training-dummy'].down).toBe(1);

    armFightAction('strike', 'training-dummy', registry, state);
    expect(encounterView(state, registry)!.foes[0].remaining).toBe(2);
  });

  it('says nothing of a foe the location holds no population of', () => {
    const registry = loaded();
    const state = createGameState('sparring-yard');
    initResources(state, registry);
    armFightAction('strike', 'sparring-partner', registry, state);

    expect(encounterView(state, registry)!.foes.map((foe) => [foe.id, foe.remaining])).toEqual([
      ['sparring-partner', 2],
      ['sparring-dog', null],
    ]);
  });
});
