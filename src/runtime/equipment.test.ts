import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { armAction, createGameState, equip, GameState, initResources, resolve, statValue, unequip } from './runtime';
import { loadModule, Registry } from '../content/registry';
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

  // Against content/tutorial-island.dsl itself, not a copy of it: a copy would
  // stay green after the shipped `slot:` or `+2 attack` changed underneath it.
  it('equipment-slots: the SHIPPED tutorial sword and shield move real stats once equipped', () => {
    const tutorial = loadModule(readFileSync('content/tutorial-island.dsl', 'utf8'));
    const sword = 'tutorial-island.iron-sword';
    const shield = 'tutorial-island.wooden-shield';

    expect(tutorial.items.get(sword)!.slot).toBe('mainhand');
    expect(tutorial.items.get(shield)!.slot).toBe('offhand');

    const state = createGameState('tutorial-island.beach');
    initResources(state, tutorial);
    const bareAttack = statValue('tutorial-island.attack', state, tutorial);
    const bareDefense = statValue('tutorial-island.defense', state, tutorial);

    // Carried, not equipped: the tutorial hands both over at node `skills`, and
    // holding them must not by itself move a stat.
    state.inventory[sword] = 1;
    state.inventory[shield] = 1;
    expect(statValue('tutorial-island.attack', state, tutorial)).toBe(bareAttack);
    expect(statValue('tutorial-island.defense', state, tutorial)).toBe(bareDefense);

    equip(state, tutorial, sword);
    equip(state, tutorial, shield);
    expect(statValue('tutorial-island.attack', state, tutorial)).toBe(bareAttack + 2);
    expect(statValue('tutorial-island.defense', state, tutorial)).toBe(bareDefense + 2);

    unequip(state, 'mainhand');
    expect(statValue('tutorial-island.attack', state, tutorial)).toBe(bareAttack);
    expect(statValue('tutorial-island.defense', state, tutorial)).toBe(bareDefense + 2);
  });

  it('equipment-slots: a slot keeps its item across losing and re-acquiring it', () => {
    const registry = loaded();
    const state = createGameState('arena');
    initResources(state, registry);
    state.inventory['attack-bonus'] = 1;
    equip(state, registry, 'attack-bonus');
    const equipped = statValue('attack', state, registry);

    state.inventory['attack-bonus'] = 0;
    expect(statValue('attack', state, registry)).toBe(equipped - 2);
    expect(state.equipped['mainhand']).toBe('attack-bonus');

    state.inventory['attack-bonus'] = 1;
    expect(statValue('attack', state, registry)).toBe(equipped);
  });
});
