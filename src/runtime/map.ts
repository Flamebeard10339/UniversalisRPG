import { DIRECTION_VECTORS, type Direction } from '../content/sections/location';
import type { Answer } from './localized';
import type { Place, PlayChoice, Region } from './session';
import { regionShape, type RegionShape } from './settings';
import { waysOut, type WayOut } from './waysOut';

export type { Place, Region } from './session';

export interface Standing {
  discovered: readonly Place[];
  undiscovered: readonly Place[];
  regions: readonly Region[];
  location: { id: Answer };
  choices: readonly PlayChoice[];
  mapGrid: number;
  settings?: readonly { name: Answer; standing: Answer }[];
}

export type Bearing = Direction | `${Extract<Direction, 'north' | 'south'>}-${Extract<Direction, 'east' | 'west'>}`;

const CARDINALS: readonly Direction[] = ['north', 'east', 'south', 'west'];

const flat = (direction: Direction): [number, number] => [DIRECTION_VECTORS[direction][0], DIRECTION_VECTORS[direction][1]];

const lateral = (direction: Direction): boolean => direction === 'east' || direction === 'west';

const between = (one: Direction, next: Direction): Bearing => (lateral(one) ? `${next}-${one}` : `${one}-${next}`) as Bearing;

const HEADINGS: readonly { bearing: Bearing; angle: number }[] = CARDINALS.flatMap((one, at) => {
  const next = CARDINALS[(at + 1) % CARDINALS.length]!;
  const [ax, ay] = flat(one);
  const [bx, by] = flat(next);
  return [
    { bearing: one as Bearing, angle: Math.atan2(ay, ax) },
    { bearing: between(one, next), angle: Math.atan2(ay + by, ax + bx) },
  ];
});

const apart = (one: number, other: number): number => Math.abs(Math.atan2(Math.sin(one - other), Math.cos(one - other)));

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
  climb: number;
  at: { x: number; y: number };
  goes: number | null;
  bearing: Bearing | null;
  found: boolean;
}

export interface Road {
  from: Answer;
  to: Answer;
  open: boolean;
  mutual: boolean;
}

export interface Way extends WayOut {
  bearing: Bearing | null;
}

export interface Sheet {
  plane: number;
  planes: number[];
  here: Answer;
  grid: number;
  nodes: Node[];
  roads: Road[];
  ways: Way[];
  regions: Drawn[];
}

export const CLIMB_NUDGE = 0.42;

export function drawnAt(place: { x: number; y: number; z: number }, plane: number): { x: number; y: number } {
  const climb = place.z - plane;
  return { x: place.x + climb * CLIMB_NUDGE, y: place.y - climb * CLIMB_NUDGE };
}

export const placedAt = (at: { x: number; y: number }, climb: number): { x: number; y: number } => ({ x: at.x - climb * CLIMB_NUDGE, y: at.y + climb * CLIMB_NUDGE });

function planesFrom(places: readonly Place[], standing: Place | undefined): number[] {
  if (!standing) return [...new Set(places.map((place) => place.z))].sort((low, high) => low - high);
  const floors = new Set([standing.z]);
  for (const edge of standing.adjacent) {
    const far = places.find((place) => place.id === edge.to);
    if (far) floors.add(far.z);
  }
  return [...floors].sort((low, high) => low - high);
}

export const REGION_PAD = 0.5;

interface Spot {
  x: number;
  y: number;
}

const cross = (o: Spot, a: Spot, b: Spot): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

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

const squareRound = (point: Spot, pad: number): Spot[] => [
  { x: point.x - pad, y: point.y - pad },
  { x: point.x + pad, y: point.y - pad },
  { x: point.x + pad, y: point.y + pad },
  { x: point.x - pad, y: point.y + pad },
];

export function hullOf(points: readonly Spot[], pad = REGION_PAD): Spot[] {
  if (points.length === 0) return [];
  return ring(points.flatMap((point) => squareRound(point, pad)));
}

export interface Drawn extends Region {
  drawn: Answer[];
  hull: Spot[];
  at: Spot;
}

const middleOf = (points: readonly Spot[]): Spot =>
  points.length === 0 ? { x: 0, y: 0 } : { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };

function regionsOn(regions: readonly Region[], seen: readonly Place[], everywhere: readonly Place[], plane: number, nodes: readonly Node[], shape: RegionShape): Drawn[] {
  const footing = new Map(everywhere.map((place) => [place.id, drawnAt(place, plane)]));
  const known = new Set(seen.map((place) => place.id));
  const showing = new Set(nodes.map((node) => node.place.id));
  const round = shape === 'box' ? boxRound : hullOf;
  return regions.flatMap((region) => {
    if (!region.holds.some((held) => known.has(held))) return [];
    const footprint = region.holds.flatMap((held) => (footing.has(held) ? [footing.get(held)!] : []));
    if (footprint.length === 0) return [];
    return [{ ...region, drawn: region.holds.filter((held) => showing.has(held)), hull: round(footprint, REGION_PAD), at: middleOf(footprint) }];
  });
}

export const regionHolding = (regions: readonly { holds: readonly Answer[] }[], place: Answer): { holds: readonly Answer[] } | undefined =>
  regions.find((region) => region.holds.includes(place));

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

  const floors = new Set(ghost === null ? [plane] : [plane, ghost]);
  const reachable = new Set(standing?.adjacent.map((edge) => edge.to) ?? []);
  const stepAway = (place: Place): boolean => place.id === here || reachable.has(place.id) || travels.has(place.id);
  const openRegion = new Set(status.regions.filter((region) => region.holds.some((held) => held === here)).map((region) => region.id));
  const shut = (place: Place): boolean => status.regions.some((region) => !openRegion.has(region.id) && region.holds.some((held) => held === place.id));
  const shown =
    showing === 'every' ? places.filter((place) => floors.has(place.z)) : places.filter((place) => stepAway(place) || (floors.has(place.z) && !shut(place)));
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

  return { plane, planes: planesFrom(places, showing === 'every' ? undefined : standing), here, grid: status.mapGrid, nodes, roads: [...roads.values()], ways, regions: regionsOn(status.regions, places, [...status.discovered, ...status.undiscovered], plane, nodes, regionShape(status.settings ?? [])) };
}

const screenRun = (axis: 0 | 1, first: Direction): readonly number[] => [DIRECTION_VECTORS[first][axis], 0, -DIRECTION_VECTORS[first][axis]];

const TOP_TO_BOTTOM = screenRun(1, 'north');

const LEFT_TO_RIGHT = screenRun(0, 'west');

export const COMPASS: readonly (Bearing | null)[] = TOP_TO_BOTTOM.flatMap((y) => LEFT_TO_RIGHT.map((x) => bearingOf({ x: 0, y: 0, z: 0 }, { x, y, z: 0 })));

export interface Compass {
  cells: (Way | null)[];
  rest: Way[];
}

export function compassOf(ways: readonly Way[]): Compass {
  const cells: (Way | null)[] = COMPASS.map(() => null);
  const rest: Way[] = [];
  for (const way of ways.filter((each) => each.legs <= 1)) {
    const at = way.bearing === null ? -1 : COMPASS.indexOf(way.bearing);
    if (at < 0 || cells[at] !== null) rest.push(way);
    else cells[at] = way;
  }
  return { cells, rest };
}
