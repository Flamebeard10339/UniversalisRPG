import { sheetOf, type Node, type Sheet } from '../runtime/map';
import type { PlayView } from '../runtime/session';
import { bounds, type Box, type Point } from './viewport';

export type { Node, Road, Sheet, Place } from '../runtime/map';
export { CLIMB_NUDGE, drawnAt, placedAt } from '../runtime/map';

export interface Drawn {
  plane: number;
  here: string;
  sheet: Sheet;
}

export const drawnFor = (view: PlayView, asked: number | null): Drawn => {
  const sheet = sheetOf(view, asked);
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

// The same sheet with its regions folded up: a region draws as one thing standing where its rooms
// stand, the roads into it are redrawn to that one thing, and a road that ran between two rooms of it
// is gone, because a road inside something that is now one thing is not a road anybody can see.
//
// The one thing drawn is a room of the region rather than a made-up place — the one a road out of
// here reaches, or the first of them — so tapping the castle walks to the castle gate, and nothing
// downstream has to know that the bubble under the finger was ever a region.
export function folded(sheet: Sheet): Sheet {
  if (sheet.regions.length === 0) return sheet;
  const standing = new Map<string, Node>();
  const inside = new Map<string, string>();
  const nodes: Node[] = [];

  for (const node of sheet.nodes) {
    const region = sheet.regions.find((each) => each.drawn.includes(node.place.id));
    if (region === undefined) {
      nodes.push(node);
      continue;
    }
    inside.set(String(node.place.id), String(region.id));
    const held = standing.get(String(region.id));
    if (held !== undefined && (held.here || held.goes !== null || (!node.here && node.goes === null))) continue;
    standing.set(String(region.id), { ...node, at: region.at, place: { ...node.place, title: region.title } });
  }

  for (const region of sheet.regions) {
    const one = standing.get(String(region.id));
    if (one !== undefined) nodes.push(one);
  }

  const stands = (id: string): string => {
    const region = inside.get(id);
    return region === undefined ? id : String(standing.get(region)?.place.id ?? id);
  };

  const roads = sheet.roads.flatMap((road) => {
    const from = stands(String(road.from));
    const to = stands(String(road.to));
    return from === to ? [] : [{ ...road, from: from as typeof road.from, to: to as typeof road.to }];
  });

  const seen = new Set<string>();
  return {
    ...sheet,
    nodes,
    roads: roads.filter((road) => !seen.has([road.from, road.to].sort().join('>')) && seen.add([road.from, road.to].sort().join('>')) !== undefined),
    regions: [],
  };
}
