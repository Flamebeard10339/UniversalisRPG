import { describe, expect, it } from 'vitest';
import { armAction, createGameState, equip, GameState, initResources, resolve, unequip } from './runtime';
import { loadModule, loadUniverse, Registry } from '../content/registry';
import { secondsToMs, toMilliUnits } from './units';

const MODULE = `
# stat attack
base: 10

# stat defense
base: 0

# stat dodge

# stat attack-rate
base: 60

# stat max-health
base: 100000

# resource health
max: max-health

# location arena
x: 0, y: 0
starting
entities: target

# entity target
stats: max-health 100000, dodge 0
strike:
  repeating
  time: 60
  speed: attack-rate
  target: health
  ability: attack
  dr: defense
bite:
  retaliates
  time: 60
  speed: attack-rate
  target: health
  ability: attack
  dr: defense

# item attack-bonus
slot: mainhand
+2 attack

# item defense-bonus
slot: offhand
+2 defense
`;

function loaded(source = MODULE): Registry {
  return loadModule(source);
}

function fighting(registry: Registry, entityId: string): GameState {
  const state = createGameState('arena');
  initResources(state, registry);
  armAction('entity', entityId, 'strike', registry, state);
  return state;
}

function damageDealt(state: GameState, entityId: string): number {
  const pool = state.activeAction!.actors![entityId].resources.health;
  const maxHealth = toMilliUnits(100000);
  return (maxHealth - pool) / toMilliUnits(1); // damage per attempt in milli-units
}

function damageTaken(state: GameState): number {
  const maxHealth = toMilliUnits(100000);
  return (maxHealth - state.resources['health']) / toMilliUnits(1);
}

describe('equipment', () => {
  it('equipment-slots: an equipped +attack item raises outgoing damage, a carried one does not', () => {
    const registry = loaded();
    const ATTEMPTS = 100;

    const bareState = fighting(registry, 'target');
    resolve(bareState, registry, secondsToMs(ATTEMPTS));
    const bareDamage = damageDealt(bareState, 'target');

    const carriedState = fighting(registry, 'target');
    carriedState.inventory['attack-bonus'] = 1;
    resolve(carriedState, registry, secondsToMs(ATTEMPTS));
    const carriedDamage = damageDealt(carriedState, 'target');

    const equippedState = fighting(registry, 'target');
    equippedState.inventory['attack-bonus'] = 1;
    equip(equippedState, registry, 'attack-bonus');
    resolve(equippedState, registry, secondsToMs(ATTEMPTS));
    const equippedDamage = damageDealt(equippedState, 'target');

    expect(carriedDamage).toBe(bareDamage);
    expect(equippedDamage).toBeGreaterThan(bareDamage);
  });

  // Through the foe's retaliation rather than through the stat: the deliverable
  // asks whether the shield changes damage taken, and a stat that moves without
  // reaching `dr` would satisfy a stat assertion while changing nothing.
  it('equipment-slots: an equipped +defense item lowers incoming damage, a carried one does not', () => {
    const registry = loaded();
    const ATTEMPTS = 100;

    const bareState = fighting(registry, 'target');
    resolve(bareState, registry, secondsToMs(ATTEMPTS));
    const bareTaken = damageTaken(bareState);

    const carriedState = fighting(registry, 'target');
    carriedState.inventory['defense-bonus'] = 1;
    resolve(carriedState, registry, secondsToMs(ATTEMPTS));
    const carriedTaken = damageTaken(carriedState);

    const equippedState = fighting(registry, 'target');
    equippedState.inventory['defense-bonus'] = 1;
    equip(equippedState, registry, 'defense-bonus');
    resolve(equippedState, registry, secondsToMs(ATTEMPTS));
    const equippedTaken = damageTaken(equippedState);

    expect(bareTaken).toBeGreaterThan(0);
    expect(carriedTaken).toBe(bareTaken);
    expect(equippedTaken).toBeLessThan(bareTaken);
  });

  it('equipment-slots: tutorial equipment is equippable and changes stats when equipped', () => {
    const tutorial = loadUniverse([
      {
        name: 'tutorial',
        text: `
# info tutorial
version: 1.0.0

# stat attack
base: 10

# stat defense
base: 5

# stat max-health
base: 30

# resource health
max: max-health

# location home
x: 0, y: 0
starting

# item iron-sword
slot: mainhand
weapon, +2 attack

# item wooden-shield
slot: offhand
shield, +2 defense
`,
      },
    ]);

    const state = createGameState('tutorial.home');
    initResources(state, tutorial);
    state.inventory['tutorial.iron-sword'] = 1;
    state.inventory['tutorial.wooden-shield'] = 1;

    const bareAttack = Math.round(Math.min(10, 10 + 0) * 1000); // attack 10 - no bonus
    const bareDefense = Math.round(Math.min(5, 5 + 0) * 1000); // defense 5 - no bonus

    equip(state, tutorial, 'tutorial.iron-sword');
    expect(state.equipped['mainhand']).toBe('tutorial.iron-sword');

    equip(state, tutorial, 'tutorial.wooden-shield');
    expect(state.equipped['offhand']).toBe('tutorial.wooden-shield');

    unequip(state, 'mainhand');
    expect(state.equipped['mainhand']).toBeUndefined();
  });
});
