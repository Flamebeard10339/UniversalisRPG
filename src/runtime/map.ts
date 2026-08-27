import { DIRECTION_VECTORS, type Direction } from '../content/sections/location';
import type { Answer } from './localized';
import type { Place, PlayChoice } from './session';
import { waysOut, type WayOut } from './waysOut';

export type { Place } from './session';

// What the map is drawn from, which is a corner of what a view publishes.
export interface Standing {
  discovered: readonly Place[];
  location: { id: Answer };
  choices: readonly PlayChoice[];
  mapGrid: number;
}

// Which way one place lies from another. The four the language declares, the four that lie between
// them, and the two that are a floor rather than a heading. Composed from `Direction` rather than
// listed beside it, so a language that grew a seventh direction would not compile until this said
// what a bearing is now.
export type Bearing = Direction | `${Extract<Direction, 'north' | 'south'>}-${Extract<Direction, 'east' | 'west'>}`;

const CARDINALS: readonly Direction[] = ['north', 'east', 'south', 'west'];

const flat = (direction: Direction): [number, number] => [DIRECTION_VECTORS[direction][0], DIRECTION_VECTORS[direction][1]];

const lateral = (direction: Direction): boolean => direction === 'east' || direction === 'west';

const between = (one: Direction, next: Direction): Bearing => (lateral(one) ? `${next}-${one}` : `${one}-${next}`) as Bearing;

// The eight headings and where each points, worked out from the four vectors the language holds. A
// diagonal is the sum of the two cardinals it lies between, and is named for them in the order a
// compass says them — north or south first, because that is how the words go.
const HEADINGS: readonly { bearing: Bearing; angle: number }[] = CARDINALS.flatMap((one, at) => {
  const next = CARDINALS[(at + 1) % CARDINALS.length]!;
  const [ax, ay] = flat(one);
  const [bx, by] = flat(next);
  return [
    { bearing: one as Bearing, angle: Math.atan2(ay, ax) },
    { bearing: between(one, next), angle: Math.atan2(ay + by, ax + bx) },
  ];
});

// How far apart two headings are, going the short way round.
const apart = (one: number, other: number): number => Math.abs(Math.atan2(Math.sin(one - other), Math.cos(one - other)));

// Which way `to` lies from `from`. A place directly above or below is a floor and not a heading; two
// places drawn in the same square lie nowhere at all, which is what a road nobody could point along
// looks like from here.
export function bearingOf(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): Bearing | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return to.z === from.z ? null : to.z > from.z ? 'up' : 'down';
  const angle = Math.atan2(dy, dx);
  let nearest = HEADINGS[0]!;
  for (const heading of HEADINGS) if (apart(heading.angle, angle) < apart(nearest.angle, angle)) nearest = heading;
  return nearest.bearing;
}

export interface Node {
  place: Place;
  here: boolean;
  // How many floors above the drawn one this place stands, so a renderer can say so without asking
  // which floor is drawn.
  climb: number;
  at: { x: number; y: number };
  // Where in the numbered list of offers the choice that walks here sits, or nothing if no road out
  // of here leads to it now.
  goes: number | null;
  bearing: Bearing | null;
}

export interface Road {
  from: Answer;
  to: Answer;
  open: boolean;
  // Connectivity is directional, so a road only walked one way is a different road from one walked
  // both, and is drawn as one.
  mutual: boolean;
}

export interface Way extends WayOut {
  bearing: Bearing | null;
}

export interface Sheet {
  // The floor being drawn, and the floors that may be asked for from where the player stands.
  plane: number;
  planes: number[];
  here: Answer;
  // How far apart one step of the world's coordinates is drawn. Carried on the sheet so a renderer
  // reads one number rather than two facts that have to agree.
  grid: number;
  nodes: Node[];
  roads: Road[];
  ways: Way[];
}

// How far off the drawn floor a place is nudged so it does not sit under the place above it.
export const CLIMB_NUDGE = 0.42;

export function drawnAt(place: { x: number; y: number; z: number }, plane: number): { x: number; y: number } {
  const climb = place.z - plane;
  return { x: place.x + climb * CLIMB_NUDGE, y: place.y - climb * CLIMB_NUDGE };
}

export const placedAt = (at: { x: number; y: number }, climb: number): { x: number; y: number } => ({ x: at.x - climb * CLIMB_NUDGE, y: at.y + climb * CLIMB_NUDGE });

// The floors the player may look at: the one they are standing on, and any a road out of here
// actually reaches. A cellar under a castle nobody can get into from the market is not a floor of
// the market, and offering it is offering to look through the floor.
function planesFrom(places: readonly Place[], standing: Place | undefined): number[] {
  if (!standing) return [...new Set(places.map((place) => place.z))].sort((low, high) => low - high);
  const floors = new Set([standing.z]);
  for (const edge of standing.adjacent) {
    const far = places.find((place) => place.id === edge.to);
    if (far) floors.add(far.z);
  }
  return [...floors].sort((low, high) => low - high);
}

export function sheetOf(status: Standing, asked: number | null): Sheet {
  const places = status.discovered;
  const here = status.location.id;
  const standing = places.find((place) => place.id === here);
  const plane = asked ?? standing?.z ?? 0;

  const ways: Way[] = waysOut(status.choices).map((way) => {
    const far = places.find((place) => place.id === way.to);
    return { ...way, bearing: standing && far ? bearingOf(standing, far) : null };
  });
  const travels = new Map(ways.map((way) => [way.to, way.at]));

  const reachable = new Set(standing?.adjacent.map((edge) => edge.to) ?? []);
  const shown = places.filter((place) => place.z === plane || place.id === here || reachable.has(place.id) || travels.has(place.id));
  const nodes: Node[] = shown.map((place) => ({
    place,
    here: place.id === here,
    climb: place.z - plane,
    at: drawnAt(place, plane),
    goes: travels.get(place.id) ?? null,
    bearing: standing ? bearingOf(standing, place) : null,
  }));

  const drawn = new Set(nodes.map((node) => node.place.id));
  const roads: Road[] = [];
  for (const node of nodes) {
    for (const edge of node.place.adjacent) {
      const from = node.place.id;
      if (!drawn.has(edge.to)) continue;
      const mutual = places.find((place) => place.id === edge.to)?.adjacent.some((back) => back.to === from) === true;
      if (mutual && String(from) > String(edge.to)) continue;
      roads.push({ from, to: edge.to, open: edge.open, mutual });
    }
  }

  return { plane, planes: planesFrom(places, standing), here, grid: status.mapGrid, nodes, roads, ways };
}

// The nine squares a way out is offered in, laid out the way it lies: north-west at the top left,
// the place you are standing in at the middle. The first way to fill a square keeps it and every
// other way — a second road the same way, a floor up or down, anything the player can reach that no
// heading points at — falls to what is listed under the grid.
export const COMPASS: readonly (Bearing | null)[] = ['north-west', 'north', 'north-east', 'west', null, 'east', 'south-west', 'south', 'south-east'];

export interface Compass {
  cells: (Way | null)[];
  rest: Way[];
}

export function compassOf(ways: readonly Way[]): Compass {
  const cells: (Way | null)[] = COMPASS.map(() => null);
  const rest: Way[] = [];
  // Only the roads out of here. A journey across the map has a heading too, but it is not a door out
  // of this room, and the lists both surfaces draw leave it out for the same reason.
  for (const way of ways.filter((each) => each.legs <= 1)) {
    const at = way.bearing === null ? -1 : COMPASS.indexOf(way.bearing);
    if (at < 0 || cells[at] !== null) rest.push(way);
    else cells[at] = way;
  }
  return { cells, rest };
}
