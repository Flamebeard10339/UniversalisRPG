import { qualify } from '../content/namespace';
import { homelessId, moduleNamed } from '../content/resolve';
import { relativeValue, stepToward, type Direction } from '../content/sections/location';
import { MAPPED_KIND, type Staged } from './authoringSurface';
import { placedAt, spotOf, type Node, type Place, type Sheet } from './discovery';
import { lookingAt, type Point } from './viewport';

export const settledOn = (at: Point): Point => ({ x: Math.round(at.x), y: Math.round(at.y) });

export const answering = (staged: Staged, act: { send(line: string): void; note(text: string): void }): void =>
  void ('refused' in staged ? act.note(staged.refused) : act.send(staged.line));

export const droppedAt = (node: Node, carried: Point, grid: number): Point =>
  settledOn(placedAt({ x: (spotOf(node, grid).x + carried.x) / grid, y: (spotOf(node, grid).y + carried.y) / grid }, node.climb));

export const placeLine = (id: string, at: Point, plane?: number): string => `/place ${id} ${at.x} ${at.y}${plane === undefined ? '' : ` ${plane}`}`;

export const joinLine = (from: string, to: string, road: boolean): string => `${road ? '/link' : '/unlink'} ${from} ${to}`;

export const joinedInto = (sheet: Sheet, from: string, to: string): string =>
  joinLine(from, to, !sheet.roads.some((road) => [String(road.from), String(road.to)].sort().join('>') === [from, to].sort().join('>')));

const REGION_GRIP = 'region:';

export const gripOnRegion = (id: string): string => `${REGION_GRIP}${id}`;

export const regionGripped = (held: string): string | null => (held.startsWith(REGION_GRIP) ? held.slice(REGION_GRIP.length) : null);

export const shiftLine = (id: string, by: Point): string => `/region ${id} by ${by.x} ${by.y}`;

export const shiftedBy = (carried: Point, grid: number): Point => settledOn({ x: carried.x / grid, y: carried.y / grid });

export const gatherLine = (region: string, place: string, holding: boolean): string => `/region ${region} ${holding ? '+' : '-'}${place}`;

export const pinLine = (id: string, direction: Direction, of: string): string => `/place ${id} ${relativeValue.print({ direction, of })}`;

export function pinnedInto(places: readonly Place[], id: string, of: string): Staged {
  const one = places.find((place) => String(place.id) === id);
  const anchor = places.find((place) => String(place.id) === of);
  if (one === undefined || anchor === undefined) return { refused: `both places have to be on the map to write one off the other` };
  const direction = stepToward(anchor, one);
  if (direction === null) return { refused: `${id} and ${of} stand in the same square, so there is no step from one to the other to write down` };
  return { line: pinLine(id, direction, of) };
}

export const MAP_MODES = ['go', 'place', 'link', 'region', 'pin'] as const;

export type MapMode = (typeof MAP_MODES)[number];

export const modeNamed = (value: unknown): MapMode | undefined => MAP_MODES.find((mode) => mode === value);

export function centredOn(hold: { pan: Point; zoom: number }, grid: number): Point {
  const middle = lookingAt(hold.pan, hold.zoom);
  return { x: middle.x / grid, y: middle.y / grid };
}

export const addressFor = (id: string, here: string): string => (moduleNamed(id) === null ? qualify(moduleNamed(here), id) : id);

export function created(address: string, at: Point, plane: number): Staged {
  const homeless = homelessId(MAPPED_KIND, address);
  return homeless === null ? { line: placeLine(address, settledOn(at), plane) } : { refused: homeless };
}
