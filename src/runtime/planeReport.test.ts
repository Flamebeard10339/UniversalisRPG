import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/registry';
import { Direction } from '../content/hex';
import { applyClusterEffect } from './clusterEffect';
import { ORIGIN } from './clusterPlane';
import { equip } from './equipment';
import { allocate, feedItem, Growth, slotJewel } from './itemInstance';
import { ClusterReport, PlaneReport, planeReport, planeReports, PositionReport, SlotReport } from './planeReport';
import { initialState } from './save';
import { GameState } from './state';

const MODULE = `
# location camp
x: 0, y: 0
starting

# stat max-health
base: 30

# stat attack
base: 4

# passive hale
+10 max-health

# passive keen
+4 attack

# cluster-jewel core
shape: spindle
open-connections: e, ne
passives: 1 hale, 3 keen

# cluster-jewel junction
shape: point
open-connections: e, ne, nw, se, sw

# cluster-jewel ring-of-hale
shape: ring
open-connections: e
passives: 1 hale, 2 keen

# item blade
slot: mainhand
max-level: 20
origin-cluster: core

# item hub-blade
slot: mainhand
max-level: 20
origin-cluster: junction

# item plain-blade
slot: mainhand
max-level: 20

# item junction-jewel
cluster-jewel: junction

# item ring-jewel
cluster-jewel: ring-of-hale

# item goad
cluster-effect: +50% attack

# item whetstone
item-experience: 1000
`;

const registry = loadModule(MODULE);

function ok(outcome: Growth): string {
  if (!outcome.ok) throw new Error(outcome.refused);
  return outcome.instance;
}

// One copy fed `levels` times, so every route below starts from a plane with
// points to spend rather than from a refusal.
function fed(itemId: string, levels: number, extra: Record<string, number> = {}): GameState {
  const state = initialState(registry);
  Object.assign(state.inventory, { [itemId]: 1, whetstone: levels, ...extra });
  let target = itemId;
  for (let each = 0; each < levels; each++) target = ok(feedItem(state, registry, target, 'whetstone'));
  return state;
}

// A point origin puts every edge on the free root, so a slot is reachable
// without first walking a shape — which is a different clause's subject.
function hub(jewels: Record<string, number>, filling: Array<[Direction, string]>): GameState {
  const state = fed('hub-blade', 6, jewels);
  for (const [direction, jewel] of filling) {
    ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'slot', direction }));
    ok(slotJewel(state, registry, '1', jewel, ORIGIN, direction));
  }
  return state;
}

function report(state: GameState, id = '1'): PlaneReport {
  const found = planeReport(registry, state, id);
  if (!found) throw new Error(`no plane report for ${id}`);
  return found;
}

function clusterAt(plane: PlaneReport, hex: string): ClusterReport {
  const found = plane.clusters.find((cluster) => cluster.hex === hex);
  if (!found) throw new Error(`no cluster at ${hex} among ${plane.clusters.map((each) => each.hex).join(', ')}`);
  return found;
}

const positionAt = (plane: PlaneReport, hex: string, position: number): PositionReport =>
  clusterAt(plane, hex).positions.find((each) => each.position === position)!;

const slotAt = (plane: PlaneReport, hex: string, direction: Direction): SlotReport =>
  clusterAt(plane, hex).slots.find((each) => each.direction === direction)!;

describe('planeReport', () => {
  it('reports the level, the points and the id the verbs address', () => {
    const plane = report(fed('blade', 3));
    expect(plane).toMatchObject({ instance: '1', template: 'blade', title: 'Blade', level: 3, maxLevel: 20, spent: 0, remaining: 3 });
  });

  // c16: the report carries the name every screen holding this plane spells, so
  // a surface never works out from `instance` and `template` what to call it.
  it('names a grown copy under the descriptor and a base still in its stack by its title', () => {
    const state = initialState(registry);
    Object.assign(state.inventory, { blade: 1 });

    expect(planeReport(registry, state, 'blade')?.name).toBe('Blade');
    expect(report(fed('blade', 3)).name).toBe('Modified Blade');
  });

  it('names an origin cluster with no entry and a slotted one by the slot it came through', () => {
    const plane = report(hub({ 'junction-jewel': 1 }, [['ne', 'junction-jewel']]));
    expect(clusterAt(plane, '0,0')).toMatchObject({ jewel: 'junction', shape: 'point', entry: null });
    expect(clusterAt(plane, '1,-1')).toMatchObject({ jewel: 'junction', entry: { hex: '0,0', direction: 'ne' } });
  });

  it('falls back to the base cluster for an item declaring no jewel', () => {
    expect(clusterAt(report(fed('plain-blade', 1)), '0,0')).toMatchObject({ jewel: 'base', shape: 'point', entry: null });
  });

  it('marks the origin root allocated and free, and everything unreached beyond what touches it', () => {
    const plane = report(fed('blade', 3));
    expect(positionAt(plane, '0,0', 1)).toMatchObject({ standing: 'allocated', free: true, passive: 'hale', title: 'Hale' });
    expect(positionAt(plane, '0,0', 2)).toMatchObject({ standing: 'available', free: false, passive: null, title: null });
    expect(positionAt(plane, '0,0', 3)).toMatchObject({ standing: 'unreached', free: false });
  });

  it('marks a position paid for as allocated but not free', () => {
    const state = fed('blade', 3);
    ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position: 2 }));
    expect(positionAt(report(state), '0,0', 2)).toMatchObject({ standing: 'allocated', free: false });
  });

  it('lists every slot the placement opens, and only those', () => {
    expect(clusterAt(report(fed('blade', 1)), '0,0').slots.map((slot) => slot.direction)).toEqual(['e', 'ne']);
  });

  it('names the neighbour behind a filled slot and behind a blocked one', () => {
    const plane = report(hub({ 'junction-jewel': 2 }, [['e', 'junction-jewel'], ['ne', 'junction-jewel']]));
    expect(slotAt(plane, '0,0', 'ne')).toMatchObject({ standing: 'allocated', beyond: '1,-1' });
    // The cluster at 1,0 opens an edge onto the hex the ne slot already filled.
    expect(slotAt(plane, '1,0', 'nw')).toMatchObject({ standing: 'blocked', beyond: '1,-1' });
    expect(slotAt(plane, '1,0', 'sw')).toMatchObject({ standing: 'unreached', beyond: null });
  });

  it('states the effective payload of an unallocated position, not the declared one', () => {
    const state = fed('blade', 4, { goad: 1 });
    ok(applyClusterEffect(state, registry, '1', 'goad', ORIGIN));

    const plane = report(state);
    expect(clusterAt(plane, '0,0').effects).toEqual([{ id: 'goad', title: 'Goad', effect: { statId: 'attack', percent: 50 } }]);
    expect(positionAt(plane, '0,0', 3)).toMatchObject({
      standing: 'unreached',
      payloads: [{ statId: 'attack', effective: { percent: false, amount: { min: 6, max: 6 } }, scale: 1.5 }],
    });
  });

  it('reports the same payload once the point is spent', () => {
    const state = fed('blade', 4, { goad: 1 });
    ok(applyClusterEffect(state, registry, '1', 'goad', ORIGIN));
    ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position: 2 }));
    ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position: 3 }));
    expect(positionAt(report(state), '0,0', 3)).toMatchObject({
      standing: 'allocated',
      payloads: [{ statId: 'attack', effective: { percent: false, amount: { min: 6, max: 6 } }, scale: 1.5 }],
    });
  });

  it('orders clusters outward from the origin rather than by when they were slotted', () => {
    const plane = report(hub({ 'junction-jewel': 2 }, [['e', 'junction-jewel'], ['ne', 'junction-jewel']]));
    expect(plane.clusters.map((cluster) => cluster.hex)).toEqual(['0,0', '1,-1', '1,0']);
  });

  it('leaves a position the shape has but the jewel does not fill without a passive', () => {
    const plane = report(hub({ 'ring-jewel': 1 }, [['e', 'ring-jewel']]));
    expect(positionAt(plane, '1,0', 2)).toMatchObject({ passive: 'keen', title: 'Keen' });
    expect(positionAt(plane, '1,0', 3)).toMatchObject({ passive: null, title: null, payloads: [] });
  });

  it('reports nothing for an id that names no grown copy', () => {
    expect(planeReport(registry, fed('blade', 1), '9')).toBeUndefined();
  });

  // A growth verb spells its target either way a base is carried, so the report
  // answers for both: a base still in its stack has the plane growing it mints.
  it('reports the plane a base still in its stack would mint', () => {
    const state = initialState(registry);
    Object.assign(state.inventory, { blade: 1, 'plain-blade': 1 });

    expect(planeReport(registry, state, 'blade')).toMatchObject({
      instance: 'blade',
      template: 'blade',
      level: 1,
      spent: 0,
      remaining: 1,
      clusters: [expect.objectContaining({ hex: '0,0', jewel: 'core' })],
    });
    expect(planeReport(registry, state, 'plain-blade')?.clusters[0]).toMatchObject({ hex: '0,0', jewel: 'base' });

    expect(planeReports(registry, state).map((plane) => plane.instance)).toEqual(['blade', 'plain-blade']);
  });

  it('reports nothing for a stack the player has none of, and nothing for an item that is no base', () => {
    const state = initialState(registry);
    Object.assign(state.inventory, { whetstone: 1 });

    expect(planeReport(registry, state, 'blade')).toBeUndefined();
    expect(planeReport(registry, state, 'whetstone')).toBeUndefined();
  });

  it('reports the grown copies in the order they were grown, before the stacks left carried', () => {
    const state = initialState(registry);
    Object.assign(state.inventory, { blade: 2, 'plain-blade': 1, whetstone: 2 });
    ok(feedItem(state, registry, 'blade', 'whetstone'));
    ok(feedItem(state, registry, 'plain-blade', 'whetstone'));
    expect(planeReports(registry, state).map((plane) => plane.instance)).toEqual(['1', '2', 'blade']);
  });

  // A plane screen can be opened on a base still in its stack, and a focus names
  // the plane it points at rather than carrying one, so every plane the player
  // could be looking at has to be among the published ones.
  it('reports the plane of a stack the player carries, and drops it when the last one leaves', () => {
    const state = initialState(registry);
    Object.assign(state.inventory, { blade: 1, whetstone: 3 });
    expect(planeReports(registry, state).map((plane) => plane.instance)).toEqual(['blade']);

    state.inventory.blade = 0;
    expect(planeReports(registry, state)).toEqual([]);
  });

  it('reports an empty list when nothing has been grown', () => {
    expect(planeReports(registry, initialState(registry))).toEqual([]);
  });

  // c21 took the worn copy out of its stack, so a base whose only copy is on the
  // player is a plane a screen can still be opened on and one no other read here
  // would reach.
  it('reports the plane of a base the player is wearing, with no stack left behind it', () => {
    const state = initialState(registry);
    Object.assign(state.inventory, { blade: 1 });
    equip(state, registry, 'blade');

    expect(state.inventory.blade).toBe(0);
    expect(planeReport(registry, state, 'blade')).toMatchObject({ instance: 'blade', template: 'blade', spent: 0 });
    expect(planeReports(registry, state).map((plane) => plane.instance)).toEqual(['blade']);
  });

  it('publishes what the copy is worth per stat, so a screen states it rather than adding the clusters up', () => {
    const state = fed('blade', 3);
    for (const position of [2, 3]) ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position }));

    expect(report(state).contributions).toEqual([
      { statId: 'attack', added: { min: 4, max: 4 }, increased: 0 },
      { statId: 'max-health', added: { min: 10, max: 10 }, increased: 0 },
    ]);
  });

  it('publishes the effective contribution, so an effect on the cluster moves the summary', () => {
    const state = fed('blade', 3, { goad: 1 });
    for (const position of [2, 3]) ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position }));
    ok(applyClusterEffect(state, registry, '1', 'goad', ORIGIN));

    expect(report(state).contributions).toContainEqual({ statId: 'attack', added: { min: 6, max: 6 }, increased: 0 });
  });
});
