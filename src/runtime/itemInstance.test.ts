import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/registry';
import { parseSaveSection } from '../content/saveSection';
import { clusterAt, Hex, ORIGIN, PlaneNode, pointsSpent } from './clusterPlane';
import { instance, instanceIsLive } from './instances';
import { allocate, feedItem, itemInstance, itemLevel, pointsRemaining, slotJewel } from './itemInstance';
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
cluster-jewel: ringlet

# item whetstone
item-experience: 1000

# item master-whetstone
item-experience: 20000
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
const registry = loadModule(MODULE);
const withoutCrossroads = loadModule(COMMON + RINGLET);
const narrowed = loadModule(COMMON + RINGLET.replace('shape: ring\nopen-connections: e, ne\npassives: 1 hale, 4 stout', 'shape: point\nopen-connections: e\npassives: 1 hale') + CROSSROADS);

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
    const state = carrying({ whetstone: 1 });
    expect(feedItem(state, registry, 'whetstone', 'whetstone')).toEqual({ ok: false, refused: 'you carry no whetstone' });

    state.inventory.whetstone = 2;
    expect(feedItem(state, registry, 'whetstone', 'whetstone')).toEqual({ ok: true, instance: '1' });
    expect(state.inventory.whetstone).toBe(0);
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
    const warnings = pruneStateForRegistry(state, loadModule(MODULE.replace('# item heartwood-blade\nslot: mainhand\ncluster-jewel: ringlet\n', '')));

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
