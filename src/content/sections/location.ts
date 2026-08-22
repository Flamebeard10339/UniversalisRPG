import { actionResultLists } from '../../grammar/action';
import { Action, actionBody, actionLines } from '../../grammar/action';
import { Condition, condition } from '../../grammar/condition';
import { list } from '../../grammar/list';
import { DslError, Parser } from '../../grammar/parser';
import { AnySchema, PrintContext, SectionSchema, listMembers, printSection } from '../../grammar/section';
import { id, number, text } from '../../grammar/values';
import { actions, condition as visitCondition, pruneActions, put, type Loose } from '../refs';
import { section } from './define';
import { TITLE_FIELD } from './info';

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

// An absent count is one.
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
  forms: ['<entity>', '<count> <entity>'],
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
  holds: () => ({ condition }),
  forms: ['<location>', '<location> while <condition>'],
  examples: ['clearing', 'clearing while has-key'],
};

const DIRECTION = /north|south|east|west|up|down/;

export const relativeValue: Parser<Relative> = {
  parse(cursor) {
    const direction = cursor.take(DIRECTION);
    if (direction === null)
      throw new DslError('expected a direction', {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });
    if (cursor.take(/[ \t]+of[ \t]+/) === null)
      throw new DslError("expected 'of' after a direction", {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });
    return { direction: direction as Direction, of: id.parse(cursor) };
  },
  print: (value) => `${value.direction} of ${id.print(value.of)}`,
  forms: ['<direction> of <location>'],
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

// A road an author writes only from one end is walked from the other end too, carrying the same
// condition, unless the far end already writes an edge back — an authored edge always beats a derived one.
export function closeAdjacency(locations: ReadonlyMap<string, Location>): Map<string, Edge[]> {
  const roads = new Map<string, Edge[]>();
  for (const location of locations.values()) roads.set(location.id, [...location.adjacent]);
  for (const location of locations.values()) {
    for (const edge of location.adjacent) {
      const farEnd = locations.get(edge.target);
      if (farEnd?.adjacent.some((back) => back.target === location.id)) continue;
      roads.get(edge.target)?.push({ target: location.id, condition: edge.condition });
    }
  }
  return roads;
}

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

const SCHEMA: SectionSchema<Location, 'starting', 'actions'> = {
  kind: 'location',
  fields: {
    relative: { parser: relativeValue },
    x: { parser: number, default: () => 0 },
    y: { parser: number, default: () => 0 },
    z: { parser: number, default: () => 0 },
    title: TITLE_FIELD,
    examine: { parser: text },
    entities: { parser: list(populationValue), default: () => [], block: true },
    adjacent: { parser: list(edgeValue), default: () => [], block: true },
    flags: { parser: list(id), default: () => [], block: true },
  },
  keywords: ['starting'],
  keywordsAfter: 'examine',
  bare: 'relative',
  exclusive: [['x', 'y', 'z'], ['relative']],
  entries: { into: 'actions', body: actionBody },
};

const COORDINATE = /^[xyz]: /;

const printLocation = (value: Location, context: PrintContext): readonly string[] => {
  const lines = printSection(value, SCHEMA as unknown as AnySchema, context, actionLines);
  const [heading, ...rest] = lines.filter((line) => !COORDINATE.test(line));
  if (value.relative) return [heading!, ...rest];
  return [heading!, lines.filter((line) => COORDINATE.test(line)).join(', '), ...rest];
};

export const location = section<Location, 'starting', 'actions'>()({
  flags: [DISCOVERED],
  says: (value) => value.actions.flatMap(actionResultLists),
  ...SCHEMA,
  ids: 'owned',
  map: 'locations',
  nestsActions: true,
  text: ['title', 'examine'],
  print: printLocation,
  visit: (value, where, visit) => {
    const held = value as unknown as Loose;
    for (const entry of listMembers<Population>(held.entities)) put(entry, 'entity', 'entity', `${where} entities:`, visit);
    for (const edge of listMembers<Edge>(held.adjacent)) {
      put(edge, 'target', 'location', `${where} adjacent:`, visit);
      visitCondition(edge.condition, `${where} adjacent: ${edge.target} while`, visit);
    }
    if (held.relative) put(held.relative as Relative, 'of', 'location', `${where} relative`, visit);
    actions(held.actions, where, visit);
  },
  prune: (value, at, where) => {
    if (value.relative && at.gone('location', value.relative.of, `${where} relative`)) return null;
    const entities = value.entities.filter((entry) => !at.gone('entity', entry.entity, `${where} entities:`));
    const adjacent = value.adjacent.filter((edge) => !at.gone('location', edge.target, `${where} adjacent:`) && at.intact(() => visitCondition(edge.condition, `${where} adjacent: ${edge.target} while`, at.visit)));
    const kept = pruneActions(value.actions, where, at);
    return entities.length === value.entities.length && adjacent.length === value.adjacent.length && kept.length === value.actions.length ? value : { ...value, entities, adjacent, actions: kept };
  },
});
