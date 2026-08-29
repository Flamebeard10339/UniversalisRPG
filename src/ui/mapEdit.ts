import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { qualify } from '../content/namespace';
import { relativeValue, stepToward, type Direction } from '../content/sections/location';
import { stage, type Staged } from './authoringSurface';
import { placedAt, spotOf, type Node, type Place, type Sheet } from './discovery';
import { lookingAt, type Point } from './viewport';

// What a gesture on the map is, said as a line the command line takes. The edit itself — which
// places move, what a patch says, what is refused — belongs to the runtime's own map editing, because
// a map only a screen can edit is a map an agent driving the game cannot. What is here is the
// arithmetic of pixels, which is the one thing the engine has no business knowing.

export const settledOn = (at: Point): Point => ({ x: Math.round(at.x), y: Math.round(at.y) });

export const answering = (staged: Staged, act: { send(line: string): void; note(text: string): void }): void =>
  void ('refused' in staged ? act.note(staged.refused) : act.send(staged.line));

// Where a place lands when a finger lets go of it: the pixels it was carried by, turned back into
// the world's own squares, with the nudge a place off the drawn floor was drawn with taken out.
export const droppedAt = (node: Node, carried: Point, grid: number): Point =>
  settledOn(placedAt({ x: (spotOf(node, grid).x + carried.x) / grid, y: (spotOf(node, grid).y + carried.y) / grid }, node.climb));

export const placeLine = (id: string, at: Point): string => `/place ${id} ${at.x} ${at.y}`;

export const joinLine = (from: string, to: string, road: boolean): string => `${road ? '/link' : '/unlink'} ${from} ${to}`;

// Whether a road already runs to there is asked of the world rather than of any section's text: a
// patch restates none of the roads already written, and a road the far end wrote is walked from this
// one too without this one saying so. Asked of the roads the sheet drew rather than of either end's
// own list, because a view trims a found place's roads to the places the player has found — so from
// the market square there is no edge to a room nobody has been in yet, road or no road.
export const joinedInto = (sheet: Sheet, from: string, to: string): string =>
  joinLine(from, to, !sheet.roads.some((road) => [String(road.from), String(road.to)].sort().join('>') === [from, to].sort().join('>')));

// A region is not a place and is not dragged like one, so a grip says which vocabulary the id it
// holds is written in. Nothing else has to keep the two apart.
const REGION_GRIP = 'region:';

export const gripOnRegion = (id: string): string => `${REGION_GRIP}${id}`;

export const regionGripped = (held: string): string | null => (held.startsWith(REGION_GRIP) ? held.slice(REGION_GRIP.length) : null);

// A region is where its rooms are, so a drag on its shape says how far it went and not where it
// landed — there is no point on the map that is the region's own to land on.
export const shiftLine = (id: string, by: Point): string => `/region ${id} by ${by.x} ${by.y}`;

export const shiftedBy = (carried: Point, grid: number): Point => settledOn({ x: carried.x / grid, y: carried.y / grid });

export const gatherLine = (region: string, place: string, holding: boolean): string => `/region ${region} ${holding ? '+' : '-'}${place}`;

export const pinLine = (id: string, direction: Direction, of: string): string => `/place ${id} ${relativeValue.print({ direction, of })}`;

// Writing one place off another from the map. Which direction it is written in is not asked of the
// author: a place hangs off another as one step in one direction, and which step that is is already
// answered by where the two stand — so tapping the sewer and then the street above it says `down of`,
// and the sewer lands under the street rather than near it.
//
// Asked of every place there is rather than of the sheet, because the two taps need not land on one
// floor: the point of writing a cellar off the room above it is that they are on different floors.
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

const NAMED = /^[a-z][a-z0-9-]*$/;

export const stagedKey = (id: string): string => qualify(LOCAL_CHANGES_MODULE_ID, id);

export function created(id: string, at: Point, plane: number): Staged {
  if (!NAMED.test(id)) return { refused: `a location is named in lower case with dashes, as in north-shore, and not ${JSON.stringify(id)}` };
  const spot = settledOn(at);
  const where = plane === 0 ? `x: ${spot.x}, y: ${spot.y}` : `x: ${spot.x}, y: ${spot.y}, z: ${plane}`;
  return stage([`# location ${stagedKey(id)}`, where].join('\n'));
}
