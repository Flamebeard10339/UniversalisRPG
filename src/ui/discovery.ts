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
//
// One nudge per floor and not one per direction: looking at the landing puts
// the guide house one floor down and the cellar two, and a nudge that read only
// which way drew the second under the first.
export const CLIMB_NUDGE = 0.42;

export function drawnAt(place: Place, plane: number): Point {
  const climb = place.z - plane;
  return { x: place.x + climb * CLIMB_NUDGE, y: place.y - climb * CLIMB_NUDGE };
}

// What is drawn on one z-plane: everything standing on it, plus anywhere off it
// the player could step to from where they are, plus anywhere the view is
// offering a way out to. A staircase is a place on another floor, and a floor
// plan that hid it would hide the way out of the room the player is in; a
// destination the player can set off for now is one the map has to be able to
// show, or the offer sits nowhere a finger can reach it.
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

export interface Drawn {
  // The plane being looked at: the one asked for, or the one the player is
  // standing on until they ask for another.
  plane: number;
  here: string;
  sheet: Sheet;
  travels: ReadonlyMap<string, number>;
}

// The whole of what the map draws for one view. Composed here rather than in
// the component, because the two halves have to agree — a place is drawn on the
// strength of the offer that leads to it — and a composition inside a render is
// one no test in this suite can reach.
export function drawnFor(view: PlayView | null, asked: number | null): Drawn {
  const discovered = view?.discovered ?? [];
  const here = view?.location.id ?? '';
  const plane = asked ?? discovered.find((place) => place.id === here)?.z ?? 0;
  const travels = waysOut(view?.choices ?? []);

  return { plane, here, sheet: sheetAt(discovered, here, plane, travels), travels };
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

// The floor every control is held to, in CSS pixels. The stylesheet applies it
// to controls that stand still; a place on the map does not, because the sheet
// it is drawn on is scaled, and a target scaled to ZOOM_MIN is a target a thumb
// misses. So the map asks how big to draw its tap area for the scale it is at,
// and the answer grows as the sheet shrinks. Zoomed in, the bubble is already
// past the floor and the area stays where the bubble is.
export const TOUCH_FLOOR = 44;

export const tapTarget = (scale: number): number => TOUCH_FLOOR / Math.min(1, scale);

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

// Panned until the furthest place reaches the middle of the window, and no
// further. Half a screen of nothing is a map being read at its edge; a whole
// one is a map the player has lost. Measured against the sheet alone and not
// against the window, because a map that is mostly gap between places is
// narrower than the window long after the player has zoomed all the way in, and
// asking it to cover the window is what left it barely able to move.
export function clampPan(offset: number, reach: number): number {
  const slack = reach / 2;
  return Math.min(slack, Math.max(-slack, offset));
}

// One authored unit of the world, in CSS pixels, before any zoom. The tutorial
// island's places sit a unit apart, so this is what turns "east of the guide
// house" into a gap a thumb can aim between.
export const PER_UNIT = 104;

export interface Size {
  width: number;
  height: number;
}

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

// The room the sheet takes up, in unscaled pixels. A box spans the points
// places stand on, and a place is drawn as a bubble around its point, so one
// whole bubble is half a bubble at each end — which is the half that was still
// on screen when a pan measured from the points alone stopped.
export function drawnBox(box: Box, bubble: Size): Frame {
  return {
    left: box.minX * PER_UNIT - bubble.width / 2,
    top: box.minY * PER_UNIT - bubble.height / 2,
    width: (box.maxX - box.minX) * PER_UNIT + bubble.width,
    height: (box.maxY - box.minY) * PER_UNIT + bubble.height,
  };
}

// Where the map comes to rest after a gesture: the zoom it asked for, and the
// pan held to the slack that zoom leaves. One zoom goes in and both come out,
// because clamping a new pan against the room the old zoom took is how a
// zoomed-in map ends up unable to reach its own edges.
export function settled(pan: Point, zoom: number, box: Box, bubble: Size): { pan: Point; scale: number } {
  const drawn = drawnBox(box, bubble);
  return { scale: zoom, pan: { x: clampPan(pan.x, drawn.width * zoom), y: clampPan(pan.y, drawn.height * zoom) } };
}

// The line a walk takes, from where the player is standing to where they are
// going. The engine publishes the legs still to cross and not the place they
// are leaving, so the player's own place is put at the head of it — which is
// what makes a road on the route a pair of neighbours in one list, and what
// keeps the map from working the route out for itself.
export function walkLine(here: string, journey: PlayView['journey']): string[] {
  if (!journey || journey.legs.length === 0) return [];
  return [here, ...journey.legs];
}

// Whether the road between two places is one the walk will take. Either way
// round, because a road is drawn once for the pair and neither end is its own.
export function onWalk(line: readonly string[], from: string, to: string): boolean {
  const at = line.indexOf(from);
  return at >= 0 && (line[at + 1] === to || line[at - 1] === to);
}

// Which places arrived between one view and the next. The map's own reading of
// the same event the engine already published, so nothing has to be remembered
// beyond the last list.
export function newlyFound(before: readonly Place[], after: readonly Place[]): string[] {
  const known = new Set(before.map((place) => place.id));
  return after.map((place) => place.id).filter((id) => !known.has(id));
}
