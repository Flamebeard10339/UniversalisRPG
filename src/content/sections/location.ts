import { actionResultLists } from '../../grammar/action';
import { Action, actionBody, actionLines } from '../../grammar/action';
import { Condition, condition } from '../../grammar/condition';
import { list } from '../../grammar/list';
import { STARTING_LOCATION } from '../../grammar/actionResult';
import { DslError, Parser } from '../../grammar/parser';
import { AnySchema, PrintContext, SectionSchema, listMembers, printSection } from '../../grammar/section';
import { id, lastSegment, number, text } from '../../grammar/values';
import { actions, condition as visitCondition, pruneActions, put, type Loose } from '../refs';
import { section, TOUCHED } from './define';
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

const RELATIVE_WORDS: Record<Direction, string> = {
  north: 'north of',
  south: 'south of',
  east: 'east of',
  west: 'west of',
  up: 'above',
  down: 'below',
};

const RELATIVE_ORDER = (Object.keys(RELATIVE_WORDS) as Direction[]).sort((one, other) => RELATIVE_WORDS[other].length - RELATIVE_WORDS[one].length);

const RELATIVE_PATTERN = new RegExp(RELATIVE_ORDER.map((direction) => RELATIVE_WORDS[direction].replace(/ /g, '[ \\t]+')).join('|'));

const directionWritten = (phrase: string): Direction | undefined => RELATIVE_ORDER.find((direction) => RELATIVE_WORDS[direction] === phrase.replace(/[ \t]+/g, ' '));

export const relativeValue: Parser<Relative> = {
  parse(cursor) {
    const start = cursor.pos;
    const phrase = cursor.take(RELATIVE_PATTERN);
    const direction = phrase === null ? undefined : directionWritten(phrase);
    if (direction === undefined)
      throw new DslError(`expected one of ${RELATIVE_ORDER.map((each) => RELATIVE_WORDS[each]).join(', ')}`, {
        start: cursor.abs(start),
        end: cursor.abs(cursor.pos),
      });
    if (cursor.take(/[ \t]+/) === null)
      throw new DslError(`expected a location after ${RELATIVE_WORDS[direction]}`, {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });
    return { direction, of: id.parse(cursor) };
  },
  print: (value) => `${RELATIVE_WORDS[value.direction]} ${id.print(value.of)}`,
  forms: RELATIVE_ORDER.map((direction) => `${RELATIVE_WORDS[direction]} <location>`),
  examples: RELATIVE_ORDER.map((direction) => `${RELATIVE_WORDS[direction]} clearing`),
};

export const DIRECTION_VECTORS: Record<Direction, readonly [number, number, number]> = {
  north: [0, -1, 0],
  south: [0, 1, 0],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 0, 1],
  down: [0, 0, -1],
};

export function stepToward(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): Direction | null {
  const run = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  if (run.x === 0 && run.y === 0 && run.z === 0) return null;
  const climb = Math.sign(run.z);
  const going = (Object.keys(DIRECTION_VECTORS) as Direction[]).filter((direction) => Math.sign(DIRECTION_VECTORS[direction][2]) === climb);
  const runs = (direction: Direction): number => DIRECTION_VECTORS[direction][0] * run.x + DIRECTION_VECTORS[direction][1] * run.y;
  return going.reduce((best, direction) => (runs(direction) > runs(best) ? direction : best));
}

export function entitiesStood(locations: ReadonlyMap<string, Location>): Map<string, string> {
  const stood = new Map<string, string>();
  for (const location of locations.values()) for (const entry of location.entities) if (!stood.has(entry.entity)) stood.set(entry.entity, location.id);
  return stood;
}

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

export interface Spot {
  x: number;
  y: number;
  z: number;
}

const NEWLINE = '\n';

const squareOf = (at: Spot): string => `${at.x}, ${at.y}, ${at.z}`;

const ringAround = (at: Spot, ring: number): Spot[] => {
  const around: Spot[] = [];
  for (let dx = -ring; dx <= ring; dx++)
    for (let dy = -ring; dy <= ring; dy++)
      if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) around.push({ x: at.x + dx, y: at.y + dy, z: at.z });
  return around.sort((one, other) => (one.x - at.x) ** 2 + (one.y - at.y) ** 2 - ((other.x - at.x) ** 2 + (other.y - at.y) ** 2) || one.y - other.y || one.x - other.x);
};

export function nearestFreeSquare(taken: ReadonlySet<string>, at: Spot): Spot {
  for (let ring = 1; ; ring++) {
    const free = ringAround(at, ring).find((spot) => !taken.has(squareOf(spot)));
    if (free !== undefined) return free;
  }
}

export function stackedLocations(placed: Iterable<{ id: string; x: number; y: number; z: number }>): string | undefined {
  const all = [...placed];
  const standing = new Map<string, string>();
  const stacked: { location: Spot & { id: string }; already: string }[] = [];
  for (const location of all) {
    const already = standing.get(squareOf(location));
    if (already !== undefined) stacked.push({ location, already });
    else standing.set(squareOf(location), location.id);
  }
  if (stacked.length === 0) return undefined;
  const taken = new Set(all.map(squareOf));
  return stacked
    .map(({ location, already }) => {
      const free = nearestFreeSquare(taken, location);
      taken.add(squareOf(free));
      return `location '${location.id}' stands at ${squareOf(location)}, and so does '${already}'; two places on one square draw on top of each other. The nearest square nothing stands on is ${squareOf(free)}`;
    })
    .join(NEWLINE);
}

export function refuseStackedLocations(locations: ReadonlyMap<string, Location>): void {
  const stacked = stackedLocations(locations.values());
  if (stacked !== undefined) throw new DslError(stacked);
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
    locations.set(location.id, { ...location, x, y, z });
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
    adjacent: {
      parser: list(edgeValue),
      default: () => [],
      block: true,
      note: 'a road out of here, and it answers from both ends: unless the place at the far end writes a road back of its own, the engine lays that road down there too, carrying whatever `while` this one carries. Writing it at either end is therefore enough, which is how a module reaches a place another module declared — and a far end that writes its own road back under a condition nothing sets is how a road is made one-way.',
    },
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
  const coordinates = lines.filter((line) => COORDINATE.test(line));
  if (value.relative || coordinates.length === 0) return [heading!, ...rest];
  return [heading!, coordinates.join(', '), ...rest];
};

export const location = section<Location, 'starting', 'actions'>()({
  flags: [TOUCHED, DISCOVERED],
  says: (value) => value.actions.flatMap(actionResultLists),
  ...SCHEMA,
  ids: 'owned',
  vocabulary: 'declared',
  map: 'locations',
  nestsActions: 'only while the player is standing here',
  text: ['title', 'examine'],
  validate: (value) => (lastSegment(value.id) === STARTING_LOCATION ? `${STARTING_LOCATION} is the name the engine answers with whichever location is marked starting, so nothing may be called it` : undefined),
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
