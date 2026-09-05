import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { parseSaveSection } from '../content/sections/save';
import { Hex, PlaneNode } from '../content/hex';
import { clusterAt, ORIGIN, pointsSpent } from './clusterPlane';
import { equip } from './equipment';
import { instance, instanceIsLive } from './instances';
import { allocate, carriesItem, destroyItem, Growth, Destruction, itemInstance, itemLevel, packedCount, pointsRemaining, receiveItem, slotJewel, wornCopy } from './itemInstance';
import { initialState, loadSave, pruneStateForRegistry, SAVE_VERSION, serializeSave } from './save';
import { GameState } from './state';
import { inEnglish } from './sayFixture';
import { FIXTURE_WORLD } from '../content/worldFixture';

const RINGLET = `
# cluster-jewel ringlet
shape: ring
open-connections: e, ne
passives: 1 hale, 4 stout
`;

const COMMON =
  FIXTURE_WORLD +
  `
# passive stout
+5 max-health

# item iron-sword
slot: mainhand
item-level: 4

# item heartwood-blade
slot: mainhand
item-level: 4-9
origin-cluster: ringlet

# item wooden-shield
slot: offhand
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

function carrying(holdings: Record<string, number>): GameState {
  const state = initialState(registry);
  for (const [id, count] of Object.entries(holdings)) receiveItem(state, registry, id, count);
  return state;
}

function grow(state: GameState, target: string, node: PlaneNode): string {
  const outcome = allocate(state, registry, target, node);
  if (!outcome.ok) throw new Error(inEnglish(registry, outcome.refused));
  return outcome.instance;
}

function parse(serialized: string): { version: number; diff: Record<string, unknown> } {
  return parseSaveSection({ kind: 'save', id: 'x', body: [{ text: serialized, span: { start: 0, end: 0 }, children: [] }], span: { start: 0, end: 0 } });
}

const refusalOf = (outcome: Growth | Destruction): string => (outcome.ok ? 'not refused' : inEnglish(registry, outcome.refused));

describe('a base arrives already a copy of its own', () => {
  it('mints an instance a copy rather than deepening a stack, because each one rolled its own level', () => {
    const state = carrying({ 'iron-sword': 3, rope: 4 });

    expect(state.inventory).toEqual({ rope: 4 });
    expect(Object.keys(state.instances.byId)).toEqual(['1', '2', '3']);
    expect(instance(state, '1')).toMatchObject({ kind: 'item', template: 'iron-sword' });
    expect(packedCount(state, 'iron-sword')).toBe(3);
  });

  it('draws each level from the range its item declares, and never outside it', () => {
    const state = carrying({ 'heartwood-blade': 40 });
    const item = registry.items.get('heartwood-blade')!;
    const levels = Object.keys(state.instances.byId).map((id) => itemLevel(itemInstance(state, id)!, item));

    expect(Math.min(...levels)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...levels)).toBeLessThanOrEqual(9);
    expect(new Set(levels).size).toBeGreaterThan(1);
  });

  it('reads a level that rolls one way as that one level, however many drop', () => {
    const state = carrying({ 'iron-sword': 3 });
    const item = registry.items.get('iron-sword')!;

    expect(Object.keys(state.instances.byId).map((id) => itemLevel(itemInstance(state, id)!, item))).toEqual([4, 4, 4]);
  });

  it('leaves an item declaring no level a stack, worn or not', () => {
    const state = carrying({ 'wooden-shield': 2, rope: 1 });

    expect(state.instances.byId).toEqual({});
    expect(state.inventory).toEqual({ 'wooden-shield': 2, rope: 1 });
  });
});

describe('an item with no level has no plane', () => {
  it('refuses every growth verb, leaving the stack and what it would have consumed whole', () => {
    const state = carrying({ rope: 4, 'crossroads-jewel': 2 });
    const notABase = (id: string): string => `${id} is not a base: only an item you can wear has a plane to grow`;

    expect(refusalOf(allocate(state, registry, 'rope', position(ORIGIN, 1)))).toBe(notABase('rope'));
    expect(refusalOf(allocate(state, registry, 'crossroads-jewel', position(ORIGIN, 1)))).toBe(notABase('crossroads-jewel'));
    expect(refusalOf(slotJewel(state, registry, 'crossroads-jewel', 'crossroads-jewel', ORIGIN, 'e'))).toBe(notABase('crossroads-jewel'));

    expect(state.instances.byId).toEqual({});
    expect(state.inventory).toEqual({ rope: 4, 'crossroads-jewel': 2 });
  });

  it('refuses a base named by its template, because the points belong to a copy and not to the item', () => {
    const state = carrying({ 'iron-sword': 1 });
    expect(refusalOf(allocate(state, registry, 'iron-sword', slot(ORIGIN)))).toBe('iron-sword is not a base: only an item you can wear has a plane to grow');
  });

  it('reaches the copy worn in a slot when the target names that slot, since a slot holds one copy and a template stands for none', () => {
    const state = carrying({ 'iron-sword': 2 });
    equip(state, registry, '2');

    expect(allocate(state, registry, wornCopy('mainhand'), slot(ORIGIN)).ok).toBe(true);

    expect(pointsSpent(itemInstance(state, '2')!.plane)).toBe(1);
    expect(pointsSpent(itemInstance(state, '1')!.plane)).toBe(0);
  });

  it('refuses a target naming nothing at all', () => {
    const state = carrying({});
    expect(refusalOf(allocate(state, registry, 'no-such-thing', slot(ORIGIN)))).toBe('no-such-thing is not a base: only an item you can wear has a plane to grow');
    expect(refusalOf(allocate(state, registry, '7', slot(ORIGIN)))).toBe('7 is not a base: only an item you can wear has a plane to grow');
  });
});

describe('a base is not a jewel', () => {
  it('refuses a base as the jewel a slot is filled with, since only a jewel declares cluster-jewel:', () => {
    const state = carrying({ 'heartwood-blade': 2 });
    grow(state, '1', position(ORIGIN, 2));
    grow(state, '1', position(ORIGIN, 3));
    grow(state, '1', position(ORIGIN, 4));
    grow(state, '1', slot(ORIGIN));

    expect(refusalOf(slotJewel(state, registry, '1', 'heartwood-blade', ORIGIN, 'e'))).toBe('heartwood-blade is not a cluster jewel');
    expect(clusterAt(itemInstance(state, '1')!.plane, { q: 1, r: 0 })).toBeUndefined();
  });
});

describe('an item level', () => {
  it('buys one passive point a level, and every one of them is spendable', () => {
    const state = carrying({ 'iron-sword': 1 });
    const payload = itemInstance(state, '1')!;
    const item = registry.items.get('iron-sword')!;

    expect(itemLevel(payload, item)).toBe(4);
    expect(pointsRemaining(payload, item)).toBe(4);
  });

  it('spends a point a node and refuses the one after the last', () => {
    const state = carrying({ 'iron-sword': 1, 'crossroads-jewel': 1 });
    grow(state, '1', slot(ORIGIN));
    slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e');
    grow(state, '1', position({ q: 1, r: 0 }, 1));
    for (const direction of ['ne', 'nw'] as const) grow(state, '1', { hex: { q: 1, r: 0 }, kind: 'slot', direction });

    expect(pointsSpent(itemInstance(state, '1')!.plane)).toBe(4);
    expect(refusalOf(allocate(state, registry, '1', { hex: { q: 1, r: 0 }, kind: 'slot', direction: 'se' }))).toBe('the se slot of 1,0 costs a point and none remain');
  });
});

describe('growing an item', () => {
  const fourPoints = (): GameState => carrying({ 'heartwood-blade': 1, 'crossroads-jewel': 2 });

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

    expect(refusalOf(slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e'))).toBe('the e slot of 0,0 already holds a jewel');
    expect(state.inventory['crossroads-jewel']).toBe(1);
  });

  it('refuses an item that is no cluster jewel, and one the player does not carry', () => {
    const state = fourPoints();
    expect(refusalOf(slotJewel(state, registry, '1', 'rope', ORIGIN, 'e'))).toBe('rope is not a cluster jewel');
    state.inventory['crossroads-jewel'] = 0;
    expect(refusalOf(slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e'))).toBe('you carry no crossroads-jewel');
  });
});

describe('an instance across a reload', () => {
  const grownBlade = (): GameState => {
    const state = carrying({ 'heartwood-blade': 1, 'crossroads-jewel': 1 });
    for (const index of [2, 3, 4]) grow(state, '1', position(ORIGIN, index));
    grow(state, '1', slot(ORIGIN));
    slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e');
    return state;
  };

  it('comes back with the same roll, the same level and the same plane', () => {
    const state = grownBlade();
    const item = registry.items.get('heartwood-blade')!;
    const target = initialState(registry);
    loadSave(target, parse(serializeSave(state, registry)), registry);

    expect(itemInstance(target, '1')).toEqual(itemInstance(state, '1'));
    expect(itemLevel(itemInstance(target, '1')!, item)).toBe(itemLevel(itemInstance(state, '1')!, item));
  });

  it('keeps the level it rolled even where the run that rolled it went on drawing', () => {
    const state = carrying({ 'heartwood-blade': 1 });
    const item = registry.items.get('heartwood-blade')!;
    const rolled = itemLevel(itemInstance(state, '1')!, item);
    receiveItem(state, registry, 'heartwood-blade', 5);

    const target = initialState(registry);
    loadSave(target, parse(serializeSave(state, registry)), registry);
    expect(itemLevel(itemInstance(target, '1')!, item)).toBe(rolled);
  });

  it('is pruned when its own template goes', () => {
    const state = grownBlade();
    const warnings = pruneStateForRegistry(state, loadInEnglish(MODULE.replace('# item heartwood-blade\nslot: mainhand\nitem-level: 4-9\norigin-cluster: ringlet\n', '')));

    expect(warnings.map((warning) => warning.message)).toContain('Removed instance 1 because its template heartwood-blade is not loaded.');
    expect(instanceIsLive(state, '1')).toBe(false);
  });

  it('drops a slotted jewel whose declaration is gone and returns its point, so it is never over its budget', () => {
    const state = grownBlade();
    const payload = itemInstance(state, '1')!;
    const item = registry.items.get('heartwood-blade')!;
    expect(pointsSpent(payload.plane)).toBe(4);

    const warnings = pruneStateForRegistry(state, withoutCrossroads);
    expect(warnings.map((warning) => warning.message)).toContain('Repaired instance 1: dropped the crossroads cluster at 1,0, whose declaration is gone, and everything allocated in it.');
    expect(pointsSpent(payload.plane)).toBe(4);
    expect(pointsRemaining(payload, item)).toBeGreaterThanOrEqual(0);
  });

  it('survives a repair that leaves nothing recorded, because dropping it would destroy the item', () => {
    const state = carrying({ 'heartwood-blade': 1 });
    grow(state, '1', position(ORIGIN, 2));
    const rolled = itemInstance(state, '1')!.roll;

    pruneStateForRegistry(state, narrowed);
    expect(instanceIsLive(state, '1')).toBe(true);
    expect(itemInstance(state, '1')).toEqual({ roll: rolled, plane: { '0,0': { jewel: 'ringlet', entry: null, roll: expect.any(Number), allocatedPositions: [], allocatedSlots: [], effects: [] } } });
  });

  it('refuses a save whose plane is not one', () => {
    const state = initialState(registry);
    const row = { kind: 'item', template: 'iron-sword', payload: { roll: 0.5, plane: { '0,0': { jewel: null, entry: 'e', roll: 0.5, allocatedPositions: [], allocatedSlots: [], effects: [] } } } };
    expect(() => loadSave(state, { version: SAVE_VERSION, diff: { instances: { next: 2, byId: { 1: row } } } }, registry)).toThrow(/save field instances holds/);
  });

  it('refuses a save whose roll is no roll', () => {
    const state = initialState(registry);
    const plane = { '0,0': { jewel: null, entry: null, roll: 0.5, allocatedPositions: [], allocatedSlots: [], effects: [] } };
    const row = { kind: 'item', template: 'iron-sword', payload: { roll: 4, plane } };
    expect(() => loadSave(state, { version: SAVE_VERSION, diff: { instances: { next: 2, byId: { 1: row } } } }, registry)).toThrow(/save field instances holds/);
  });
});

describe('destroying a carried item', () => {
  it('takes one copy off a stack and leaves the rest countable', () => {
    const state = carrying({ rope: 3 });

    expect(destroyItem(state, 'rope')).toEqual({ ok: true, item: 'rope' });
    expect(state.inventory).toEqual({ rope: 2 });
    expect(packedCount(state, 'rope')).toBe(2);
  });

  it('takes an emptied stack out of what the player carries rather than leaving a count of none', () => {
    const state = carrying({ rope: 1 });

    expect(destroyItem(state, 'rope')).toEqual({ ok: true, item: 'rope' });
    expect(state.inventory).toEqual({});
    expect(carriesItem(state, 'rope')).toBe(false);
    expect(refusalOf(destroyItem(state, 'rope'))).toBe('you carry no rope');
  });

  it('destroys a grown copy with the plane it holds, and gives nothing back to the stack', () => {
    const state = carrying({ 'heartwood-blade': 2, 'crossroads-jewel': 1 });
    for (const index of [2, 3, 4]) grow(state, '1', position(ORIGIN, index));
    grow(state, '1', slot(ORIGIN));
    slotJewel(state, registry, '1', 'crossroads-jewel', ORIGIN, 'e');

    expect(destroyItem(state, '1')).toEqual({ ok: true, item: 'heartwood-blade' });
    expect(instanceIsLive(state, '1')).toBe(false);
    expect(itemInstance(state, '1')).toBeUndefined();
    expect(state.inventory).toEqual({ 'crossroads-jewel': 0 });
    expect(packedCount(state, 'heartwood-blade')).toBe(1);
  });

  it('destroys the one copy it was handed, leaving another copy of the same base whole', () => {
    const state = carrying({ 'heartwood-blade': 2 });
    grow(state, '2', position(ORIGIN, 2));

    destroyItem(state, '1');
    expect(itemInstance(state, '1')).toBeUndefined();
    expect(pointsSpent(itemInstance(state, '2')!.plane)).toBe(1);
  });

  it('refuses an id naming nothing the player carries, leaving every copy and every instance whole', () => {
    const state = carrying({ 'heartwood-blade': 1 });
    grow(state, '1', position(ORIGIN, 2));
    const before = JSON.stringify(state);

    expect(refusalOf(destroyItem(state, 'no-such-thing'))).toBe('you carry no no-such-thing');
    expect(refusalOf(destroyItem(state, '7'))).toBe('you carry no 7');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('takes a worn stack copy off only once the last of it is gone', () => {
    const state = carrying({ 'wooden-shield': 2 });
    equip(state, registry, 'wooden-shield');

    destroyItem(state, 'wooden-shield');
    expect(state.equipped).toEqual({ offhand: 'wooden-shield' });

    destroyItem(state, 'wooden-shield');
    expect(state.equipped).toEqual({});
  });

  it('takes a destroyed worn copy off without putting another copy on in its place', () => {
    const state = carrying({ 'iron-sword': 2 });
    equip(state, registry, '1');

    destroyItem(state, '1');
    expect(state.equipped).toEqual({});
    expect(packedCount(state, 'iron-sword')).toBe(1);
  });
});

describe('growing a copy the player is wearing', () => {
  it('grows what the slot holds, named by the slot rather than by the copy in it', () => {
    const state = carrying({ 'iron-sword': 1 });
    equip(state, registry, '1');

    expect(grow(state, 'worn:mainhand', slot(ORIGIN))).toBe('1');
    expect(state.equipped).toEqual({ mainhand: '1' });
    expect(pointsSpent(itemInstance(state, '1')!.plane)).toBe(1);
  });

  it('leaves a copy still in the pack alone while another of the same base is worn', () => {
    const state = carrying({ 'iron-sword': 2 });
    equip(state, registry, '1');

    grow(state, '2', slot(ORIGIN));
    expect(pointsSpent(itemInstance(state, '1')!.plane)).toBe(0);
    expect(packedCount(state, 'iron-sword')).toBe(1);
  });
});
