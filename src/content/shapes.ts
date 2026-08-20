import { DslError } from '../grammar/parser';
import { Direction } from './hex';

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
  for (let i = 0; i < count; i++) pairs.push([offset + i + 1, offset + ((i + 1) % count) + 1]);
  return pairs;
}

function spokes(count: number, offset: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < count; i++) pairs.push([i + 1, offset + i + 1]);
  return pairs;
}

const point: Shape = {
  name: 'point',
  positionCount: 1,
  adjacency: [],
  edges: allEdgesTouch(1),
};

const spindle: Shape = {
  name: 'spindle',
  positionCount: 3,
  adjacency: [
    [1, 2],
    [2, 3],
  ],
  edges: { w: 1, nw: 1, sw: 1, e: 3, ne: 3, se: 3 },
};

const ring: Shape = {
  name: 'ring',
  positionCount: 6,
  adjacency: cycle(6),
  edges: RING_EDGES,
};

const wheel: Shape = {
  name: 'wheel',
  positionCount: 7,
  adjacency: [...cycle(6), ...spokes(6, 6).map(([p]): [number, number] => [p, 7])],
  edges: RING_EDGES,
};

const doubleRing: Shape = {
  name: 'double-ring',
  positionCount: 12,
  adjacency: [...cycle(6), ...cycle(6, 6), ...spokes(6, 6)],
  edges: RING_EDGES,
};

const CATALOGUE: Readonly<Record<string, Shape>> = {
  point,
  spindle,
  ring,
  wheel,
  'double-ring': doubleRing,
};

export const SHAPES: readonly Shape[] = Object.values(CATALOGUE);

export function getShape(name: string): Shape {
  const shape = CATALOGUE[name];
  if (!shape) {
    throw new DslError(`shape must be one of ${Object.keys(CATALOGUE).join(', ')}, got ${JSON.stringify(name)}`);
  }
  return shape;
}
