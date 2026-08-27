import { DIRECTION_VECTORS, type Direction } from '../content/sections/location';
import type { Answer } from './localized';
import type { Place, PlayChoice, Region } from './session';
import { regionShape, type RegionShape } from './settings';
import { waysOut, type WayOut } from './waysOut';

export type { Place, Region } from './session';

// What the map is drawn from, which is a corner of what a view publishes.
export interface Standing {
  discovered: readonly Place[];
  undiscovered: readonly Place[];
  regions: readonly Region[];
  location: { id: Answer };
  choices: readonly PlayChoice[];
  mapGrid: number;
  // The preferences the run is played by, of which the map reads one: which shape a region is drawn
  // as. Optional because a sheet drawn without them is drawn at the standing every setting declares,
  // which is what a caller holding no run has.
  settings?: readonly { name: Answer; standing: Answer }[];
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
  // Whether the player has found this place. Only an author is ever shown one they have not.
  found: boolean;
}

export interface Road {
  from: Answer;
  to: Answer;
  open: boolean;
  // Whether the road is walked both ways, which every road the load path publishes is: it closes each
  // authored edge back before anything sees it. What a one-way road should mean, and how the end that
  // wrote one would reach here, is `docs/map/open-human.md`.
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

// The floors that may be looked at: the one being stood on, and any a road out of here actually
// reaches. A cellar under a castle nobody can get into from the market is not a floor of the market,
// and offering it is offering to look through the floor. An author, who is shown every place there
// is, is offered every floor there is for the same reason — a floor with nothing on it yet is where
// the next room goes.
function planesFrom(places: readonly Place[], standing: Place | undefined): number[] {
  if (!standing) return [...new Set(places.map((place) => place.z))].sort((low, high) => low - high);
  const floors = new Set([standing.z]);
  for (const edge of standing.adjacent) {
    const far = places.find((place) => place.id === edge.to);
    if (far) floors.add(far.z);
  }
  return [...floors].sort((low, high) => low - high);
}

// How far a region's shape reaches past the middle of a place it holds, in the world's own squares.
// Half a square, because a square is what a place occupies — only one place stands at a coordinate —
// so the shape stops exactly where the next place along could begin: every room plainly inside it,
// and the first square that is not the region's plainly outside.
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

// The other shape a region can be drawn as: one rectangle covering every square its places stand in.
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

const squareRound = (point: Spot, pad: number): Spot[] => [
  { x: point.x - pad, y: point.y - pad },
  { x: point.x + pad, y: point.y - pad },
  { x: point.x + pad, y: point.y + pad },
  { x: point.x - pad, y: point.y + pad },
];

// The shape drawn round a group of places: the ring round the squares they stand in, rather than
// round the points they stand at. Pushing a ring of points outwards left every place on the shape's
// own edge and the corner ones half outside it; a ring round the corners of their squares holds all
// of them by construction, and holds one place, two, or a row of them in a line with no case of its
// own — four corners are never in a line.
export function hullOf(points: readonly Spot[], pad = REGION_PAD): Spot[] {
  if (points.length === 0) return [];
  return ring(points.flatMap((point) => squareRound(point, pad)));
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

function regionsOn(regions: readonly Region[], nodes: readonly Node[], shape: RegionShape): Drawn[] {
  const at = new Map(nodes.map((node) => [node.place.id, node.at]));
  const round = shape === 'box' ? boxRound : hullOf;
  return regions.flatMap((region) => {
    const drawn = region.holds.filter((held) => at.has(held));
    if (drawn.length === 0) return [];
    const points = drawn.map((held) => at.get(held)!);
    return [{ ...region, drawn, hull: round(points, REGION_PAD), at: middleOf(points) }];
  });
}

// Which region a place belongs to, and so which places move together when one of them is dragged.
// The first that holds it: a place in two regions is drawn inside both and carried by whichever
// declared it first, because a place cannot be in two places at once however it is drawn.
export const regionHolding = (regions: readonly { holds: readonly Answer[] }[], place: Answer): { holds: readonly Answer[] } | undefined =>
  regions.find((region) => region.holds.includes(place));

// What a map may draw: what the player has found, or — for an author editing one — every place there
// is on the floor they are looking at. A map that draws only what a player has found is no use for
// putting the next place beside the last one.
export type Showing = 'found' | 'every';

export function sheetOf(status: Standing, asked: number | null, showing: Showing = 'found', ghost: number | null = null): Sheet {
  const places = showing === 'every' ? [...status.discovered, ...status.undiscovered] : status.discovered;
  const found = new Set(status.discovered.map((place) => place.id));
  const here = status.location.id;
  const standing = places.find((place) => place.id === here);
  const plane = asked ?? standing?.z ?? 0;

  const ways: Way[] = waysOut(status.choices).map((way) => {
    const far = places.find((place) => place.id === way.to);
    return { ...way, bearing: standing && far ? bearingOf(standing, far) : null };
  });
  const travels = new Map(ways.map((way) => [way.to, way.at]));

  // The floors drawn: the one asked for, and one more being looked at over its shoulder. A player is
  // shown the floors a step from here would put them on as well, because a ladder they can climb is
  // part of the room they are in; an author is shown the floor they asked for and nothing else, so
  // the map they are laying out is the one they are looking at.
  const floors = new Set(ghost === null ? [plane] : [plane, ghost]);
  const reachable = new Set(standing?.adjacent.map((edge) => edge.to) ?? []);
  const stepAway = (place: Place): boolean => showing === 'found' && (place.id === here || reachable.has(place.id) || travels.has(place.id));
  const shown = places.filter((place) => floors.has(place.z) || stepAway(place));
  const nodes: Node[] = shown.map((place) => ({
    place,
    here: place.id === here,
    climb: place.z - plane,
    at: drawnAt(place, plane),
    goes: travels.get(place.id) ?? null,
    bearing: standing ? bearingOf(standing, place) : null,
    found: found.has(place.id),
  }));

  const drawn = new Set(nodes.map((node) => node.place.id));
  // One road per pair of places, drawn from whichever end sorts first, and shut if either end says
  // it is shut. Which ends list which is not asked: a view trims a found place's roads to the places
  // the player has found, so an end's silence about the other says something about discovery and
  // nothing about direction — asking it drew half the author's map as one-way roads nobody wrote.
  const roads = new Map<string, Road>();
  for (const node of nodes) {
    for (const edge of node.place.adjacent) {
      if (!drawn.has(edge.to)) continue;
      const [from, to] = String(node.place.id) < String(edge.to) ? [node.place.id, edge.to] : [edge.to, node.place.id];
      const key = `${from}>${to}`;
      const held = roads.get(key);
      roads.set(key, { from, to, open: held === undefined ? edge.open : held.open && edge.open, mutual: true });
    }
  }

  return { plane, planes: planesFrom(places, showing === 'every' ? undefined : standing), here, grid: status.mapGrid, nodes, roads: [...roads.values()], ways, regions: regionsOn(status.regions, nodes, regionShape(status.settings ?? [])) };
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
