import { sheetOf, type Node, type Sheet, type Showing } from '../runtime/map';
import type { PlayView } from '../runtime/session';
import { bounds, type Box, type Point } from './viewport';

export type { Node, Road, Sheet, Place } from '../runtime/map';
export { CLIMB_NUDGE, drawnAt, placedAt } from '../runtime/map';

export interface Drawn {
  plane: number;
  here: string;
  sheet: Sheet;
}

export const drawnFor = (view: PlayView, asked: number | null, showing: Showing = 'found', ghost: number | null = null): Drawn => {
  const sheet = sheetOf(view, asked, showing, ghost);
  return { plane: sheet.plane, here: sheet.here, sheet };
};

// Where a place is drawn, in the page's own pixels. The one thing the map pane knows that the sheet
// does not: the sheet is a map, and a map is not made of pixels.
export const spotOf = (node: Node, grid: number): Point => ({ x: node.at.x * grid, y: node.at.y * grid });

export const mapBox = (nodes: readonly Node[], grid: number): Box => bounds(nodes.map((node) => spotOf(node, grid)));

export function walkLine(here: string, journey: PlayView['journey']): string[] {
  if (!journey || journey.legs.length === 0) return [];
  return [here, ...journey.legs];
}

// Which part of the journey a place is. A journey of one leg has the stop it is walking to and the
// far end it set out for in the same place and says `target`: the far end is the fact the player
// chose, and the road under their feet already says which way they are going.
export type Walking = 'here' | 'next' | 'ahead' | 'target';

export function walkingAt(line: readonly string[], node: Node): Walking | undefined {
  if (node.here) return 'here';
  const at = line.indexOf(String(node.place.id));
  if (at < 1) return undefined;
  return at === line.length - 1 ? 'target' : at === 1 ? 'next' : 'ahead';
}

export interface Walked {
  // Under the player's feet, or a stretch of the route still to come.
  stretch: 'now' | 'ahead';
  // Whether the road is drawn the way it is walked. A road is drawn from whichever of its two ends
  // sorts first, which has nothing to do with which end the player is at.
  along: boolean;
}

export function onWalk(line: readonly string[], from: string, to: string): Walked | null {
  const at = line.indexOf(from);
  if (at < 0) return null;
  if (line[at + 1] === to) return { stretch: at === 0 ? 'now' : 'ahead', along: true };
  if (at > 0 && line[at - 1] === to) return { stretch: at === 1 ? 'now' : 'ahead', along: false };
  return null;
}

export function newlyFound(before: readonly { id: unknown }[], after: readonly { id: unknown }[]): string[] {
  const known = new Set(before.map((place) => String(place.id)));
  return after.map((place) => String(place.id)).filter((id) => !known.has(id));
}
