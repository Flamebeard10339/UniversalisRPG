import { describe, expect, it } from 'vitest';
import { armFightAction, createGameState, equip, GameState, initResources, resolve, statValue, unequip } from './runtime';
import { Registry } from '../content/registry';
import { withEngineLocale } from '../content/engineLocale';
import { loadInEnglish } from '../content/engineLocale';
import { loadUniverse } from '../content/load';
import { standingSources } from '../content/shipped';
import { parseSaveSection } from '../content/sections/save';
import { allocate, carriesItem, packedCount, receiveItem } from './itemInstance';
import { initialState, loadSave, pruneStateForRegistry, serializeSave } from './save';
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
+2 attack

# item honed-blade
slot: mainhand
item-level: 4
+2 attack

# item defense-bonus
slot: offhand
+2 defense
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
    const tutorial = loadUniverse(withEngineLocale(standingSources()));
    const sword = 'core.iron-sword';
    const shield = 'core.wooden-shield';

    expect(tutorial.items.get(sword)!.slot).toBe('mainhand');
    expect(tutorial.items.get(shield)!.slot).toBe('offhand');

    const state = createGameState('tulsa.beach');
    initResources(state, tutorial);
    const bareAttack = statValue('core.attack', state, tutorial);
    const bareDefense = statValue('core.defense', state, tutorial);

    state.inventory[sword] = 1;
    state.inventory[shield] = 1;
    expect(statValue('core.attack', state, tutorial)).toBe(bareAttack);
    expect(statValue('core.defense', state, tutorial)).toBe(bareDefense);

    equip(state, tutorial, sword);
    equip(state, tutorial, shield);
    expect(statValue('core.attack', state, tutorial)).toBe(bareAttack + 2);
    expect(statValue('core.defense', state, tutorial)).toBe(bareDefense + 2);

    unequip(state, tutorial, 'mainhand');
    expect(statValue('core.attack', state, tutorial)).toBe(bareAttack);
    expect(statValue('core.defense', state, tutorial)).toBe(bareDefense + 2);
  });

  it('equipment-slots: a worn copy contributes on the strength of being worn, with no stack behind it', () => {
    const registry = loaded();
    const state = createGameState('arena');
    initResources(state, registry);
    state.inventory['attack-bonus'] = 1;
    const bare = statValue('attack', state, registry);

    equip(state, registry, 'attack-bonus');
    expect(packedCount(state, 'attack-bonus')).toBe(0);
    expect(statValue('attack', state, registry)).toBe(bare + 2);
  });
});

describe('carried and worn are disjoint', () => {
  it('reads two carried and one equipped out of a stack of three, and three again once it comes off', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 3 });

    equip(state, registry, 'attack-bonus');
    expect(packedCount(state, 'attack-bonus')).toBe(2);
    expect(state.inventory['attack-bonus']).toBe(2);
    expect(state.equipped).toEqual({ mainhand: 'attack-bonus' });

    unequip(state, registry, 'mainhand');
    expect(packedCount(state, 'attack-bonus')).toBe(3);
    expect(state.equipped).toEqual({});
  });

  it('lists a worn grown copy under equipment and counts it nowhere the player carries', () => {
    const registry = loaded();
    const state = carrying(registry, {});
    const grownId = dropped(state, registry, 'honed-blade');

    equip(state, registry, grownId);
    expect(state.equipped).toEqual({ mainhand: grownId });
    expect(packedCount(state, 'honed-blade')).toBe(0);
    expect(carriesItem(state, grownId)).toBe(false);

    unequip(state, registry, 'mainhand');
    expect(packedCount(state, 'honed-blade')).toBe(1);
    expect(carriesItem(state, grownId)).toBe(true);
    expect(state.inventory).toEqual({});
  });

  it('gives back what a slot was holding when another copy takes it', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 1 });
    const grownId = dropped(state, registry, 'honed-blade');

    equip(state, registry, 'attack-bonus');
    equip(state, registry, grownId);
    expect(state.equipped).toEqual({ mainhand: grownId });
    expect(packedCount(state, 'attack-bonus')).toBe(1);

    equip(state, registry, 'attack-bonus');
    expect(state.equipped).toEqual({ mainhand: 'attack-bonus' });
    expect(carriesItem(state, grownId)).toBe(true);
    expect(packedCount(state, 'honed-blade')).toBe(1);
  });

  it('wears a second copy out of a stack that still has one, and refuses once the stack is empty', () => {
    const registry = loaded();
    const state = carrying(registry, { 'attack-bonus': 3 });
    equip(state, registry, 'attack-bonus');

    equip(state, registry, 'attack-bonus');
    expect(state.equipped).toEqual({ mainhand: 'attack-bonus' });
    expect(packedCount(state, 'attack-bonus')).toBe(2);

    const alone = carrying(registry, { 'attack-bonus': 1 });
    equip(alone, registry, 'attack-bonus');

    expect(() => equip(alone, registry, 'attack-bonus')).toThrow(/does not carry/);
    expect(alone.equipped).toEqual({ mainhand: 'attack-bonus' });
    expect(packedCount(alone, 'attack-bonus')).toBe(0);
  });
});

function carrying(registry: Registry, stacks: Record<string, number>): GameState {
  const state = createGameState('arena');
  initResources(state, registry);
  Object.assign(state.inventory, stacks);
  return state;
}

function dropped(state: GameState, registry: Registry, itemId: string): string {
  if (receiveItem(state, registry, itemId, 1) !== 1) throw new Error(`nothing arrived for ${itemId}`);
  return String(state.instances.next - 1);
}

function reloaded(state: GameState, registry: Registry): GameState {
  const target = initialState(registry);
  loadSave(target, parseSaveSection({ kind: 'save', id: 'x', body: [{ text: serializeSave(state, registry), span: { start: 0, end: 0 }, children: [] }], span: { start: 0, end: 0 } }), registry);
  return target;
}

describe('a grown item is worn like any other', () => {
  const BARE = 10;

  it('can be worn at all, though it never was in a stack', () => {
    const registry = loaded();
    const state = carrying(registry, {});
    const grownId = dropped(state, registry, 'honed-blade');

    expect(state.inventory['honed-blade']).toBeUndefined();
    equip(state, registry, grownId);
    expect(state.equipped['mainhand']).toBe(grownId);
    expect(statValue('attack', state, registry)).toBe(BARE + 2);
  });

  it('grants nothing while it is carried and not worn', () => {
    const registry = loaded();
    const state = carrying(registry, {});
    dropped(state, registry, 'honed-blade');
    expect(statValue('attack', state, registry)).toBe(BARE);
  });

  it('keeps granting its +2 attack through being grown while worn', () => {
    const registry = loaded();
    const state = carrying(registry, {});
    const grownId = dropped(state, registry, 'honed-blade');
    equip(state, registry, grownId);
    expect(statValue('attack', state, registry)).toBe(BARE + 2);

    expect(allocate(state, registry, grownId, { hex: { q: 0, r: 0 }, kind: 'slot', direction: 'e' }).ok).toBe(true);
    expect(state.equipped['mainhand']).toBe(grownId);
    expect(statValue('attack', state, registry)).toBe(BARE + 2);
  });

  it('leaves the copy in the slot alone when another copy of the same base is grown', () => {
    const registry = loaded();
    const state = carrying(registry, {});
    const worn = dropped(state, registry, 'honed-blade');
    const spare = dropped(state, registry, 'honed-blade');
    equip(state, registry, worn);

    expect(allocate(state, registry, spare, { hex: { q: 0, r: 0 }, kind: 'slot', direction: 'e' }).ok).toBe(true);
    expect(state.equipped['mainhand']).toBe(worn);
    expect(statValue('attack', state, registry)).toBe(BARE + 2);
  });

  it('is still worn, and still worth the same, after a reload', () => {
    const registry = loaded();
    const state = carrying(registry, {});
    equip(state, registry, dropped(state, registry, 'honed-blade'));

    const target = reloaded(state, registry);
    expect(target.equipped).toEqual(state.equipped);
    expect(statValue('attack', target, registry)).toBe(statValue('attack', state, registry));
  });

  it('is unequipped when the item it is a copy of leaves the content', () => {
    const registry = loaded();
    const state = carrying(registry, {});
    const grownId = dropped(state, registry, 'honed-blade');
    equip(state, registry, grownId);

    const warnings = pruneStateForRegistry(state, loaded(MODULE.replace('# item honed-blade\nslot: mainhand\nitem-level: 4\n+2 attack\n', '')));
    expect(warnings.map((warning) => warning.message)).toContain(`Removed instance ${grownId} because its template honed-blade is not loaded.`);
    expect(warnings.map((warning) => warning.message)).toContain(`Unequipped mainhand because its item ${grownId} is not loaded.`);
    expect(state.equipped['mainhand']).toBeUndefined();
  });
});
