import { defaultTitle } from './info';
import { Action, actionBody } from '../grammar/action';
import { Condition, condition } from '../grammar/condition';
import { list } from '../grammar/list';
import { DslError, Parser } from '../grammar/parser';
import { SectionSchema } from '../grammar/section';
import { id, number, text } from '../grammar/values';

// The one flag every location owns without declaring it, because the engine
// sets it the first time the player arrives.
export const DISCOVERED = 'discovered';

export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export interface Relative {
  direction: Direction;
  of: string;
}

export interface Edge {
  target: string;
  condition?: Condition;
}

// How many of a type stand here. Absent is one, so every line that shipped
// before counts existed reads the same.
export interface Population {
  count?: number;
  entity: string;
}

export const populationCount = (entry: Population): number => entry.count ?? 1;

export interface Location {
  id: string;
  x: number;
  y: number;
  z: number;
  title: string;
  examine?: string;
  entities: Population[];
  adjacent: Edge[];
  flags: string[];
  starting: boolean;
  relative?: Relative;
  // Actions the location itself can do, as opposed to something standing in it.
  actions: Action[];
}

export const populationValue: Parser<Population> = {
  parse(cursor) {
    const start = cursor.pos;
    const count = cursor.take(/\d+(?![\w-])/);
    if (count === null) return { entity: id.parse(cursor) };
    if (Number(count) === 0) throw new DslError('a count of 0 puts nothing here, so leave the entry out', { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    cursor.take(/[ \t]+/);
    return { count: Number(count), entity: id.parse(cursor) };
  },
  print: (value) => (value.count === undefined ? value.entity : `${value.count} ${id.print(value.entity)}`),
  examples: ['rat', '3 rat'],
};

export const edgeValue: Parser<Edge> = {
  parse(cursor) {
    const target = id.parse(cursor);
    if (cursor.take(/[ \t]+while[ \t]+/) !== null) {
      return { target, condition: condition.parse(cursor) };
    }
    return { target };
  },
  print: (value) => (value.condition === undefined ? value.target : `${value.target} while ${condition.print(value.condition)}`),
  examples: ['clearing', 'clearing while has-key'],
};

const DIRECTION = /north|south|east|west|up|down/;

export const relativeValue: Parser<Relative> = {
  parse(cursor) {
    const direction = cursor.take(DIRECTION);
    if (direction === null) throw new DslError('expected a direction', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    if (cursor.take(/[ \t]+of[ \t]+/) === null) throw new DslError("expected 'of' after a direction", { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return { direction: direction as Direction, of: id.parse(cursor) };
  },
  print: (value) => `${value.direction} of ${id.print(value.of)}`,
  examples: ['north of clearing', 'down of shaft'],
};

const DIRECTION_VECTORS: Record<Direction, [number, number, number]> = {
  north: [0, 1, 0],
  south: [0, -1, 0],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 0, 1],
  down: [0, 0, -1],
};

export function recursivelyResolveRelativeCoordinates(locations: Map<string, Location>): void {
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

export const locationSchema: SectionSchema<Location, 'starting', 'actions'> = {
  kind: 'location',
  fields: {
    x: { parser: number, default: () => 0 },
    y: { parser: number, default: () => 0 },
    z: { parser: number, default: () => 0 },
    title: { parser: text, default: defaultTitle },
    examine: { parser: text },
    entities: { parser: list(populationValue), default: () => [] },
    adjacent: { parser: list(edgeValue), default: () => [] },
    flags: { parser: list(id), default: () => [] },
    relative: { parser: relativeValue },
  },
  keywords: ['starting'],
  bare: 'relative',
  exclusive: [
    ['x', 'y', 'z'],
    ['relative'],
  ],
  entries: { into: 'actions', body: actionBody },
};
