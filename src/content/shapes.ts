import { DslError } from "../grammar/parser";
import { Direction } from "./hex";

// A shape's positions are numbered 1..positionCount, and rotation never
// renumbers them — only `edges` moves. `adjacency` is undirected: each pair
// is unordered, and cycles are permitted because an edge only says two
// positions touch, never that anything travels along it (c3).
export interface Shape {
  readonly name: string;
  readonly positionCount: number;
  readonly adjacency: readonly (readonly [number, number])[];
  readonly edges: Readonly<Record<Direction, number>>;
}

function allEdgesTouch(position: number): Record<Direction, number> {
  return {
    e: position,
    ne: position,
    nw: position,
    w: position,
    sw: position,
    se: position,
  };
}

// w->1, nw->2, ne->3, e->4, se->5, sw->6 — shared by ring, wheel and
// double-ring (docs/smithing/cluster-jewels-draft.dsl lines 26-91). Position
// 1 is the root in all three.
const RING_EDGES: Readonly<Record<Direction, number>> = {
  w: 1,
  nw: 2,
  ne: 3,
  e: 4,
  se: 5,
  sw: 6,
};

function cycle(count: number, offset = 0): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < count; i++)
    pairs.push([offset + i + 1, offset + ((i + 1) % count) + 1]);
  return pairs;
}

function spokes(count: number, offset: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < count; i++) pairs.push([i + 1, offset + i + 1]);
  return pairs;
}

// The degenerate case and the pure junction: one node, every edge touches
// it, up to five ways out.
const point: Shape = {
  name: "point",
  positionCount: 1,
  adjacency: [],
  edges: allEdgesTouch(1),
};

// Three in a line: w/nw/sw touch 1, e/ne/se touch 3, and the middle position
// touches no edge at all.
const spindle: Shape = {
  name: "spindle",
  positionCount: 3,
  adjacency: [
    [1, 2],
    [2, 3],
  ],
  edges: { w: 1, nw: 1, sw: 1, e: 3, ne: 3, se: 3 },
};

// Six in a cycle, one per edge. A legitimate shape here: edges are
// undirected adjacency and nothing travels along one.
const ring: Shape = {
  name: "ring",
  positionCount: 6,
  adjacency: cycle(6),
  edges: RING_EDGES,
};

// The ring plus a hub adjacent to all six — the cheap crossing, two points
// from any edge to any other.
const wheel: Shape = {
  name: "wheel",
  positionCount: 7,
  adjacency: [
    ...cycle(6),
    ...spokes(6, 6).map(([p]): [number, number] => [p, 7]),
  ],
  edges: RING_EDGES,
};

// An outer ring on the edges, an inner ring, and six spokes joining them —
// twelve positions, the large cluster.
const doubleRing: Shape = {
  name: "double-ring",
  positionCount: 12,
  adjacency: [...cycle(6), ...cycle(6, 6), ...spokes(6, 6)],
  edges: RING_EDGES,
};

const CATALOGUE: Readonly<Record<string, Shape>> = {
  point,
  spindle,
  ring,
  wheel,
  "double-ring": doubleRing,
};

export const SHAPES: readonly Shape[] = Object.values(CATALOGUE);

// Naming a shape that does not exist fails at load with an error listing the
// ones that do (c3), the way `# event`'s trigger closes its list.
export function getShape(name: string): Shape {
  const shape = CATALOGUE[name];
  if (!shape) {
    throw new DslError(
      `shape must be one of ${Object.keys(CATALOGUE).join(", ")}, got ${JSON.stringify(name)}`,
    );
  }
  return shape;
}
