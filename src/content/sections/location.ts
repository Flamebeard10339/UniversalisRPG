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

// Whether this place is on the player's map — which a road reaching it from somewhere they stood is
// enough for. It is a weaker thing than `TOUCHED`, and the two are separate flags because a place
// heard of and a place stood in are what a `when:` most often needs to tell apart.
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

// How a place written off another is written, one phrase per direction. The four headings take `of`;
// the two floors read as the prepositions they already are, because `below market-row` is what
// somebody would say and a floor written as a heading is not.
//
// A record over `Direction`, so a language that grew a seventh would not compile until this said how
// to write it. And the only place the phrasing is written: reading one, printing one, and the forms
// the editing page offers are this table read three ways, so the wording is changed here and in the
// worlds that were written in it, and nowhere else.
const RELATIVE_WORDS: Record<Direction, string> = {
  north: 'north of',
  south: 'south of',
  east: 'east of',
  west: 'west of',
  up: 'above',
  down: 'below',
};

// Longest phrase first, so a short one that begins a long one could never win the match.
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

// Which way each direction goes, in the coordinates a world writes. North is a smaller `y`, the way
// it is on every map anybody has drawn: `y` counts down the page, so the north gate of a town is
// written above its square and drawn above it. Everything that has an opinion about which way a place
// lies reads this, so a world that wanted its map the other way up would turn it here and nowhere else.
export const DIRECTION_VECTORS: Record<Direction, readonly [number, number, number]> = {
  north: [0, -1, 0],
  south: [0, 1, 0],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 0, 1],
  down: [0, 0, -1],
};

// Which single step out of one place points at another. A place is written off another as one step in
// one direction, so this is the direction that step would have to be: the floor between them if they
// are on different floors, because a heading keeps its floor and only `up` and `down` leave it, and
// otherwise whichever heading runs most nearly the way the far place lies. Both halves are read off
// the vectors above rather than listed, so a language that grew a seventh direction offers it here
// with nothing edited. Nothing at all for a place and itself, which is no step.
export function stepToward(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): Direction | null {
  const run = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  if (run.x === 0 && run.y === 0 && run.z === 0) return null;
  const climb = Math.sign(run.z);
  const going = (Object.keys(DIRECTION_VECTORS) as Direction[]).filter((direction) => Math.sign(DIRECTION_VECTORS[direction][2]) === climb);
  const runs = (direction: Direction): number => DIRECTION_VECTORS[direction][0] * run.x + DIRECTION_VECTORS[direction][1] * run.y;
  return going.reduce((best, direction) => (runs(direction) > runs(best) ? direction : best));
}

// Where a player may walk up to each entity anything stands. Nothing else puts one in a room — a
// population only counts the deficit against this list — so an entity absent here is one no player
// meets, which is what the entity a game is played as has in common with a template nobody stands.
export function entitiesStood(locations: ReadonlyMap<string, Location>): Map<string, string> {
  const stood = new Map<string, string>();
  for (const location of locations.values()) for (const entry of location.entities) if (!stood.has(entry.entity)) stood.set(entry.entity, location.id);
  return stood;
}

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

// Two places on one square are one place to everything that reads a coordinate: the map draws them
// stacked, the compass has no bearing between them, and the step from one to the other is no step.
// The squares are counted off whatever it is handed rather than named here, so a floor genuinely
// over another is told apart by its `z` and nothing has to be exempted — and a map edit can put the
// world it is about to write to the same question the load path puts to the world it read, getting
// the same answer in the same words. Whatever is handed in last is the one the sentence leads with,
// so an editor showing a move its own room first only has to say what is moving last.
export function stackedLocations(placed: Iterable<{ id: string; x: number; y: number; z: number }>): string | undefined {
  const standing = new Map<string, string>();
  for (const location of placed) {
    const square = `${location.x}, ${location.y}, ${location.z}`;
    const already = standing.get(square);
    if (already !== undefined) return `location '${location.id}' stands at ${square}, and so does '${already}'; two places on one square draw on top of each other`;
    standing.set(square, location.id);
  }
  return undefined;
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
  // The coordinates are worked out and written on; how they were arrived at is kept. A place written
  // `above castle-hall` is somewhere the moment the world is loaded — nothing downstream resolves
  // anything — and it still says what it hangs off, which is what prints it back the way it was
  // written and what tells a map that moving the hall moves this too.
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
