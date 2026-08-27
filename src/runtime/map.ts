import { DIRECTION_VECTORS, type Direction } from '../content/sections/location';
import type { Answer } from './localized';
import type { Place, PlayChoice, Region } from './session';
import { waysOut, type WayOut } from './waysOut';

export type { Place, Region } from './session';

// What the map is drawn from, which is a corner of what a view publishes.
export interface Standing {
  discovered: readonly Place[];
  regions: readonly Region[];
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
  regions: Drawn[];
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

// How much air a region's shape leaves round the places it holds, in the world's own squares. Wide
// enough that a place inside one is plainly inside it and a place beside one is plainly not.
export const REGION_PAD = 0.5;

interface Spot {
  x: number;
  y: number;
}

const cross = (o: Spot, a: Spot, b: Spot): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

// The smallest convex ring the points sit inside, walked anticlockwise. Andrew's monotone chain: the
// points sorted, the lower side and the upper side each walked once, turns that go the wrong way
// dropped. Fewer than three points, or points all in a line, leave a ring with no inside.
function ring(points: readonly Spot[]): Spot[] {
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  if (sorted.length < 3) return sorted;
  const half = (walk: readonly Spot[]): Spot[] => {
    const side: Spot[] = [];
    for (const point of walk) {
      while (side.length >= 2 && cross(side[side.length - 2]!, side[side.length - 1]!, point) <= 0) side.pop();
      side.push(point);
    }
    side.pop();
    return side;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

const boxRound = (points: readonly Spot[], pad: number): Spot[] => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [left, right, low, high] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  return [
    { x: left, y: low },
    { x: right, y: low },
    { x: right, y: high },
    { x: left, y: high },
  ];
};

// The shape drawn round a group of places: the ring they sit inside, pushed out from their middle so
// the places are within it rather than on it. One place, two places, or a row of them in a line have
// no ring with an inside, so those get a box round what they cover — which is the same shape a ring
// of two would have been if a ring of two were a shape.
export function hullOf(points: readonly Spot[], pad = REGION_PAD): Spot[] {
  if (points.length === 0) return [];
  const found = ring(points);
  if (found.length < 3) return boxRound(points, pad);
  const middle = { x: found.reduce((sum, point) => sum + point.x, 0) / found.length, y: found.reduce((sum, point) => sum + point.y, 0) / found.length };
  return found.map((point) => {
    const run = Math.hypot(point.x - middle.x, point.y - middle.y);
    if (run === 0) return point;
    return { x: point.x + ((point.x - middle.x) / run) * pad, y: point.y + ((point.y - middle.y) / run) * pad };
  });
}

export interface Drawn extends Region {
  // The places of this region the sheet is drawing. A region reaching onto another floor draws round
  // what is on this one.
  drawn: Answer[];
  hull: Spot[];
  // Where the region is drawn when it is drawn as one thing rather than as its places.
  at: Spot;
}

const middleOf = (points: readonly Spot[]): Spot =>
  points.length === 0 ? { x: 0, y: 0 } : { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };

function regionsOn(regions: readonly Region[], nodes: readonly Node[]): Drawn[] {
  const at = new Map(nodes.map((node) => [node.place.id, node.at]));
  return regions.flatMap((region) => {
    const drawn = region.holds.filter((held) => at.has(held));
    if (drawn.length === 0) return [];
    const points = drawn.map((held) => at.get(held)!);
    return [{ ...region, drawn, hull: hullOf(points), at: middleOf(points) }];
  });
}

// Which region a place belongs to, and so which places move together when one of them is dragged.
// The first that holds it: a place in two regions is drawn inside both and carried by whichever
// declared it first, because a place cannot be in two places at once however it is drawn.
export const regionHolding = (regions: readonly { holds: readonly Answer[] }[], place: Answer): { holds: readonly Answer[] } | undefined =>
  regions.find((region) => region.holds.includes(place));

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

  return { plane, planes: planesFrom(places, standing), here, grid: status.mapGrid, nodes, roads, ways, regions: regionsOn(status.regions, nodes) };
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
