import { describe, expect, it } from 'vitest';
import { point } from '../grammar/range';
import { armAction, createGameState, GameState, initResources, PLAYER, resolve, statRange, statValue, useAction } from './runtime';
import { loadModule, Registry } from '../content/registry';
import { diffState, initialState, loadSave, SAVE_VERSION } from './save';
import { secondsToMs, toMilliUnits } from './units';

// training-dummy: point damage, for exact arithmetic.
// straw-man: ranged damage, for sampling and the associativity gate.
// iron-golem: dr above the attacker's whole range, for the min-damage floor.
const MODULE = `
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
on empty:
  say: You black out.

# item straw
examine: A fistful of straw.

# entity training-dummy
flags: dummies-felled
stats: max-health 12, dr 2
strike:
  repeating
  time: 1
  target: health
  ability: attack
  dr: dr
  on success:
    add: dummies-felled 1

# entity straw-man
stats: max-health 40, dr 1
flail:
  repeating
  time: 1
  target: health
  ability: wild-attack
  dr: dr
  give: 1 straw

# entity iron-golem
stats: max-health 3, dr 99
chip:
  time: 1
  target: health
  ability: attack
  dr: dr

# entity anvil
// No target: — an ordinary action, which must open no encounter at all.
dent:
  time: 1
  say: Clang.
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
    expect(statValue('max-health', state, registry, PLAYER)).toBe(30); // the global # stat
    expect(statValue('attack', state, registry, 'training-dummy')).toBe(10); // not named: falls through
  });

  it('keeps the player buffs and the running action off other actors', () => {
    const registry = loaded();
    const state = started(registry);
    state.activeBuffs['brew:attack'] = { statId: 'attack', kind: 'added', amount: point(50), expiresAt: secondsToMs(60) };

    expect(statRange('attack', state, registry, PLAYER)).toEqual(point(60));
    expect(statRange('attack', state, registry, 'training-dummy')).toEqual(point(10));
  });
});

describe('encounter state', () => {
  it('arms a target: action with the fought entity and its own pools', () => {
    const registry = loaded();
    const state = started(registry);
    armAction('entity', 'training-dummy', 'strike', registry, state);

    // 12, from the dummy's own max-health — not the player's 30.
    expect(state.activeAction!.actors).toEqual({ 'training-dummy': { resources: { health: toMilliUnits(12) } } });
    expect(state.resources['health']).toBe(toMilliUnits(30));
  });

  // An actor stands up mid-fight and has no fresh game to begin, so honouring
  // `start:` spawned every enemy at the player's starting level.
  it('fills an actor from its own max even when the resource declares a start:', () => {
    const registry = loadModule(MODULE.replace('max: max-health\n', 'max: max-health\nstart: 5\n'));
    const state = started(registry);
    expect(state.resources['health']).toBe(toMilliUnits(5)); // the player does begin there

    armAction('entity', 'training-dummy', 'strike', registry, state);
    expect(state.activeAction!.actors!['training-dummy'].resources.health).toBe(toMilliUnits(12));
  });

  it('opens no encounter for an action that names no target', () => {
    const registry = loaded();
    const state = started(registry);
    armAction('entity', 'anvil', 'dent', registry, state);
    expect(state.activeAction!.actors).toBeUndefined();
  });

  it('survives a save round-trip', () => {
    const registry = loaded();
    const state = started(registry);
    armAction('entity', 'training-dummy', 'strike', registry, state);

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
    useAction('entity', 'training-dummy', 'strike', registry, state); // one attempt

    expect(state.time).toBe(secondsToMs(1));
    expect(state.activeAction!.actors!['training-dummy'].resources.health).toBe(toMilliUnits(4)); // 12 - (10 - 2)
  });

  it('ends the fight when the pool empties, firing on success, and stands a fresh target up', () => {
    const registry = loaded();
    const state = started(registry);
    useAction('entity', 'training-dummy', 'strike', registry, state);
    resolve(state, registry, secondsToMs(2)); // second hit takes 4 -> 0

    expect(state.flags['training-dummy.dummies-felled']).toBe(1); // entity-scoped, as any bare counter is
    expect(state.activeAction!.actors!['training-dummy'].resources.health).toBe(toMilliUnits(12)); // refilled
    expect(state.time).toBe(secondsToMs(2));
  });

  it('never fires the pool on empty block for a non-player actor', () => {
    const registry = loaded();
    const state = started(registry);
    useAction('entity', 'training-dummy', 'strike', registry, state);
    resolve(state, registry, secondsToMs(10));

    // "You black out." belongs to the player's health, not a felled dummy's.
    expect(state.log).not.toContain('You black out.');
    expect(state.resources['health']).toBe(toMilliUnits(30));
  });

  it('floors at min-damage so a target harder than the attacker still dies', () => {
    const registry = loaded();
    const state = started(registry);
    // dr 99 against a flat 10 attack: every hit lands for exactly 1.
    useAction('entity', 'iron-golem', 'chip', registry, state);
    expect(state.activeAction!.actors!['iron-golem'].resources.health).toBe(toMilliUnits(2));

    resolve(state, registry, secondsToMs(3));
    expect(state.activeAction).toBeNull(); // 3 hp, 3 hits, fight over
  });

  it('samples ranged damage per hit rather than averaging it', () => {
    const registry = loaded();
    const state = started(registry);
    armAction('entity', 'straw-man', 'flail', registry, state);

    const levels: number[] = [];
    for (let t = 1; t <= 8; t++) {
      resolve(state, registry, secondsToMs(t));
      levels.push(state.activeAction!.actors!['straw-man'].resources.health);
    }
    // wild-attack is 4-7 and the straw man's dr is 1, so each hit is in the range 3-6.
    const hits = levels.map((level, i) => (i === 0 ? toMilliUnits(40) : levels[i - 1]) - level);
    for (const hit of hits) expect(hit).toBeGreaterThanOrEqual(toMilliUnits(3));
    for (const hit of hits) expect(hit).toBeLessThanOrEqual(toMilliUnits(6));
    expect(new Set(hits).size).toBeGreaterThan(1); // genuinely varying, not a constant
  });
});

describe('a target: action resolves per attempt, and stays associative doing it', () => {
  it('matches one jump against random split points, pools and rng alike', () => {
    const registry = loaded();
    function fighting(): GameState {
      const state = started(registry);
      armAction('entity', 'straw-man', 'flail', registry, state);
      return state;
    }

    const oneShot = fighting();
    resolve(oneShot, registry, secondsToMs(200));
    expect(oneShot.inventory['straw']).toBeGreaterThan(0); // fights really complete

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
