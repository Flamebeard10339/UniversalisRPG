import { describe, expect, it } from "vitest";
import { DIRECTIONS } from "./hex";
import { getShape, Shape, SHAPES } from "./shapes";

function reachableFrom(shape: Shape, start: number): Set<number> {
  const neighbours = new Map<number, number[]>();
  for (let p = 1; p <= shape.positionCount; p++) neighbours.set(p, []);
  for (const [a, b] of shape.adjacency) {
    neighbours.get(a)!.push(b);
    neighbours.get(b)!.push(a);
  }
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of neighbours.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// c3: every shape's connectivity is proved once, here, over the whole
// catalogue — no per-jewel reachability check exists anywhere else.
describe("every shape in the catalogue is connected", () => {
  for (const shape of SHAPES) {
    it(`${shape.name} reaches every position from position 1`, () => {
      expect(reachableFrom(shape, 1).size).toBe(shape.positionCount);
    });
  }
});

describe("the shape catalogue", () => {
  it("numbers positions 1..N and never lets adjacency or an edge name a position outside that range", () => {
    for (const shape of SHAPES) {
      for (const [a, b] of shape.adjacency) {
        expect(a).toBeGreaterThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(shape.positionCount);
        expect(b).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(shape.positionCount);
      }
      for (const direction of DIRECTIONS) {
        const position = shape.edges[direction];
        expect(position).toBeGreaterThanOrEqual(1);
        expect(position).toBeLessThanOrEqual(shape.positionCount);
      }
    }
  });

  it("point is one position that every edge touches", () => {
    const shape = getShape("point");
    expect(shape.positionCount).toBe(1);
    for (const direction of DIRECTIONS) expect(shape.edges[direction]).toBe(1);
  });

  it("spindle is three in a line, w/nw/sw on 1 and e/ne/se on 3", () => {
    const shape = getShape("spindle");
    expect(shape.positionCount).toBe(3);
    expect(shape.adjacency).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(shape.edges).toEqual({ w: 1, nw: 1, sw: 1, e: 3, ne: 3, se: 3 });
  });

  it("ring, wheel and double-ring share the edge map w->1, nw->2, ne->3, e->4, se->5, sw->6", () => {
    const expected = { w: 1, nw: 2, ne: 3, e: 4, se: 5, sw: 6 };
    expect(getShape("ring").edges).toEqual(expected);
    expect(getShape("wheel").edges).toEqual(expected);
    expect(getShape("double-ring").edges).toEqual(expected);
  });

  it("ring is a 6-cycle", () => {
    const shape = getShape("ring");
    expect(shape.positionCount).toBe(6);
    expect(shape.adjacency).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 1],
    ]);
  });

  it("wheel is the ring plus a hub adjacent to all six", () => {
    const shape = getShape("wheel");
    expect(shape.positionCount).toBe(7);
    for (let p = 1; p <= 6; p++) {
      expect(shape.adjacency).toContainEqual([p, 7]);
    }
  });

  it("double-ring is an outer ring, an inner ring, and six spokes joining them", () => {
    const shape = getShape("double-ring");
    expect(shape.positionCount).toBe(12);
    expect(shape.adjacency).toContainEqual([1, 2]);
    expect(shape.adjacency).toContainEqual([7, 8]);
    for (let p = 1; p <= 6; p++) {
      expect(shape.adjacency).toContainEqual([p, p + 6]);
    }
  });

  it("names a shape that does not exist with an error listing the ones that do", () => {
    expect(() => getShape("hexagram")).toThrow(
      /point, spindle, ring, wheel, double-ring/,
    );
  });
});
