import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { parseSaveSection } from '../content/saveSection';
import { Hex, PlaneNode } from '../content/hex';
import { clusterAt, ORIGIN, pointsSpent } from './clusterPlane';
import { equip } from './equipment';
import { instance, instanceIsLive } from './instances';
import { allocate, carriedCount, carriesItem, destroyItem, feedItem, Growth, itemInstance, itemLevel, pointsRemaining, slotJewel } from './itemInstance';
import type { Localized } from './localized';
import { initialState, loadSave, pruneStateForRegistry, SAVE_VERSION, serializeSave } from './save';
import { skillLevel } from './skills';
import { GameState } from './state';

const RINGLET = `
# cluster-jewel ringlet
shape: ring
open-connections: e, ne
passives: 1 hale, 4 stout
`;

const COMMON = `
# location camp
x: 0, y: 0
starting

# stat max-health
base: 30

# passive hale
+10 max-health

# passive stout
+5 max-health

# item iron-sword
slot: mainhand
max-level: 10

# item heartwood-blade
slot: mainhand
origin-cluster: ringlet

# item whetstone
item-experience: 1000

# item master-whetstone
item-experience: 20000

# item sacrificial-blade
slot: mainhand
item-experience: 1000
`;

const CROSSROADS = `
# cluster-jewel crossroads
shape: point
open-connections: e, ne, nw, sw, se
passives: 1 hale

# item crossroads-jewel
cluster-jewel: crossroads
`;

const MODULE = COMMON + RINGLET + CROSSROADS;
const registry = loadInEnglish(MODULE);
const withoutCrossroads = loadInEnglish(COMMON + RINGLET);
const narrowed = loadInEnglish(COMMON + RINGLET.replace('shape: ring\nopen-connections: e, ne\npassives: 1 hale, 4 stout', 'shape: point\nopen-connections: e\npassives: 1 hale') + CROSSROADS);

const position = (hex: Hex, index: number): PlaneNode => ({ hex, kind: 'position', position: index });
const slot = (hex: Hex): PlaneNode => ({ hex, kind: 'slot', direction: 'e' });

function carrying(inventory: Record<string, number>): GameState {
  const state = initialState(registry);
  Object.assign(state.inventory, inventory);
  return state;
}

function grow(state: GameState, target: string, node: PlaneNode): string {
  const outcome = allocate(state, registry, target, node);
  if (!outcome.ok) throw new Error(outcome.refused);
  return outcome.instance;
}

function parse(serialized: string): { version: number; diff: Record<string, unknown> } {
  return parseSaveSection({ kind: 'save', id: 'x', body: [{ text: serialized, span: { start: 0, end: 0 }, children: [] }], span: { start: 0, end: 0 } }).saved;
}

describe('an item is a stack until something is recorded about one of them', () => {
  it('counts stacks while nothing has happened to any of them', () => {
    const state = carrying({ 'iron-sword': 3, whetstone: 4 });
    expect(state.instances.byId).toEqual({});
  });

  it('leaves the stack the moment it is fed, and takes its experience with it', () => {
    const state = carrying({ 'iron-sword': 3, whetstone: 4 });
    const outcome = feedItem(state, registry, 'iron-sword', 'whetstone');

    expect(outcome).toEqual({ ok: true, instance: '1' });
    expect(state.inventory).toEqual({ 'iron-sword': 2, whetstone: 3 });
    expect(itemInstance(state, '1')!.experience).toBe(1000);
    expect(instance(state, '1')).toMatchObject({ kind: 'item', template: 'iron-sword' });
  });

  it('mints nothing and consumes nothing when the verb is refused', () => {
    const state = carrying({ 'iron-sword': 3, whetstone: 4 });
    expect(allocate(state, registry, 'iron-sword', position(ORIGIN, 4))).toEqual({ ok: false, refused: 'point has no position 4 (1-1)' });
    expect(feedItem(state, registry, 'iron-sword', 'iron-sword')).toEqual({ ok: false, refused: 'iron-sword grants no item experience' });

    expect(state.instances.byId).toEqual({});
    expect(state.inventory).toEqual({ 'iron-sword': 3, whetstone: 4 });
  });

  it('grows the one that left the stack from then on, and leaves the rest countable', () => {
    const state = carrying({ 'iron-sword': 3, whetstone: 4 });
    feedItem(state, registry, 'iron-sword', 'whetstone');
    expect(feedItem(state, registry, '1', 'whetstone')).toEqual({ ok: true, instance: '1' });
    expect(feedItem(state, registry, 'iron-sword', 'whetstone')).toEqual({ ok: true, instance: '2' });

    expect(itemInstance(state, '1')!.experience).toBe(2000);
    expect(itemInstance(state, '2')!.experience).toBe(1000);
    expect(state.inventory).toEqual({ 'iron-sword': 1, whetstone: 1 });
  });

  it('refuses a target that is neither a carried item nor a live instance', () => {
    const state = carrying({ whetstone: 4 });
    expect(feedItem(state, registry, 'no-such-thing', 'whetstone')).toEqual({ ok: false, refused: 'there is no item or item instance called no-such-thing' });
    expect(feedItem(state, registry, 'iron-sword', 'whetstone')).toEqual({ ok: false, refused: 'you carry no iron-sword' });
    expect(feedItem(state, registry, '7', 'whetstone')).toEqual({ ok: false, refused: 'there is no item or item instance called 7' });
  });

  it('will not feed a stack of one to itself, because the copy that leaves it is not there to be eaten', () => {
    const state = carrying({ 'sacrificial-blade': 1 });
    expect(feedItem(state, registry, 'sacrificial-blade', 'sacrificial-blade')).toEqual({ ok: false, refused: 'you carry no sacrificial-blade' });

    state.inventory['sacrificial-blade'] = 2;
    expect(feedItem(state, registry, 'sacrificial-blade', 'sacrificial-blade')).toEqual({ ok: true, instance: '1' });
    expect(state.inventory['sacrificial-blade']).toBe(0);
  });
});

// c9: you grow what you can wear. An item is a base if and only if it declares
// a slot:, so the whole of what has a plane is decided once, at the one door,
// rather than by each verb remembering to ask.
describe('an item with no slot has no plane', () => {
  it('refuses every growth verb, leaving the stack and what it would have consumed whole', () => {
    const state = carrying({ whetstone: 4, 'crossroads-jewel': 2 });
    const noPlane = (id: string): Growth => ({ ok: false, refused: `${id} is not a base: only an item you can wear has a plane to grow` as Localized });

    expect(feedItem(state, registry, 'whetstone', 'whetstone')).toEqual(noPlane('whetstone'));
    expect(allocate(state, registry, 'crossroads-jewel', position(ORIGIN, 1))).toEqual(noPlane('crossroads-jewel'));
    expect(slotJewel(state, registry, 'crossroads-jewel', 'crossroads-jewel', ORIGIN, 'e')).toEqual(noPlane('crossroads-jewel'));

    expect(state.instances.byId).toEqual({});
    expect(state.inventory).toEqual({ whetstone: 4, 'crossroads-jewel': 2 });
  });

  it('is refused before the stack is counted, so a jewel nobody carries reports the same reason', () => {
    const state = carrying({});
    expect(feedItem(state, registry, 'crossroads-jewel', 'whetstone')).toEqual({ ok: false, refused: 'crossroads-jewel is not a base: only an item you can wear has a plane to grow' });
  });
});

// The reproduction that filed this: `slot:` and `cluster-jewel:` named one
// field, so the shipped level-40 base was consumable into another base's plane.
describe('a base is not a jewel', () => {
  it('refuses a base as the jewel a slot is filled with, since only a jewel declares cluster-jewel:', () => {
    const state = carrying({ 'heartwood-blade': 2, whetstone: 4 });
    feedItem(state, registry, 'heartwood-blade', 'whetstone');
    for (let fed = 1; fed < 4; fed++) feedItem(state, registry, '1', 'whetstone');
    grow(state, '1', position(ORIGIN, 2));
    grow(state, '1', position(ORIGIN, 3));
    grow(state, '1', position(ORIGIN, 4));
    grow(state, '1', slot(ORIGIN));

    expect(slotJewel(state, registry, '1', 'heartwood-blade', ORIGIN, 'e')).toEqual({ ok: false, refused: 'heartwood-blade is not a cluster jewel' });
    expect(state.inventory['heartwood-blade']).toBe(1);
    expect(clusterAt(itemInstance(state, '1')!.plane, { q: 1, r: 0 })).toBeUndefined();
  });
});

describe('an item experience', () => {
  it('has one source, so an item that grants none is refused as food', () => {
    const state = carrying({ 'iron-sword': 1, 'crossroads-jewel': 1 });
    expect(feedItem(state, registry, 'iron-sword', 'crossroads-jewel')).toEqual({ ok: false, refused: 'crossroads-jewel grants no item experience' });
    expect(state.inventory).toEqual({ 'iron-sword': 1, 'crossroads-jewel': 1 });
  });

  it('buys one passive point a level, off the one level curve in the repository', () => {
    const state = carrying({ 'heartwood-blade': 1, whetstone: 4 });
    for (let fed = 0; fed < 4; fed++) feedItem(state, registry, fed === 0 ? 'heartwood-blade' : '1', 'whetstone');

    const payload = itemInstance(state, '1')!;
    const item = registry.items.get('heartwood-blade')!;
    expect(payload.experience).toBe(4000);
    expect(itemLevel(payload, item)).toBe(skillLevel(4000));
    expect(itemLevel(payload, item)).toBe(4);
    expect(pointsRemaining(payload, item)).toBe(4);
  });

  it('stops at the base max-level, refusing the feed with the item intact', () => {
    const state = carrying({ 'iron-sword': 1, 'master-whetstone': 1, whetstone: 1 });
    expect(feedItem(state, registry, 'iron-sword', 'master-whetstone')).toEqual({ ok: true, instance: '1' });
    expect(itemLevel(itemInstance(state, '1')!, registry.items.get('iron-sword')!)).toBe(10);

    expect(feedItem(state, registry, '1', 'whetstone')).toEqual({ ok: false, refused: 'Iron Sword is already at level 10, which is its maximum' });
    expect(state.inventory.whetstone).toBe(1);
    expect(itemInstance(state, '1')!.experience).toBe(20000);
  });

  it('runs past ten on a base that declares no maximum, because the default is 99', () => {
    const state = carrying({ 'heartwood-blade': 1, 'master-whetstone': 1 });
    feedItem(state, registry, 'heartwood-blade', 'master-whetstone');
    expect(itemLevel(itemInstance(state, '1')!, registry.items.get('heartwood-blade')!)).toBe(skillLevel(20000));
    expect(skillLevel(20000)).toBeGreaterThan(10);
  });
});

describe('growing an item', () => {
  const fourPoints = (): GameState => {
    const state = carrying({ 'heartwood-blade': 1, 'crossroads-jewel': 2, whetstone: 4 });
    feedItem(state, registry, 'heartwood-blade', 'whetstone');
    for (let fed = 1; fed < 4; fed++) feedItem(state, registry, '1', 'whetstone');
    return state;
  };

  it('spends a point a node and refuses the one after the last', () => {
    const state = fourPoints();
    for (const index of [2, 3, 4]) grow(state, '1', position(ORIGIN, index));
    grow(state, '1', slot(ORIGIN));

    expect(pointsSpent(itemInstance(state, '1')!.plane)).toBe(4);
    expect(allocate(state, registry, '1', position(ORIGIN, 5))).toEqual({ ok: false, refused: 'position 5 of 0,0 costs a point and none remain' });
  });

  it('consumes the jewel it slots, and charges no point for it', () => {
    const state = fourPoints();
    for (const index of [2, 3, 4]) grow(state, '1', position(ORIGIN, index));
    grow(state, '1', slot(ORIGIN));

    expect(slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e')).toEqual({ ok: true, instance: '1' });
    expect(state.inventory['crossroads-jewel']).toBe(1);
    expect(pointsSpent(itemInstance(state, '1')!.plane)).toBe(4);
    expect(clusterAt(itemInstance(state, '1')!.plane, { q: 1, r: 0 })).toMatchObject({ jewel: 'crossroads', entry: 'e' });
  });

  it('refuses a second jewel into a filled slot with the jewel intact, because slotting is permanent', () => {
    const state = fourPoints();
    for (const index of [2, 3, 4]) grow(state, '1', position(ORIGIN, index));
    grow(state, '1', slot(ORIGIN));
    slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e');

    expect(slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e')).toEqual({ ok: false, refused: 'the e slot of 0,0 already holds a jewel' });
    expect(state.inventory['crossroads-jewel']).toBe(1);
  });

  it('refuses an item that is no cluster jewel, and one the player does not carry', () => {
    const state = fourPoints();
    expect(slotJewel(state, registry, '1', 'whetstone', ORIGIN, 'e')).toEqual({ ok: false, refused: 'whetstone is not a cluster jewel' });
    state.inventory['crossroads-jewel'] = 0;
    expect(slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e')).toEqual({ ok: false, refused: 'you carry no crossroads-jewel' });
  });
});

describe('an instance across a reload', () => {
  const grownBlade = (): GameState => {
    const state = carrying({ 'heartwood-blade': 1, 'crossroads-jewel': 1, 'master-whetstone': 1 });
    feedItem(state, registry, 'heartwood-blade', 'master-whetstone');
    for (const index of [2, 3, 4]) grow(state, '1', position(ORIGIN, index));
    grow(state, '1', slot(ORIGIN));
    slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e');
    grow(state, '1', position({ q: 1, r: 0 }, 1));
    return state;
  };

  it('comes back with the same experience and the same plane', () => {
    const state = grownBlade();
    const target = initialState(registry);
    loadSave(target, parse(serializeSave(state, registry)), registry);
    expect(itemInstance(target, '1')).toEqual(itemInstance(state, '1'));
  });

  it('is pruned when its own template goes', () => {
    const state = grownBlade();
    const warnings = pruneStateForRegistry(state, loadInEnglish(MODULE.replace('# item heartwood-blade\nslot: mainhand\norigin-cluster: ringlet\n', '')));

    expect(warnings.map((warning) => warning.message)).toContain('Removed instance 1 because its template heartwood-blade is not loaded.');
    expect(instanceIsLive(state, '1')).toBe(false);
  });

  it('drops a slotted jewel whose declaration is gone and returns its point, so it is never over its budget', () => {
    const state = grownBlade();
    const payload = itemInstance(state, '1')!;
    const item = registry.items.get('heartwood-blade')!;
    expect(pointsSpent(payload.plane)).toBe(5);

    const warnings = pruneStateForRegistry(state, withoutCrossroads);
    expect(warnings.map((warning) => warning.message)).toContain('Repaired instance 1: dropped the crossroads cluster at 1,0, whose declaration is gone, and everything allocated in it.');
    expect(pointsSpent(payload.plane)).toBe(4);
    expect(pointsRemaining(payload, item)).toBeGreaterThanOrEqual(0);
  });

  it('survives a repair that leaves nothing recorded, because dropping it would destroy the item', () => {
    const state = carrying({ 'heartwood-blade': 1 });
    grow(state, 'heartwood-blade', position(ORIGIN, 2));

    pruneStateForRegistry(state, narrowed);
    expect(instanceIsLive(state, '1')).toBe(true);
    expect(itemInstance(state, '1')).toEqual({ experience: 0, plane: { '0,0': { jewel: 'ringlet', entry: null, allocatedPositions: [], allocatedSlots: [], effects: [] } } });
  });

  it('refuses a save whose plane is not one', () => {
    const state = initialState(registry);
    const row = { kind: 'item', template: 'iron-sword', payload: { experience: 0, plane: { '0,0': { jewel: null, entry: 'e', allocatedPositions: [], allocatedSlots: [], effects: [] } } } };
    expect(() => loadSave(state, { version: SAVE_VERSION, diff: { instances: { next: 2, byId: { 1: row } } } }, registry)).toThrow(/save field instances holds/);
  });
});

// c12: this is the rule half. No screen, no confirmation and no second question
// live here — what it costs to be sure belongs to the frame that calls it.
describe('destroying a carried item', () => {
  it('takes one copy off the stack and leaves the rest countable', () => {
    const state = carrying({ 'iron-sword': 3, whetstone: 1 });

    expect(destroyItem(state, registry, 'iron-sword')).toEqual({ ok: true, item: 'iron-sword' });
    expect(state.inventory).toEqual({ 'iron-sword': 2, whetstone: 1 });
    expect(carriedCount(state, 'iron-sword')).toBe(2);
  });

  it('takes an emptied stack out of what the player carries rather than leaving a count of none', () => {
    const state = carrying({ 'iron-sword': 1 });

    expect(destroyItem(state, registry, 'iron-sword')).toEqual({ ok: true, item: 'iron-sword' });
    expect(state.inventory).toEqual({});
    expect(carriesItem(state, 'iron-sword')).toBe(false);
    expect(destroyItem(state, registry, 'iron-sword')).toEqual({ ok: false, refused: 'you carry no iron-sword' });
  });

  it('destroys a grown copy with the plane it holds, and gives nothing back to the stack', () => {
    const state = carrying({ 'heartwood-blade': 2, 'crossroads-jewel': 1, whetstone: 4 });
    feedItem(state, registry, 'heartwood-blade', 'whetstone');
    for (let fed = 1; fed < 4; fed++) feedItem(state, registry, '1', 'whetstone');
    for (const index of [2, 3, 4]) grow(state, '1', position(ORIGIN, index));
    grow(state, '1', slot(ORIGIN));
    slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e');

    expect(destroyItem(state, registry, '1')).toEqual({ ok: true, item: 'heartwood-blade' });
    expect(instanceIsLive(state, '1')).toBe(false);
    expect(itemInstance(state, '1')).toBeUndefined();
    expect(state.inventory).toEqual({ 'heartwood-blade': 1, 'crossroads-jewel': 0, whetstone: 0 });
    expect(carriedCount(state, 'heartwood-blade')).toBe(1);
  });

  it('destroys the one copy it was handed, leaving another grown copy of the same base whole', () => {
    const state = carrying({ 'heartwood-blade': 2, whetstone: 2 });
    feedItem(state, registry, 'heartwood-blade', 'whetstone');
    feedItem(state, registry, 'heartwood-blade', 'whetstone');
    grow(state, '2', position(ORIGIN, 2));

    destroyItem(state, registry, '1');
    expect(itemInstance(state, '1')).toBeUndefined();
    expect(pointsSpent(itemInstance(state, '2')!.plane)).toBe(1);
  });

  it('refuses an id naming nothing the player carries, leaving every copy and every instance whole', () => {
    const state = carrying({ 'heartwood-blade': 1, whetstone: 1 });
    grow(state, 'heartwood-blade', position(ORIGIN, 2));
    const before = JSON.stringify(state);

    expect(destroyItem(state, registry, 'no-such-thing')).toEqual({ ok: false, refused: 'you carry no no-such-thing' });
    expect(destroyItem(state, registry, '7')).toEqual({ ok: false, refused: 'you carry no 7' });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('takes a worn stack copy off only once the last of it is gone', () => {
    const state = carrying({ 'iron-sword': 2 });
    equip(state, registry, 'iron-sword');

    destroyItem(state, registry, 'iron-sword');
    expect(state.equipped).toEqual({ mainhand: 'iron-sword' });

    destroyItem(state, registry, 'iron-sword');
    expect(state.equipped).toEqual({});
  });

  it('takes a destroyed grown copy off without putting another copy on in its place', () => {
    const state = carrying({ 'iron-sword': 2, whetstone: 1 });
    feedItem(state, registry, 'iron-sword', 'whetstone');
    equip(state, registry, '1');

    destroyItem(state, registry, '1');
    expect(state.equipped).toEqual({});
    expect(carriedCount(state, 'iron-sword')).toBe(1);
  });

  it('leaves a worn grown copy on when the stack it left is destroyed out from under it', () => {
    const state = carrying({ 'iron-sword': 2, whetstone: 1 });
    feedItem(state, registry, 'iron-sword', 'whetstone');
    equip(state, registry, '1');

    destroyItem(state, registry, 'iron-sword');
    expect(state.equipped).toEqual({ mainhand: '1' });
    // c21: the copy is on and is counted nowhere on the carried side, so the
    // stack going empty is the whole of what the count has to say.
    expect(carriedCount(state, 'iron-sword')).toBe(0);
  });
});

// c21, growing side. The stack a copy is minted out of has two places to be
// once carried and worn are disjoint, and which one it came out of is the whole
// of what says where the minted copy ends up.
describe('growing a copy the player is wearing', () => {
  it('grows the worn copy and puts what it minted back on, once the stack behind it is empty', () => {
    const state = carrying({ 'iron-sword': 1, whetstone: 1 });
    equip(state, registry, 'iron-sword');

    const grown = feedItem(state, registry, 'iron-sword', 'whetstone');
    expect(grown).toEqual({ ok: true, instance: '1' });
    expect(state.equipped).toEqual({ mainhand: '1' });
    expect(itemInstance(state, '1')?.experience).toBe(1000);
    expect(carriedCount(state, 'iron-sword')).toBe(0);
  });

  it('grows a carried copy and leaves the slot alone while the stack still has one', () => {
    const state = carrying({ 'iron-sword': 2, whetstone: 1 });
    equip(state, registry, 'iron-sword');

    expect(feedItem(state, registry, 'iron-sword', 'whetstone')).toEqual({ ok: true, instance: '1' });
    expect(state.equipped).toEqual({ mainhand: 'iron-sword' });
    expect(carriedCount(state, 'iron-sword')).toBe(1);
  });

  // The copy came out of the slot, so the stack is not where it came from and is
  // not touched — including a stack that was never written down at all.
  it('leaves the stack alone when it mints out of a slot', () => {
    const state = carrying({ whetstone: 1 });
    state.equipped.mainhand = 'iron-sword';

    expect(feedItem(state, registry, 'iron-sword', 'whetstone')).toEqual({ ok: true, instance: '1' });
    expect(state.equipped).toEqual({ mainhand: '1' });
    expect(state.inventory).toEqual({ whetstone: 0 });
  });

  it('refuses an item the player neither carries nor wears', () => {
    const state = carrying({ whetstone: 1 });

    expect(feedItem(state, registry, 'iron-sword', 'whetstone')).toEqual({ ok: false, refused: 'you carry no iron-sword' });
    expect(state.instances.byId).toEqual({});
  });
});
