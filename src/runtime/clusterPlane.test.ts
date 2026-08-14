import { describe, expect, it } from 'vitest';
import { DIRECTIONS, Direction, Hex, hexKey, NEIGHBOR_DELTA, opposite, PlaneNode, rotate } from '../content/hex';
import { loadInEnglish } from '../content/engineLocale';
import { Registry } from '../content/registry';
import {
  allocateNode,
  clusterAt,
  fillSlot,
  isAllocated,
  isPlane,
  neighbours,
  ORIGIN,
  originPlane,
  Plane,
  placementAt,
  pointsSpent,
  positionOnEdge,
  repairPlane,
  rootPosition,
  slotDirections,
  slotState,
} from './clusterPlane';
import { localizerFor } from './localized';

const COMMON = `
# stat max-health
base: 30

# passive hale
+10 max-health

# passive stout
+5 max-health

# cluster-jewel ringlet
shape: ring
open-connections: e, ne
passives: 1 hale, 4 stout
`;

const CROSSROADS = `
# cluster-jewel crossroads
shape: point
open-connections: e, ne, nw, sw, se
passives: 1 hale
`;

const registry = loadInEnglish(COMMON + CROSSROADS);
// The engine's own English, so a refusal reads here as it reads on a screen.
const say = localizerFor(registry, 'en');
// Content moved underneath a plane two ways: a whole declaration gone, and one
// that still exists with fewer positions and fewer ways out than it had.
const withoutCrossroads = loadInEnglish(COMMON);
const narrowed = loadInEnglish(`${COMMON.replace('shape: ring\nopen-connections: e, ne\npassives: 1 hale, 4 stout', 'shape: spindle\nopen-connections: ne\npassives: 1 hale')}${CROSSROADS}`);

const at = (q: number, r: number): Hex => ({ q, r });
const position = (hex: Hex, index: number): PlaneNode => ({ hex, kind: 'position', position: index });
const slot = (hex: Hex, direction: Direction): PlaneNode => ({ hex, kind: 'slot', direction });
const placed = (plane: Plane, hex: Hex, where: Registry = registry) => placementAt(where, plane, hex)!;

const PLENTY = 99;

function allocateAll(plane: Plane, nodes: PlaneNode[]): void {
  for (const node of nodes) {
    const refusal = allocateNode(say, registry, plane, node, PLENTY);
    if (refusal) throw new Error(refusal);
  }
}

// The origin ring with its e slot open and allocated, which is the shortest
// plane anything can be slotted into: 1 is free, 2-3-4 is the corridor to the
// east edge, and the slot itself is the fourth point.
function reachedEastSlot(): Plane {
  const plane = originPlane('ringlet');
  allocateAll(plane, [position(ORIGIN, 2), position(ORIGIN, 3), position(ORIGIN, 4), slot(ORIGIN, 'e')]);
  return plane;
}

describe('the origin cluster', () => {
  it('is a point with one open east connection when the base declares none of its own', () => {
    const plane = originPlane(null);
    expect(slotDirections(placed(plane, ORIGIN))).toEqual(['e']);
    expect(slotState(registry, plane, ORIGIN, 'e')).toBe('open');
    expect(isPlane(plane)).toBe(true);
  });

  it('is the base own cluster when it declares one, standing unrotated', () => {
    const plane = originPlane('ringlet');
    expect(placed(plane, ORIGIN).rotation).toBe(0);
    expect(slotDirections(placed(plane, ORIGIN))).toEqual(['e', 'ne']);
  });

  it('has its root allocated from the start, and costs a point for every other node', () => {
    const plane = originPlane('ringlet');
    expect(isAllocated(registry, plane, position(ORIGIN, 1))).toBe(true);
    expect(pointsSpent(plane)).toBe(0);

    expect(allocateNode(say, registry, plane, position(ORIGIN, 2), PLENTY)).toBeUndefined();
    expect(pointsSpent(plane)).toBe(1);
  });
});

describe('the rotation a slotted cluster stands at', () => {
  const landed = (direction: Direction): Plane => ({
    ...originPlane('crossroads'),
    [hexKey(at(NEIGHBOR_DELTA[direction].q, NEIGHBOR_DELTA[direction].r))]: { jewel: 'ringlet', entry: direction, allocatedPositions: [], allocatedSlots: [], effects: [] },
  });

  it('carries the root west edge onto the edge it entered through, through every one of the six', () => {
    for (const direction of DIRECTIONS) {
      const hex = at(NEIGHBOR_DELTA[direction].q, NEIGHBOR_DELTA[direction].r);
      const placement = placed(landed(direction), hex);
      expect(positionOnEdge(placement, opposite(direction)), direction).toBe(rootPosition(placement.jewel));
    }
  });

  it('is the identity through an east-facing slot and a half turn through a west-facing one', () => {
    expect(placed(landed('e'), at(1, 0)).rotation).toBe(0);
    expect(slotDirections(placed(landed('e'), at(1, 0)))).toEqual(['e', 'ne']);

    expect(placed(landed('w'), at(-1, 0)).rotation).toBe(3);
    expect(slotDirections(placed(landed('w'), at(-1, 0)))).toEqual(['w', 'sw']);
  });

  it('is a sixth of a turn for every other edge, and the plane stores only the edge', () => {
    for (const direction of DIRECTIONS) {
      const hex = at(NEIGHBOR_DELTA[direction].q, NEIGHBOR_DELTA[direction].r);
      const plane = landed(direction);
      const placement = placed(plane, hex);
      expect(slotDirections(placement), direction).toEqual(['e', 'ne'].map((authored) => rotate(authored as Direction, placement.rotation)));
      expect(Object.keys(clusterAt(plane, hex)!).includes('rotation'), direction).toBe(false);
    }
  });
});

describe('slotting a jewel', () => {
  it('places its cluster in the neighbouring hex and records the edge it came through', () => {
    const plane = reachedEastSlot();
    expect(fillSlot(say, registry, plane, ORIGIN, 'e', 'crossroads')).toBeUndefined();
    expect(clusterAt(plane, at(1, 0))).toEqual({ jewel: 'crossroads', entry: 'e', allocatedPositions: [], allocatedSlots: [], effects: [] });
    expect(slotState(registry, plane, ORIGIN, 'e')).toBe('filled');
  });

  it('costs no point of its own, so the jewel is the whole price', () => {
    const plane = reachedEastSlot();
    const before = pointsSpent(plane);
    fillSlot(say, registry, plane, ORIGIN, 'e', 'crossroads');
    expect(pointsSpent(plane)).toBe(before);
  });

  it('refuses an edge carrying no slot at all', () => {
    const plane = reachedEastSlot();
    expect(fillSlot(say, registry, plane, ORIGIN, 'sw', 'crossroads')).toMatch(/no jewel slot on the sw edge of 0,0/);
  });

  it('refuses a slot nobody has allocated', () => {
    const plane = originPlane('ringlet');
    expect(fillSlot(say, registry, plane, ORIGIN, 'e', 'crossroads')).toMatch(/has not been allocated/);
    expect(clusterAt(plane, at(1, 0))).toBeUndefined();
  });

  it('refuses a second jewel in a slot that already holds one', () => {
    const plane = reachedEastSlot();
    fillSlot(say, registry, plane, ORIGIN, 'e', 'crossroads');
    expect(fillSlot(say, registry, plane, ORIGIN, 'e', 'ringlet')).toMatch(/already holds a jewel/);
    expect(clusterAt(plane, at(1, 0))!.jewel).toBe('crossroads');
  });
});

// The two children of the origin end up side by side, which is the only way a
// hex can be faced by a slot that did not place it: a cluster never has a slot
// on the edge its own root came in through.
function twoNeighbouringChildren(): Plane {
  const plane = reachedEastSlot();
  fillSlot(say, registry, plane, ORIGIN, 'e', 'crossroads');
  allocateAll(plane, [slot(ORIGIN, 'ne')]);
  fillSlot(say, registry, plane, ORIGIN, 'ne', 'crossroads');
  allocateAll(plane, [position(at(1, 0), 1)]);
  return plane;
}

describe('a hex holds at most one cluster', () => {
  it('blocks the slot facing an occupied hex, for filling and for allocating alike', () => {
    const plane = twoNeighbouringChildren();
    expect(slotState(registry, plane, at(1, 0), 'nw')).toBe('blocked');

    const spent = pointsSpent(plane);
    expect(fillSlot(say, registry, plane, at(1, 0), 'nw', 'ringlet')).toMatch(/blocked: a cluster already stands in 1,-1/);
    expect(allocateNode(say, registry, plane, slot(at(1, 0), 'nw'), PLENTY)).toMatch(/blocked: a cluster already stands in 1,-1/);
    expect(pointsSpent(plane)).toBe(spent);
    expect(Object.keys(plane).sort()).toEqual(['0,0', '1,-1', '1,0']);
  });

  it('joins two clusters only through a slot that was filled, never through the edge they share', () => {
    const plane = twoNeighbouringChildren();
    const touching = neighbours(registry, plane, position(at(1, 0), 1));
    expect(touching.map((node) => hexKey(node.hex))).not.toContain('1,-1');
    expect(touching).toContainEqual(slot(ORIGIN, 'e'));
  });
});

describe('allocation', () => {
  it('asks for a neighbour and not a parent, so a ring is walked either way round', () => {
    const plane = originPlane('ringlet');
    allocateAll(plane, [position(ORIGIN, 6), position(ORIGIN, 5)]);
    expect(allocateNode(say, registry, plane, position(ORIGIN, 4), PLENTY)).toBeUndefined();

    allocateAll(plane, [position(ORIGIN, 2)]);
    expect(allocateNode(say, registry, plane, position(ORIGIN, 3), PLENTY)).toBeUndefined();
    expect(pointsSpent(plane)).toBe(5);
  });

  it('treats an unfilled position as a node: it costs a point, grants nothing and conducts', () => {
    const plane = originPlane('ringlet');
    expect(registry.clusterJewels.get('ringlet')!.positions[2]).toBeUndefined();
    expect(allocateNode(say, registry, plane, position(ORIGIN, 2), PLENTY)).toBeUndefined();
    expect(pointsSpent(plane)).toBe(1);
    expect(allocateNode(say, registry, plane, position(ORIGIN, 3), PLENTY)).toBeUndefined();
  });

  it('refuses a node nothing allocated touches, and the refusal costs nothing', () => {
    const plane = originPlane('ringlet');
    expect(allocateNode(say, registry, plane, position(ORIGIN, 4), PLENTY)).toMatch(/position 4 of 0,0 touches nothing allocated/);
    expect(allocateNode(say, registry, plane, slot(ORIGIN, 'e'), PLENTY)).toMatch(/the e slot of 0,0 touches nothing allocated/);
    expect(pointsSpent(plane)).toBe(0);
  });

  it('refuses when no point remains, and the refusal costs nothing', () => {
    const plane = originPlane('ringlet');
    expect(allocateNode(say, registry, plane, position(ORIGIN, 2), 0)).toMatch(/costs a point and none remain/);
    expect(pointsSpent(plane)).toBe(0);
  });

  it('refuses a node twice, the pre-allocated root included', () => {
    const plane = originPlane('ringlet');
    allocateAll(plane, [position(ORIGIN, 2)]);
    expect(allocateNode(say, registry, plane, position(ORIGIN, 2), PLENTY)).toMatch(/already allocated/);
    expect(allocateNode(say, registry, plane, position(ORIGIN, 1), PLENTY)).toMatch(/already allocated/);
    expect(pointsSpent(plane)).toBe(1);
  });

  it('refuses a position the shape does not have, and an edge with no slot on it', () => {
    const plane = originPlane('ringlet');
    expect(allocateNode(say, registry, plane, position(ORIGIN, 7), PLENTY)).toMatch(/ring has no position 7 \(1-6\)/);
    expect(allocateNode(say, registry, plane, slot(ORIGIN, 'sw'), PLENTY)).toMatch(/no jewel slot on the sw edge/);
  });
});

describe('a plane whose content moved underneath it', () => {
  it('drops a cluster whose declaration is gone, with everything allocated in it', () => {
    const plane = twoNeighbouringChildren();
    expect(pointsSpent(plane)).toBe(6);

    expect(repairPlane(say, withoutCrossroads, plane)).toEqual([
      'dropped the crossroads cluster at 1,0, whose declaration is gone, and everything allocated in it',
      'dropped the crossroads cluster at 1,-1, whose declaration is gone, and everything allocated in it',
    ]);
    expect(Object.keys(plane)).toEqual(['0,0']);
    expect(pointsSpent(plane)).toBe(5);
  });

  it('drops an allocation its jewel no longer has, returning the point', () => {
    const plane = reachedEastSlot();
    expect(repairPlane(say, narrowed, plane)).toEqual([
      'dropped position 4 of 0,0, which ringlet no longer has, returning its point',
      'dropped the e slot of 0,0, which ringlet no longer has, returning its point',
    ]);
    expect(pointsSpent(plane)).toBe(2);
  });

  it('drops a cluster stranded by the slot it entered through going away', () => {
    const plane = reachedEastSlot();
    fillSlot(say, registry, plane, ORIGIN, 'e', 'crossroads');
    allocateAll(plane, [position(at(1, 0), 1)]);

    expect(repairPlane(say, narrowed, plane)).toContainEqual('dropped the crossroads cluster at 1,0, which entered through a e slot of 0,0 that is gone');
    expect(Object.keys(plane)).toEqual(['0,0']);
  });

  it('drops what nothing allocated reaches any more, so the corridor cannot be paid for twice', () => {
    const plane = originPlane('ringlet');
    allocateAll(plane, [position(ORIGIN, 2), position(ORIGIN, 3)]);
    clusterAt(plane, ORIGIN)!.allocatedPositions = [3];

    expect(repairPlane(say, registry, plane)).toEqual(['dropped position 3 of 0,0, which nothing allocated reaches any more, returning its point']);
    expect(pointsSpent(plane)).toBe(0);
  });

  it('drops an effect whose declaration is gone', () => {
    const plane = originPlane('ringlet');
    clusterAt(plane, ORIGIN)!.effects = ['orb-of-vigour'];
    expect(repairPlane(say, registry, plane)).toEqual(['dropped the orb-of-vigour effect on the cluster at 0,0, whose declaration is gone']);
    expect(clusterAt(plane, ORIGIN)!.effects).toEqual([]);
  });

  it('leaves an origin standing whose own declaration went, because an item always has a plane', () => {
    const plane = originPlane('crossroads');
    expect(repairPlane(say, withoutCrossroads, plane)).toEqual(["the origin cluster crossroads is not loaded, so the base's own cluster stands in its place"]);
    expect(clusterAt(plane, ORIGIN)!.jewel).toBeNull();
  });

  it('has nothing left to say about a plane it has already repaired', () => {
    const plane = twoNeighbouringChildren();
    repairPlane(say, withoutCrossroads, plane);
    expect(repairPlane(say, withoutCrossroads, plane)).toEqual([]);
    expect(repairPlane(say, registry, twoNeighbouringChildren())).toEqual([]);
  });
});

describe('a plane a # save body claims to hold', () => {
  const cluster = { jewel: null, entry: null, allocatedPositions: [1], allocatedSlots: ['e'], effects: [] };

  it('is refused when it is not one', () => {
    for (const body of [3, null, [], {}, { '1,0': cluster }, { '0,0': 3 }, { '0,0': { ...cluster, entry: 'up' } }]) {
      expect(isPlane(body), JSON.stringify(body)).toBe(false);
    }
  });

  it('is refused when a hex key is one no plane would have written', () => {
    for (const key of ['-0,0', '1, 0', '1,0,0', 'x', '1.0,0']) {
      expect(isPlane({ '0,0': cluster, [key]: { ...cluster, entry: 'e' } }), key).toBe(false);
    }
  });

  it('is refused when a node is allocated twice, which would spend one point as two', () => {
    expect(isPlane({ '0,0': { ...cluster, allocatedPositions: [1, 1] } })).toBe(false);
    expect(isPlane({ '0,0': { ...cluster, allocatedSlots: ['e', 'e'] } })).toBe(false);
  });

  it('is refused when only the origin may stand unslotted', () => {
    expect(isPlane({ '0,0': cluster, '1,0': { ...cluster, entry: null } })).toBe(false);
    expect(isPlane({ '0,0': { ...cluster, entry: 'e' } })).toBe(false);
  });
});
