import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { qualify } from '../content/namespace';
import { stage, type Staged } from './authoringSurface';
import { placedAt, spotOf, type Node, type Sheet } from './discovery';
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
// one too without this one saying so.
export const joinedInto = (sheet: Sheet, from: string, to: string): string =>
  joinLine(from, to, !(sheet.nodes.find((node) => String(node.place.id) === from)?.place.adjacent ?? []).some((edge) => String(edge.to) === to));

export const MAP_MODES = ['go', 'place', 'link'] as const;

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
  return stage([`# location ${id}`, where].join('\n'));
}
