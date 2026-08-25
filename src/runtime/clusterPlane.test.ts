import { describe, expect, it } from 'vitest';
import { DIRECTIONS, Direction, Hex, hexKey, NEIGHBOR_DELTA, opposite, PlaneNode, rotate } from '../content/hex';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { loadUniverse } from '../content/load';
import { Registry } from '../content/registry';
import { shippedSources } from '../content/shipped';
import { getShape } from '../content/shapes';
import { positionPayloads } from './clusterEffect';
import { DEFAULT_RNG_SEED, RngCursor } from './rng';
import {
  allocateNode,
  clusterAt,
  fillSlot,
  isAllocated,
  isPlane,
  neighbours,
  nodeKey,
  ORIGIN,
  originPlane,
  Plane,
  placementAt,
  planeClusters,
  pointsSpent,
  positionOnEdge,
  repairPlane,
  rootPosition,
  slotDirections,
  slotState,
  unallocateNode,
} from './clusterPlane';
import { localizerFor } from './localized';
import { say, type Said } from './said';

const COMMON =
  FIXTURE_WORLD +
  `
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

const ROLLED = `
# passive wide
+1-1000 attack

# cluster-jewel widering
shape: ring
open-connections: e
passives: 1 wide
`;

const registry = loadInEnglish(COMMON + CROSSROADS + ROLLED);
const english = localizerFor(registry, 'en');
const words = (said: Said | undefined): string | undefined => (said === undefined ? undefined : say(english, said));
const withoutCrossroads = loadInEnglish(COMMON);
const narrowed = loadInEnglish(`${COMMON.replace('shape: ring\nopen-connections: e, ne\npassives: 1 hale, 4 stout', 'shape: spindle\nopen-connections: ne\npassives: 1 hale')}${CROSSROADS}`);

const at = (q: number, r: number): Hex => ({ q, r });
const position = (hex: Hex, index: number): PlaneNode => ({ hex, kind: 'position', position: index });
const slot = (hex: Hex, direction: Direction): PlaneNode => ({ hex, kind: 'slot', direction });
const placed = (plane: Plane, hex: Hex, where: Registry = registry) => placementAt(where, plane, hex)!;

const PLENTY = 99;

const cursor = (): RngCursor => ({ rng: DEFAULT_RNG_SEED });

function allocateAll(plane: Plane, nodes: PlaneNode[]): void {
  for (const node of nodes) {
    const refusal = allocateNode(registry, plane, node, PLENTY);
    if (refusal) throw new Error(words(refusal));
  }
}

function reachedEastSlot(): Plane {
  const plane = originPlane('ringlet', 0.5);
  allocateAll(plane, [position(ORIGIN, 2), position(ORIGIN, 3), position(ORIGIN, 4), slot(ORIGIN, 'e')]);
  return plane;
}

describe('the origin cluster', () => {
  it('is a point with one open east connection when the base declares none of its own', () => {
    const plane = originPlane(null, 0.5);
    expect(slotDirections(placed(plane, ORIGIN))).toEqual(['e']);
    expect(slotState(registry, plane, ORIGIN, 'e')).toBe('open');
    expect(isPlane(plane)).toBe(true);
  });

  it('is the base own cluster when it declares one, standing unrotated', () => {
    const plane = originPlane('ringlet', 0.5);
    expect(placed(plane, ORIGIN).rotation).toBe(0);
    expect(slotDirections(placed(plane, ORIGIN))).toEqual(['e', 'ne']);
  });

  it('has its root allocated from the start, and costs a point for every other node', () => {
    const plane = originPlane('ringlet', 0.5);
    expect(isAllocated(registry, plane, position(ORIGIN, 1))).toBe(true);
    expect(pointsSpent(plane)).toBe(0);

    expect(allocateNode(registry, plane, position(ORIGIN, 2), PLENTY)).toBeUndefined();
    expect(pointsSpent(plane)).toBe(1);
  });
});

describe('the rotation a slotted cluster stands at', () => {
  const landed = (direction: Direction): Plane => ({
    ...originPlane('crossroads', 0.5),
    [hexKey(at(NEIGHBOR_DELTA[direction].q, NEIGHBOR_DELTA[direction].r))]: { jewel: 'ringlet', entry: direction, roll: 0.5, allocatedPositions: [], allocatedSlots: [], effects: [] },
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
    expect(fillSlot(registry, plane, ORIGIN, 'e', 'crossroads', cursor())).toBeUndefined();
    expect(clusterAt(plane, at(1, 0))).toEqual({ jewel: 'crossroads', entry: 'e', roll: expect.any(Number), allocatedPositions: [], allocatedSlots: [], effects: [] });
    expect(slotState(registry, plane, ORIGIN, 'e')).toBe('filled');
  });

  it('costs no point of its own, so the jewel is the whole price', () => {
    const plane = reachedEastSlot();
    const before = pointsSpent(plane);
    fillSlot(registry, plane, ORIGIN, 'e', 'crossroads', cursor());
    expect(pointsSpent(plane)).toBe(before);
  });

  it('refuses an edge carrying no slot at all', () => {
    const plane = reachedEastSlot();
    expect(words(fillSlot(registry, plane, ORIGIN, 'sw', 'crossroads', cursor()))).toMatch(/no jewel slot on the sw edge of 0,0/);
  });

  it('refuses a slot nobody has allocated', () => {
    const plane = originPlane('ringlet', 0.5);
    expect(words(fillSlot(registry, plane, ORIGIN, 'e', 'crossroads', cursor()))).toMatch(/has not been allocated/);
    expect(clusterAt(plane, at(1, 0))).toBeUndefined();
  });

  it('refuses a second jewel in a slot that already holds one', () => {
    const plane = reachedEastSlot();
    fillSlot(registry, plane, ORIGIN, 'e', 'crossroads', cursor());
    expect(words(fillSlot(registry, plane, ORIGIN, 'e', 'ringlet', cursor()))).toMatch(/already holds a jewel/);
    expect(clusterAt(plane, at(1, 0))!.jewel).toBe('crossroads');
  });
});

function twoNeighbouringChildren(): Plane {
  const plane = reachedEastSlot();
  fillSlot(registry, plane, ORIGIN, 'e', 'crossroads', cursor());
  allocateAll(plane, [slot(ORIGIN, 'ne')]);
  fillSlot(registry, plane, ORIGIN, 'ne', 'crossroads', cursor());
  allocateAll(plane, [position(at(1, 0), 1)]);
  return plane;
}

describe('a hex holds at most one cluster', () => {
  it('blocks the slot facing an occupied hex, for filling and for allocating alike', () => {
    const plane = twoNeighbouringChildren();
    expect(slotState(registry, plane, at(1, 0), 'nw')).toBe('blocked');

    const spent = pointsSpent(plane);
    expect(words(fillSlot(registry, plane, at(1, 0), 'nw', 'ringlet', cursor()))).toMatch(/blocked: a cluster already stands in 1,-1/);
    expect(words(allocateNode(registry, plane, slot(at(1, 0), 'nw'), PLENTY))).toMatch(/blocked: a cluster already stands in 1,-1/);
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
    const plane = originPlane('ringlet', 0.5);
    allocateAll(plane, [position(ORIGIN, 6), position(ORIGIN, 5)]);
    expect(allocateNode(registry, plane, position(ORIGIN, 4), PLENTY)).toBeUndefined();

    allocateAll(plane, [position(ORIGIN, 2)]);
    expect(allocateNode(registry, plane, position(ORIGIN, 3), PLENTY)).toBeUndefined();
    expect(pointsSpent(plane)).toBe(5);
  });

  it('treats an unfilled position as a node: it costs a point, grants nothing and conducts', () => {
    const plane = originPlane('ringlet', 0.5);
    expect(registry.clusterJewels.get('ringlet')!.positions[2]).toBeUndefined();
    expect(allocateNode(registry, plane, position(ORIGIN, 2), PLENTY)).toBeUndefined();
    expect(pointsSpent(plane)).toBe(1);
    expect(allocateNode(registry, plane, position(ORIGIN, 3), PLENTY)).toBeUndefined();
  });

  it('refuses a node nothing allocated touches, and the refusal costs nothing', () => {
    const plane = originPlane('ringlet', 0.5);
    expect(words(allocateNode(registry, plane, position(ORIGIN, 4), PLENTY))).toMatch(/position 4 of 0,0 touches nothing allocated/);
    expect(words(allocateNode(registry, plane, slot(ORIGIN, 'e'), PLENTY))).toMatch(/the e slot of 0,0 touches nothing allocated/);
    expect(pointsSpent(plane)).toBe(0);
  });

  it('refuses when no point remains, and the refusal costs nothing', () => {
    const plane = originPlane('ringlet', 0.5);
    expect(words(allocateNode(registry, plane, position(ORIGIN, 2), 0))).toMatch(/costs a point and none remain/);
    expect(pointsSpent(plane)).toBe(0);
  });

  it('refuses a node twice, the pre-allocated root included', () => {
    const plane = originPlane('ringlet', 0.5);
    allocateAll(plane, [position(ORIGIN, 2)]);
    expect(words(allocateNode(registry, plane, position(ORIGIN, 2), PLENTY))).toMatch(/already allocated/);
    expect(words(allocateNode(registry, plane, position(ORIGIN, 1), PLENTY))).toMatch(/already allocated/);
    expect(pointsSpent(plane)).toBe(1);
  });

  it('refuses a position the shape does not have, and an edge with no slot on it', () => {
    const plane = originPlane('ringlet', 0.5);
    expect(words(allocateNode(registry, plane, position(ORIGIN, 7), PLENTY))).toMatch(/ring has no position 7 \(1-6\)/);
    expect(words(allocateNode(registry, plane, slot(ORIGIN, 'sw'), PLENTY))).toMatch(/no jewel slot on the sw edge/);
  });
});

describe('unallocation', () => {
  it('gives the point back, and leaves the node standing there to be taken again', () => {
    const plane = originPlane('ringlet', 0.5);
    allocateAll(plane, [position(ORIGIN, 2), position(ORIGIN, 3)]);

    expect(unallocateNode(registry, plane, position(ORIGIN, 3))).toBeUndefined();
    expect(pointsSpent(plane)).toBe(1);
    expect(isAllocated(registry, plane, position(ORIGIN, 3))).toBe(false);
    expect(allocateNode(registry, plane, position(ORIGIN, 3), PLENTY)).toBeUndefined();
    expect(pointsSpent(plane)).toBe(2);
  });

  it('refuses a node nobody allocated, and a hexagon holding no cluster', () => {
    const plane = originPlane('ringlet', 0.5);
    expect(words(unallocateNode(registry, plane, position(ORIGIN, 4)))).toBe('position 4 of 0,0 is not allocated, so there is nothing there to take back');
    expect(words(unallocateNode(registry, plane, slot(ORIGIN, 'e')))).toBe('the e slot of 0,0 is not allocated, so there is nothing there to take back');
    expect(words(unallocateNode(registry, plane, position(at(9, 9), 1)))).toBe('no cluster stands in 9,9');
  });

  it('refuses the root the plane starts on, which cost nothing to have', () => {
    const plane = originPlane('ringlet', 0.5);
    expect(words(unallocateNode(registry, plane, position(ORIGIN, 1)))).toBe('position 1 of 0,0 is where the plane starts, and cost no point to take');
    expect(pointsSpent(plane)).toBe(0);
  });

  it('refuses a jewel socket, empty or filled, so its point is spent for good', () => {
    const plane = reachedEastSlot();
    const spent = pointsSpent(plane);
    expect(words(unallocateNode(registry, plane, slot(ORIGIN, 'e')))).toBe('the e slot of 0,0 is a jewel socket, and a socket is spent for good — a jewel put in one stays in it');

    fillSlot(registry, plane, ORIGIN, 'e', 'crossroads', cursor());
    expect(words(unallocateNode(registry, plane, slot(ORIGIN, 'e')))).toBe('the e slot of 0,0 is a jewel socket, and a socket is spent for good — a jewel put in one stays in it');
    expect(pointsSpent(plane)).toBe(spent);
    expect(clusterAt(plane, at(1, 0))).toBeDefined();
  });

  it('refuses a node another allocation stands on, naming what would be stranded', () => {
    const plane = reachedEastSlot();
    expect(words(unallocateNode(registry, plane, position(ORIGIN, 2)))).toBe('position 2 of 0,0 cannot be taken back while position 3 of 0,0 stands on it');
    expect(words(unallocateNode(registry, plane, position(ORIGIN, 4)))).toBe('position 4 of 0,0 cannot be taken back while the e slot of 0,0 stands on it');
    expect(pointsSpent(plane)).toBe(4);
  });

  it('refuses a corridor a socketed jewel is reached through, however far back it stands', () => {
    const plane = reachedEastSlot();
    fillSlot(registry, plane, ORIGIN, 'e', 'crossroads', cursor());
    allocateAll(plane, [position(at(1, 0), 1)]);

    for (const index of [2, 3, 4]) {
      expect(words(unallocateNode(registry, plane, position(ORIGIN, index))), String(index)).toMatch(/cannot be taken back while/);
    }
    expect(unallocateNode(registry, plane, position(at(1, 0), 1))).toBeUndefined();
  });
});

describe('a jewel already socketed', () => {
  const CHILD = at(1, 0);

  function socketedWidering(): { plane: Plane; root: number; drawn: RngCursor } {
    const plane = reachedEastSlot();
    const drawn = cursor();
    fillSlot(registry, plane, ORIGIN, 'e', 'widering', drawn);
    const root = rootPosition(placed(plane, CHILD).jewel);
    allocateAll(plane, [position(CHILD, root)]);
    return { plane, root, drawn };
  }

  it('reads its payloads at a roll a different roll would move', () => {
    const { plane, root } = socketedWidering();
    const shifted = socketedWidering();
    shifted.plane[hexKey(CHILD)]!.roll = clusterAt(plane, CHILD)!.roll < 0.5 ? 0.99 : 0.01;

    expect(positionPayloads(registry, shifted.plane, CHILD, root)).not.toEqual(positionPayloads(registry, plane, CHILD, root));
  });

  it('keeps that roll through a position given back and taken again, and draws nothing new', () => {
    const { plane, root, drawn } = socketedWidering();
    const before = positionPayloads(registry, plane, CHILD, root);
    const roll = clusterAt(plane, CHILD)!.roll;
    const cursorAfterFilling = drawn.rng;

    expect(unallocateNode(registry, plane, position(CHILD, root))).toBeUndefined();
    expect(clusterAt(plane, CHILD)!.roll).toBe(roll);
    expect(allocateNode(registry, plane, position(CHILD, root), PLENTY)).toBeUndefined();

    expect(clusterAt(plane, CHILD)!.roll).toBe(roll);
    expect(drawn.rng).toBe(cursorAfterFilling);
    expect(positionPayloads(registry, plane, CHILD, root)).toEqual(before);
  });
});

function everyNode(where: Registry, plane: Plane): PlaneNode[] {
  const nodes: PlaneNode[] = [];
  for (const { hex } of planeClusters(plane)) {
    const placement = placementAt(where, plane, hex);
    if (!placement) continue;
    for (let index = 1; index <= getShape(placement.jewel.shape).positionCount; index++) nodes.push(position(hex, index));
    for (const direction of slotDirections(placement)) nodes.push(slot(hex, direction));
  }
  return nodes;
}

function fillWhole(where: Registry, plane: Plane): void {
  for (let growing = true; growing; ) {
    growing = false;
    for (const node of everyNode(where, plane)) {
      if (allocateNode(where, plane, node, PLENTY) === undefined) growing = true;
    }
  }
}

// A plane that can shrink can be shrunk into a graph growing alone could never have made, so the
// claim is over the corpus's own jewels and over an arbitrary order of taking back: whatever order a
// player finds, the plane a load would have to repair is never reached, and nothing left standing is
// left standing silently.
describe('every cluster jewel the corpus declares', () => {
  const corpus = loadUniverse(shippedSources());
  const declared = [...corpus.clusterJewels.values()].map((jewel) => jewel.id);

  it('is written by enough of the corpus for what is below to mean something', () => {
    expect(declared.length).toBeGreaterThan(5);
  });

  it.each(declared)('unwinds from %s without ever reaching a plane a load would repair', (jewel) => {
    const plane = originPlane(jewel, 0.5);
    fillWhole(corpus, plane);
    const sockets = everyNode(corpus, plane).filter((node) => node.kind === 'slot' && isAllocated(corpus, plane, node));

    for (let shrinking = true; shrinking; ) {
      shrinking = false;
      for (const node of everyNode(corpus, plane)) {
        if (unallocateNode(corpus, plane, node) !== undefined) continue;
        shrinking = true;
        expect(repairPlane(corpus, plane).map(words)).toEqual([]);
      }
    }

    expect(sockets.filter((node) => !isAllocated(corpus, plane, node))).toEqual([]);
    for (const node of everyNode(corpus, plane)) {
      if (!isAllocated(corpus, plane, node)) continue;
      expect(unallocateNode(corpus, plane, node), nodeKey(node)).toBeDefined();
    }
  });

  it.each(declared)('gives every point back from %s when no socket was ever taken', (jewel) => {
    const plane = originPlane(jewel, 0.5);
    const shape = getShape(corpus.clusterJewels.get(jewel)!.shape);
    for (let growing = true; growing; ) {
      growing = false;
      for (const node of everyNode(corpus, plane)) {
        if (node.kind === 'slot') continue;
        if (allocateNode(corpus, plane, node, PLENTY) === undefined) growing = true;
      }
    }
    expect(pointsSpent(plane)).toBe(shape.positionCount - 1);

    for (let shrinking = true; shrinking; ) {
      shrinking = false;
      for (const node of everyNode(corpus, plane)) {
        if (unallocateNode(corpus, plane, node) === undefined) shrinking = true;
      }
    }
    expect(pointsSpent(plane)).toBe(0);
  });
});

describe('a plane whose content moved underneath it', () => {
  it('drops a cluster whose declaration is gone, with everything allocated in it', () => {
    const plane = twoNeighbouringChildren();
    expect(pointsSpent(plane)).toBe(6);

    expect(repairPlane(withoutCrossroads, plane).map(words)).toEqual([
      'dropped the crossroads cluster at 1,0, whose declaration is gone, and everything allocated in it',
      'dropped the crossroads cluster at 1,-1, whose declaration is gone, and everything allocated in it',
    ]);
    expect(Object.keys(plane)).toEqual(['0,0']);
    expect(pointsSpent(plane)).toBe(5);
  });

  it('drops an allocation its jewel no longer has, returning the point', () => {
    const plane = reachedEastSlot();
    expect(repairPlane(narrowed, plane).map(words)).toEqual([
      'dropped position 4 of 0,0, which ringlet no longer has, returning its point',
      'dropped the e slot of 0,0, which ringlet no longer has, returning its point',
    ]);
    expect(pointsSpent(plane)).toBe(2);
  });

  it('drops a cluster stranded by the slot it entered through going away', () => {
    const plane = reachedEastSlot();
    fillSlot(registry, plane, ORIGIN, 'e', 'crossroads', cursor());
    allocateAll(plane, [position(at(1, 0), 1)]);

    expect(repairPlane(narrowed, plane).map(words)).toContainEqual('dropped the crossroads cluster at 1,0, which entered through a e slot of 0,0 that is gone');
    expect(Object.keys(plane)).toEqual(['0,0']);
  });

  it('drops what nothing allocated reaches any more, so the corridor cannot be paid for twice', () => {
    const plane = originPlane('ringlet', 0.5);
    allocateAll(plane, [position(ORIGIN, 2), position(ORIGIN, 3)]);
    clusterAt(plane, ORIGIN)!.allocatedPositions = [3];

    expect(repairPlane(registry, plane).map(words)).toEqual(['dropped position 3 of 0,0, which nothing allocated reaches any more, returning its point']);
    expect(pointsSpent(plane)).toBe(0);
  });

  it('drops an effect whose declaration is gone', () => {
    const plane = originPlane('ringlet', 0.5);
    clusterAt(plane, ORIGIN)!.effects = ['orb-of-vigour'];
    expect(repairPlane(registry, plane).map(words)).toEqual(['dropped the orb-of-vigour effect on the cluster at 0,0, whose declaration is gone']);
    expect(clusterAt(plane, ORIGIN)!.effects).toEqual([]);
  });

  it('leaves an origin standing whose own declaration went, because an item always has a plane', () => {
    const plane = originPlane('crossroads', 0.5);
    expect(repairPlane(withoutCrossroads, plane).map(words)).toEqual(["the origin cluster crossroads is not loaded, so the base's own cluster stands in its place"]);
    expect(clusterAt(plane, ORIGIN)!.jewel).toBeNull();
  });

  it('has nothing left to say about a plane it has already repaired', () => {
    const plane = twoNeighbouringChildren();
    repairPlane(withoutCrossroads, plane);
    expect(repairPlane(withoutCrossroads, plane).map(words)).toEqual([]);
    expect(repairPlane(registry, twoNeighbouringChildren()).map(words)).toEqual([]);
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
