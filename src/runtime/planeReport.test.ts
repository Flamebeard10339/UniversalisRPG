import { describe, expect, it } from 'vitest';
import { } from '../content/registry';
import { loadInEnglish } from '../content/engineLocale';
import { Direction } from '../content/hex';
import { applyClusterEffect } from './clusterEffect';
import { ORIGIN } from './clusterPlane';
import { equip } from './equipment';
import { allocate, destroyItem, Growth, receiveItem, slotJewel } from './itemInstance';
import { ClusterReport, PlaneReport, planeReport, planeReports, PositionReport, SlotReport } from './planeReport';
import { initialState } from './save';
import { GameState } from './state';
import { inEnglish } from './sayFixture';

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

// The two counter sources, so what the report says about each is read off a
// real declaration rather than a hand-built one.
# passive raging
+5% attack per fury

# passive quickening
+3% attack per stack of tonic

# stat max-fury
base: 10

# resource fury
max: max-fury
start: 0

# item tonic
title: Tonic
+1 attack, 30s

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

# cluster-jewel counters
shape: spindle
open-connections: e
passives: 1 raging, 2 quickening

# item blade
slot: mainhand
item-level: 6
origin-cluster: core

# item counting-blade
slot: mainhand
item-level: 6
origin-cluster: counters

# item hub-blade
slot: mainhand
item-level: 6
origin-cluster: junction

# item plain-blade
slot: mainhand
item-level: 6

# item junction-jewel
cluster-jewel: junction

# item ring-jewel
cluster-jewel: ring-of-hale

# item goad
cluster-effect: +50% attack

# item rope
`;

const registry = loadInEnglish(MODULE);

function ok(outcome: Growth): string {
  if (!outcome.ok) throw new Error(inEnglish(registry, outcome.refused));
  return outcome.instance;
}

function dropped(itemId: string, extra: Record<string, number> = {}): GameState {
  const state = initialState(registry);
  receiveItem(state, registry, itemId, 1);
  Object.assign(state.inventory, extra);
  return state;
}

function hub(jewels: Record<string, number>, filling: Array<[Direction, string]>): GameState {
  const state = dropped('hub-blade', jewels);
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
    const plane = report(dropped('blade'));
    expect(plane).toMatchObject({ instance: '1', template: 'blade', title: 'Blade', level: 6, spent: 0, remaining: 6 });
  });

  it('names every copy it reports under the descriptor, since a base is never anything but a copy', () => {
    expect(report(dropped('blade')).name).toBe('Modified Blade');
  });

  it('names an origin cluster with no entry and a slotted one by the slot it came through', () => {
    const plane = report(hub({ 'junction-jewel': 1 }, [['ne', 'junction-jewel']]));
    expect(clusterAt(plane, '0,0')).toMatchObject({ jewel: 'junction', shape: 'point', entry: null });
    expect(clusterAt(plane, '1,-1')).toMatchObject({ jewel: 'junction', entry: { hex: '0,0', direction: 'ne' } });
  });

  it('falls back to the base cluster for an item declaring no jewel', () => {
    expect(clusterAt(report(dropped('plain-blade')), '0,0')).toMatchObject({ jewel: 'base', shape: 'point', entry: null });
  });

  it('marks the origin root allocated and free, and everything unreached beyond what touches it', () => {
    const plane = report(dropped('blade'));
    expect(positionAt(plane, '0,0', 1)).toMatchObject({ standing: 'allocated', free: true, passive: 'hale', title: 'Hale' });
    expect(positionAt(plane, '0,0', 2)).toMatchObject({ standing: 'available', free: false, passive: null, title: null });
    expect(positionAt(plane, '0,0', 3)).toMatchObject({ standing: 'unreached', free: false });
  });

  it('marks a position paid for as allocated but not free', () => {
    const state = dropped('blade');
    ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position: 2 }));
    expect(positionAt(report(state), '0,0', 2)).toMatchObject({ standing: 'allocated', free: false });
  });

  it('lists every slot the placement opens, and only those', () => {
    expect(clusterAt(report(dropped('blade')), '0,0').slots.map((slot) => slot.direction)).toEqual(['e', 'ne']);
  });

  it('names the neighbour behind a filled slot and behind a blocked one', () => {
    const plane = report(hub({ 'junction-jewel': 2 }, [['e', 'junction-jewel'], ['ne', 'junction-jewel']]));
    expect(slotAt(plane, '0,0', 'ne')).toMatchObject({ standing: 'allocated', beyond: '1,-1' });
    expect(slotAt(plane, '1,0', 'nw')).toMatchObject({ standing: 'blocked', beyond: '1,-1' });
    expect(slotAt(plane, '1,0', 'sw')).toMatchObject({ standing: 'unreached', beyond: null });
  });

  it('states the effective payload of an unallocated position, not the declared one', () => {
    const state = dropped('blade', { goad: 1 });
    ok(applyClusterEffect(state, registry, '1', 'goad', ORIGIN));

    const plane = report(state);
    expect(clusterAt(plane, '0,0').effects).toEqual([{ id: 'goad', title: 'Goad', statTitle: 'Attack', effect: { statId: 'attack', percent: 50 } }]);
    expect(positionAt(plane, '0,0', 3)).toMatchObject({
      standing: 'unreached',
      payloads: [{ statId: 'attack', statTitle: 'Attack', effective: { percent: false, amount: { min: 6, max: 6 } }, scale: 1.5 }],
    });
  });

  it('reports the same payload once the point is spent', () => {
    const state = dropped('blade', { goad: 1 });
    ok(applyClusterEffect(state, registry, '1', 'goad', ORIGIN));
    ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position: 2 }));
    ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position: 3 }));
    expect(positionAt(report(state), '0,0', 3)).toMatchObject({
      standing: 'allocated',
      payloads: [{ statId: 'attack', statTitle: 'Attack', effective: { percent: false, amount: { min: 6, max: 6 } }, scale: 1.5 }],
    });
  });

  it('names the counter a payload is paid per, whichever of the two sources it is', () => {
    const plane = report(dropped('counting-blade'));
    expect(positionAt(plane, '0,0', 1)).toMatchObject({
      payloads: [{ statId: 'attack', statTitle: 'Attack', effective: { percent: true, amount: 5 }, scale: 1, perTitle: 'Fury' }],
    });
    expect(positionAt(plane, '0,0', 2)).toMatchObject({
      payloads: [{ statId: 'attack', statTitle: 'Attack', effective: { percent: true, amount: 3 }, scale: 1, perTitle: 'Tonic' }],
    });
  });

  it('says nothing of a counter where the payload named none', () => {
    expect(positionAt(report(dropped('blade')), '0,0', 1).payloads[0]).not.toHaveProperty('perTitle');
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
    expect(planeReport(registry, dropped('blade'), '9')).toBeUndefined();
  });

  it('reports the plane the copy arrived carrying, before a point has been spent on it', () => {
    const state = initialState(registry);
    receiveItem(state, registry, 'blade', 1);
    receiveItem(state, registry, 'plain-blade', 1);

    expect(planeReport(registry, state, '1')).toMatchObject({
      instance: '1',
      template: 'blade',
      level: 6,
      spent: 0,
      remaining: 6,
      clusters: [expect.objectContaining({ hex: '0,0', jewel: 'core' })],
    });
    expect(planeReport(registry, state, '2')?.clusters[0]).toMatchObject({ hex: '0,0', jewel: 'base' });

    expect(planeReports(registry, state).map((plane) => plane.instance)).toEqual(['1', '2']);
  });

  it('reports nothing for a base the player has none of, for a template, and for an item that is no base', () => {
    const state = initialState(registry);
    receiveItem(state, registry, 'rope', 1);

    expect(planeReport(registry, state, 'blade')).toBeUndefined();
    expect(planeReport(registry, state, 'rope')).toBeUndefined();
    expect(planeReport(registry, state, '1')).toBeUndefined();
  });

  it('reports the copies in the order they arrived', () => {
    const state = initialState(registry);
    receiveItem(state, registry, 'blade', 2);
    receiveItem(state, registry, 'plain-blade', 1);
    expect(planeReports(registry, state).map((plane) => plane.instance)).toEqual(['1', '2', '3']);
  });

  it('drops a copy off the list when it is destroyed', () => {
    const state = dropped('blade');
    expect(planeReports(registry, state).map((plane) => plane.instance)).toEqual(['1']);

    destroyItem(state, '1');
    expect(planeReports(registry, state)).toEqual([]);
  });

  it('reports an empty list when nothing has been grown', () => {
    expect(planeReports(registry, initialState(registry))).toEqual([]);
  });

  it('reports the plane of a base the player is wearing, under the id and under the slot alike', () => {
    const state = dropped('blade');
    equip(state, registry, '1');

    expect(planeReport(registry, state, '1')).toMatchObject({ instance: '1', template: 'blade', spent: 0 });
    expect(planeReport(registry, state, 'worn:mainhand')).toMatchObject({ instance: 'worn:mainhand', template: 'blade', spent: 0 });
    expect(planeReports(registry, state).map((plane) => plane.instance)).toEqual(['1']);
  });

  it('reports the worn copy’s plane apart from another copy of the same base beside it', () => {
    const state = initialState(registry);
    receiveItem(state, registry, 'blade', 2);
    ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position: 2 }));
    equip(state, registry, '2');

    expect(planeReports(registry, state).map((plane) => plane.instance)).toEqual(['1', '2']);
    expect(planeReport(registry, state, 'worn:mainhand')).toMatchObject({ instance: 'worn:mainhand', template: 'blade', spent: 0 });
    expect(planeReport(registry, state, '1')).toMatchObject({ instance: '1', spent: 1 });
  });

  it('publishes what the copy is worth per stat, so a screen states it rather than adding the clusters up', () => {
    const state = dropped('blade');
    for (const position of [2, 3]) ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position }));

    expect(report(state).contributions).toEqual([
      { statId: 'attack', statTitle: 'Attack', added: { min: 4, max: 4 }, increased: 0 },
      { statId: 'max-health', statTitle: 'Max Health', added: { min: 10, max: 10 }, increased: 0 },
    ]);
  });

  it('publishes the effective contribution, so an effect on the cluster moves the summary', () => {
    const state = dropped('blade', { goad: 1 });
    for (const position of [2, 3]) ok(allocate(state, registry, '1', { hex: ORIGIN, kind: 'position', position }));
    ok(applyClusterEffect(state, registry, '1', 'goad', ORIGIN));

    expect(report(state).contributions).toContainEqual({ statId: 'attack', statTitle: 'Attack', added: { min: 6, max: 6 }, increased: 0 });
  });
});
