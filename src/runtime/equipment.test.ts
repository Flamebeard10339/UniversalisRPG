import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { armFightAction, createGameState, equip, GameState, initResources, resolve, statValue, unequip } from './runtime';
import { Registry } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { parseSaveSection } from '../content/saveSection';
import { carriedCount, carriesItem, feedItem } from './itemInstance';
import { initialState, loadSave, pruneStateForRegistry, serializeSave } from './save';
import { secondsToMs, toMilliUnits } from './units';
import { inEnglish } from './sayFixture';

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

# action strike
title: strike
continuous
rate: my attack-rate
damage: my attack vs their defense
depletes: their health

# entity player
stats: max-health 100000, attack 10, attack-rate 60
equipment-slots: mainhand, offhand
uses: strike

# entity target
stats: max-health 100000, dodge 0, attack 10, attack-rate 60
uses: strike

# item attack-bonus
slot: mainhand
max-level: 10
+2 attack

# item defense-bonus
slot: offhand
+2 defense

# item whetstone
item-experience: 1000
`;

function loaded(source = MODULE): Registry {
  return loadInEnglish(source);
}

function fighting(registry: Registry, entityId: string): GameState {
  const state = createGameState('arena');
  initResources(state, registry);
  armFightAction('strike', entityId, registry, state);
  return state;
}

function damageDealt(state: GameState, entityId: string): number {
  const pool = state.activeAction!.actors![entityId].resources.health;
  const maxHealth = toMilliUnits(100000);
  return (maxHealth - pool) / toMilliUnits(1);
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

  it('equipment-slots: the SHIPPED tutorial sword and shield move real stats once equipped', () => {
    const tutorial = loadInEnglish(readFileSync('content/tutorial-island.dsl', 'utf8'));
    const sword = 'tutorial-island.iron-sword';
    const shield = 'tutorial-island.wooden-shield';

    expect(tutorial.items.get(sword)!.slot).toBe('mainhand');
    expect(tutorial.items.get(shield)!.slot).toBe('offhand');

    const state = createGameState('tutorial-island.beach');
    initResources(state, tutorial);
    const bareAttack = statValue('tutorial-island.attack', state, tutorial);
    const bareDefense = statValue('tutorial-island.defense', state, tutorial);

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

  it('equipment-slots: a worn copy contributes on the strength of being worn, with no stack behind it', () => {
    const registry = loaded();
    const state = createGameState('arena');
    initResources(state, registry);
    state.inventory['attack-bonus'] = 1;
    const bare = statValue('attack', state, registry);

    equip(state, registry, 'attack-bonus');
    expect(carriedCount(state, 'attack-bonus')).toBe(0);
    expect(statValue('attack', state, registry)).toBe(bare + 2);
  });
});

describe('carried and worn are disjoint', () => {
  it('reads two carried and one equipped out of a stack of three, and three again once it comes off', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 3 });

    equip(state, registry, 'attack-bonus');
    expect(carriedCount(state, 'attack-bonus')).toBe(2);
    expect(state.inventory['attack-bonus']).toBe(2);
    expect(state.equipped).toEqual({ mainhand: 'attack-bonus' });

    unequip(state, 'mainhand');
    expect(carriedCount(state, 'attack-bonus')).toBe(3);
    expect(state.equipped).toEqual({});
  });

  it('lists a worn grown copy under equipment and counts it nowhere the player carries', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 1, whetstone: 1 });
    const grownId = fed(state, registry, 'attack-bonus');

    equip(state, registry, grownId);
    expect(state.equipped).toEqual({ mainhand: grownId });
    expect(carriedCount(state, 'attack-bonus')).toBe(0);
    expect(carriesItem(state, grownId)).toBe(false);

    unequip(state, 'mainhand');
    expect(carriedCount(state, 'attack-bonus')).toBe(1);
    expect(carriesItem(state, grownId)).toBe(true);
    expect(state.inventory).toEqual({ 'attack-bonus': 0, whetstone: 0 });
  });

  it('gives back what a slot was holding when another copy takes it', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 1, whetstone: 1 });
    const grownId = fed(state, registry, 'attack-bonus');
    state.inventory['attack-bonus'] = 1;

    equip(state, registry, 'attack-bonus');
    equip(state, registry, grownId);
    expect(state.equipped).toEqual({ mainhand: grownId });
    expect(carriedCount(state, 'attack-bonus')).toBe(1);

    equip(state, registry, 'attack-bonus');
    expect(state.equipped).toEqual({ mainhand: 'attack-bonus' });
    expect(carriesItem(state, grownId)).toBe(true);
    expect(carriedCount(state, 'attack-bonus')).toBe(1);
  });

  it('wears a second copy out of a stack that still has one, and refuses once the stack is empty', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 3 });
    equip(state, registry, 'attack-bonus');

    equip(state, registry, 'attack-bonus');
    expect(state.equipped).toEqual({ mainhand: 'attack-bonus' });
    expect(carriedCount(state, 'attack-bonus')).toBe(2);

    const alone = carrying(registry, { 'attack-bonus': 1 });
    equip(alone, registry, 'attack-bonus');

    expect(() => equip(alone, registry, 'attack-bonus')).toThrow(/does not carry/);
    expect(alone.equipped).toEqual({ mainhand: 'attack-bonus' });
    expect(carriedCount(alone, 'attack-bonus')).toBe(0);
  });
});

function carrying(registry: Registry, stacks: Record<string, number>): GameState {
  const state = createGameState('arena');
  initResources(state, registry);
  Object.assign(state.inventory, stacks);
  return state;
}

function fed(state: GameState, registry: Registry, target: string): string {
  const outcome = feedItem(state, registry, target, 'whetstone');
  if (!outcome.ok) throw new Error(inEnglish(registry, outcome.refused));
  return outcome.instance;
}

function reloaded(state: GameState, registry: Registry): GameState {
  const target = initialState(registry);
  loadSave(target, parseSaveSection({ kind: 'save', id: 'x', body: [{ text: serializeSave(state, registry), span: { start: 0, end: 0 }, children: [] }], span: { start: 0, end: 0 } }), registry);
  return target;
}

describe('a grown item is worn like any other', () => {
  const BARE = 10;

  it('can be worn at all, though growing it took it out of its stack', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 1, whetstone: 1 });
    const grownId = fed(state, registry, 'attack-bonus');

    expect(state.inventory['attack-bonus']).toBe(0);
    equip(state, registry, grownId);
    expect(state.equipped['mainhand']).toBe(grownId);
    expect(statValue('attack', state, registry)).toBe(BARE + 2);
  });

  it('grants nothing while it is carried and not worn', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 1, whetstone: 1 });
    fed(state, registry, 'attack-bonus');
    expect(statValue('attack', state, registry)).toBe(BARE);
  });

  it('keeps granting its +2 attack through being modified while worn', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 1, whetstone: 1 });
    equip(state, registry, 'attack-bonus');
    expect(statValue('attack', state, registry)).toBe(BARE + 2);

    const grownId = fed(state, registry, 'attack-bonus');
    expect(state.equipped['mainhand']).toBe(grownId);
    expect(statValue('attack', state, registry)).toBe(BARE + 2);
  });

  it('leaves a slot on the stack when growing one copy did not empty it', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 2, whetstone: 1 });
    equip(state, registry, 'attack-bonus');
    const grownId = fed(state, registry, 'attack-bonus');

    expect(state.equipped['mainhand']).toBe('attack-bonus');
    expect(grownId).not.toBe('attack-bonus');
    expect(statValue('attack', state, registry)).toBe(BARE + 2);
  });

  it('is still worn, and still worth the same, after a reload', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 1, whetstone: 1 });
    equip(state, registry, fed(state, registry, 'attack-bonus'));

    const target = reloaded(state, registry);
    expect(target.equipped).toEqual(state.equipped);
    expect(statValue('attack', target, registry)).toBe(statValue('attack', state, registry));
  });

  it('is unequipped when the item it grew from leaves the content', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 1, whetstone: 1 });
    const grownId = fed(state, registry, 'attack-bonus');
    equip(state, registry, grownId);

    const warnings = pruneStateForRegistry(state, loaded(MODULE.replace('# item attack-bonus\nslot: mainhand\nmax-level: 10\n+2 attack\n', '')));
    expect(warnings.map((warning) => warning.message)).toContain(`Removed instance ${grownId} because its template attack-bonus is not loaded.`);
    expect(warnings.map((warning) => warning.message)).toContain(`Unequipped mainhand because its item ${grownId} is not loaded.`);
    expect(state.equipped['mainhand']).toBeUndefined();
  });
});
