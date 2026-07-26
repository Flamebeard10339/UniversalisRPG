import { Condition, condition } from './condition';
import { list } from './list';
import { DslError, Parser } from './parser';
import { SectionSchema } from './section';
import { humanize, id, number, text } from './values';

export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export interface Relative {
  direction: Direction;
  of: string;
}

export interface Edge {
  target: string;
  condition?: Condition;
}

export interface Location {
  id: string;
  x: number;
  y: number;
  z: number;
  title: string;
  examine?: string;
  entities: string[];
  adjacent: Edge[];
  starting: boolean;
  relative?: Relative;
}

const edge: Parser<Edge> = {
  parse(cursor) {
    const target = id.parse(cursor);
    if (cursor.take(/[ \t]+while[ \t]+/) !== null) {
      return { target, condition: condition.parse(cursor) };
    }
    return { target };
  },
};

const DIRECTION = /north|south|east|west|up|down/;

const relative: Parser<Relative> = {
  parse(cursor) {
    const direction = cursor.take(DIRECTION);
    if (direction === null) throw new DslError('expected a direction', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    if (cursor.take(/[ \t]+of[ \t]+/) === null) throw new DslError("expected 'of' after a direction", { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return { direction: direction as Direction, of: id.parse(cursor) };
  },
};

const DIRECTION_VECTORS: Record<Direction, [number, number, number]> = {
  north: [0, 1, 0],
  south: [0, -1, 0],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 0, 1],
  down: [0, 0, -1],
};

// Resolves every location authored as `<direction> of <other>` into absolute
// x/y/z, walking one unit step from its origin's coordinates. Origins may
// themselves be relative, so this recurses to place an origin before the
// location that depends on it (insertion order alone isn't enough). Hydrated
// fields are read-only getters, so each resolved location is replaced in the
// map with a plain-valued copy rather than mutated. Throws on an unknown origin
// or a relative cycle.
export function resolveCoordinates(locations: Map<string, Location>): void {
  const placing = new Set<string>();
  const coords = new Map<string, [number, number, number]>();

  const place = (location: Location): [number, number, number] => {
    const cached = coords.get(location.id);
    if (cached) return cached;
    if (!location.relative) {
      const absolute: [number, number, number] = [location.x, location.y, location.z];
      coords.set(location.id, absolute);
      return absolute;
    }
    if (placing.has(location.id)) throw new DslError(`location coordinates form a cycle at '${location.id}'`);
    placing.add(location.id);

    const origin = locations.get(location.relative.of);
    if (!origin) throw new DslError(`location '${location.id}' is placed relative to unknown location '${location.relative.of}'`);
    const [ox, oy, oz] = place(origin);
    const [dx, dy, dz] = DIRECTION_VECTORS[location.relative.direction];
    const stepped: [number, number, number] = [ox + dx, oy + dy, oz + dz];

    placing.delete(location.id);
    coords.set(location.id, stepped);
    return stepped;
  };

  for (const location of locations.values()) place(location);
  for (const location of [...locations.values()]) {
    if (!location.relative) continue;
    const [x, y, z] = coords.get(location.id)!;
    locations.set(location.id, { ...location, x, y, z, relative: undefined });
  }
}

export const locationSchema: SectionSchema<Location, 'starting'> = {
  kind: 'location',
  fields: {
    x: { parser: number, default: () => 0 },
    y: { parser: number, default: () => 0 },
    z: { parser: number, default: () => 0 },
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text },
    entities: { parser: list(id), default: () => [] },
    adjacent: { parser: list(edge), default: () => [] },
    relative: { parser: relative },
  },
  flags: ['starting'],
  bare: 'relative',
  exclusive: [
    ['x', 'y', 'z'],
    ['relative'],
  ],
};
