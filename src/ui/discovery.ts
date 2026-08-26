import type { PlayView } from '../runtime/session';
import { waysOut } from '../runtime/waysOut';
import { bounds, type Box, type Point } from './viewport';

export type Place = PlayView['discovered'][number];

export interface Node {
  place: Place;
  here: boolean;
  climb: number;
  at: Point;
}

export interface Road {
  from: Node;
  to: Node;
  open: boolean;
  // Connectivity is directional, so a road that is only walked one way is a different road from one walked both, and is drawn as one.
  mutual: boolean;
}

export interface Sheet {
  nodes: Node[];
  roads: Road[];
  planes: number[];
}

export const CLIMB_NUDGE = 0.42;

export function drawnAt(place: Place, plane: number): Point {
  const climb = place.z - plane;
  return { x: place.x + climb * CLIMB_NUDGE, y: place.y - climb * CLIMB_NUDGE };
}

export const placedAt = (at: Point, climb: number): Point => ({ x: at.x - climb * CLIMB_NUDGE, y: at.y + climb * CLIMB_NUDGE });

export function sheetAt(discovered: readonly Place[], here: string, plane: number, offered: ReadonlyMap<string, number> = new Map()): Sheet {
  const standing = discovered.find((place) => place.id === here);
  const reachable = new Set(standing?.adjacent.map((edge) => edge.to) ?? []);
  const shown = discovered.filter((place) => place.z === plane || place.id === here || reachable.has(place.id) || offered.has(place.id));
  const nodes = shown.map((place) => ({ place, here: place.id === here, climb: place.z - plane, at: drawnAt(place, plane) }));
  const byId = new Map(nodes.map((node) => [node.place.id, node]));

  const roads: Road[] = [];
  for (const node of nodes) {
    for (const edge of node.place.adjacent) {
      const other = byId.get(edge.to);
      if (!other) continue;
      const mutual = other.place.adjacent.some((back) => back.to === node.place.id);
      if (mutual && node.place.id > edge.to) continue;
      roads.push({ from: node, to: other, open: edge.open, mutual });
    }
  }

  return { nodes, roads, planes: [...new Set(discovered.map((place) => place.z))].sort((low, high) => low - high) };
}

export interface Drawn {
  plane: number;
  here: string;
  sheet: Sheet;
  travels: ReadonlyMap<string, number>;
}

export function drawnFor(view: PlayView, asked: number | null): Drawn {
  const discovered = view.discovered;
  const here = view.location.id;
  const plane = asked ?? discovered.find((place) => place.id === here)?.z ?? 0;
  const travels = new Map(waysOut(view.choices).map((way) => [way.to, way.at]));

  return { plane, here, sheet: sheetAt(discovered, here, plane, travels), travels };
}

export const PER_UNIT = 104;

export const spotOf = (node: Node): Point => ({ x: node.at.x * PER_UNIT, y: node.at.y * PER_UNIT });

export const mapBox = (nodes: readonly Node[]): Box => bounds(nodes.map(spotOf));

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
  const at = line.indexOf(node.place.id);
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

export function newlyFound(before: readonly Place[], after: readonly Place[]): string[] {
  const known = new Set(before.map((place) => place.id));
  return after.map((place) => place.id).filter((id) => !known.has(id));
}
