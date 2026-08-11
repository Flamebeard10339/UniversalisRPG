import type { PlayView } from '../runtime/session';

export type Place = PlayView['discovered'][number];

export interface Point {
  x: number;
  y: number;
}

export interface Node {
  place: Place;
  here: boolean;
  // How many planes up or down from the one being looked at; 0 for on it.
  climb: number;
  // Where it is drawn, which is where it is unless it is off the plane.
  at: Point;
}

export interface Road {
  from: Node;
  to: Node;
  open: boolean;
}

export interface Sheet {
  nodes: Node[];
  roads: Road[];
  planes: number[];
}

// A place on another floor sits at the same x and y as the stairs down to it —
// the tutorial's cellar and landing are both (0, 0) under the guide house — so
// drawing it where it is would put it exactly under the room the player is
// standing in. Nudged along the diagonal instead, up for a floor above and down
// for one below, which is the direction a player already reads as height.
export const CLIMB_NUDGE = 0.42;

export function drawnAt(place: Place, plane: number): Point {
  const climb = place.z - plane;
  if (climb === 0) return { x: place.x, y: place.y };
  return { x: place.x + Math.sign(climb) * CLIMB_NUDGE, y: place.y - Math.sign(climb) * CLIMB_NUDGE };
}

// What is drawn on one z-plane: everything standing on it, plus anywhere off it
// the player could step to from where they are. A staircase is a place on
// another floor, and a floor plan that hid it would hide the way out of the
// room the player is in.
export function sheetAt(discovered: readonly Place[], here: string, plane: number): Sheet {
  const standing = discovered.find((place) => place.id === here);
  const reachable = new Set(standing?.adjacent.map((edge) => edge.to) ?? []);
  const shown = discovered.filter((place) => place.z === plane || place.id === here || reachable.has(place.id));
  const nodes = shown.map((place) => ({ place, here: place.id === here, climb: place.z - plane, at: drawnAt(place, plane) }));
  const byId = new Map(nodes.map((node) => [node.place.id, node]));

  const roads: Road[] = [];
  for (const node of nodes) {
    for (const edge of node.place.adjacent) {
      const other = byId.get(edge.to);
      if (!other) continue;
      // One road, not two: a pair of places that each name the other would draw
      // the same line twice. A one-way road is still one line.
      const mutual = other.place.adjacent.some((back) => back.to === node.place.id);
      if (mutual && node.place.id > edge.to) continue;
      roads.push({ from: node, to: other, open: edge.open });
    }
  }

  return { nodes, roads, planes: [...new Set(discovered.map((place) => place.z))].sort((low, high) => low - high) };
}

// Which of the offers on the table is the way to each place, by the position a
// driver dispatches it at. Read off leadsTo and not off the choice's kind: a
// staircase aliases a road and publishes an action, so a map that matched on
// `travel:` would leave every floor of a building untappable. Two ways to one
// place keep the first, which is the order the engine offered them in.
export function waysOut(choices: readonly PlayView['choices'][number][]): Map<string, number> {
  const ways = new Map<string, number>();
  choices.forEach((choice, index) => {
    if (choice.leadsTo === undefined || ways.has(choice.leadsTo)) return;
    ways.set(choice.leadsTo, index + 1);
  });
  return ways;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// The room everything drawn takes up. Nothing drawn is a point rather than an
// absence, so a caller always has a centre and never divides by a zero span.
export function bounds(nodes: readonly Node[]): Box {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = nodes.map((node) => node.at.x);
  const ys = nodes.map((node) => node.at.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// How far in and out the map can be taken. Far enough out that a walked-over
// island fits, far enough in that a place is a comfortable target, and no
// further either way: a map zoomed to nothing is a map the player has lost.
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 3;

export const clampZoom = (scale: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));

// A wheel notch is a fraction of the zoom rather than a fixed step, so zooming
// out and back in again lands where it started.
export const WHEEL_RATE = 0.0015;

export const zoomByWheel = (scale: number, deltaY: number): number => clampZoom(scale * Math.exp(-deltaY * WHEEL_RATE));

// Where the map has to sit for the point under the pointer -- or between the
// fingers -- to still be under it once the zoom has changed. Everything is
// measured from the middle of the window, which is what the pan is an offset
// from.
export function panAfterZoom(pan: number, focal: number, from: number, to: number): number {
  if (from === 0) return pan;
  return focal - (focal - pan) * (to / from);
}

export const spanBetween = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Panned as far as there is something to pan to and no further, so the player
// cannot drag the world off the screen and be left looking at nothing. Anything
// that already fits has no slack at all and stays where it is.
export function clampPan(offset: number, span: number, window: number): number {
  const slack = Math.max(0, (span - window) / 2);
  if (slack === 0) return 0;
  return Math.min(slack, Math.max(-slack, offset));
}

// One authored unit of the world, in CSS pixels, before any zoom. The tutorial
// island's places sit a unit apart, so this is what turns "east of the guide
// house" into a gap a thumb can aim between. The margin is the room left around
// the outermost place so it is not flush against the edge.
export const PER_UNIT = 104;
export const MARGIN = 64;

export interface Size {
  width: number;
  height: number;
}

// Where the map comes to rest after a gesture: the zoom it asked for, and the
// pan held to the slack that zoom leaves. One zoom goes in and both come out,
// because clamping a new pan against the room the old zoom took is how a
// zoomed-in map ends up unable to reach its own edges.
export function settled(pan: Point, zoom: number, box: Box, window: Size): { pan: Point; scale: number } {
  const room = {
    width: (box.maxX - box.minX) * PER_UNIT * zoom + MARGIN * 2,
    height: (box.maxY - box.minY) * PER_UNIT * zoom + MARGIN * 2,
  };
  return { scale: zoom, pan: { x: clampPan(pan.x, room.width, window.width), y: clampPan(pan.y, room.height, window.height) } };
}

// Which places arrived between one view and the next. The map's own reading of
// the same event the engine already published, so nothing has to be remembered
// beyond the last list.
export function newlyFound(before: readonly Place[], after: readonly Place[]): string[] {
  const known = new Set(before.map((place) => place.id));
  return after.map((place) => place.id).filter((id) => !known.has(id));
}
