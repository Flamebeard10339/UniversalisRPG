// A sheet bigger than the window, held under a finger. Everything here is
// arithmetic in unscaled sheet pixels and knows nothing about what is drawn on
// one, which is what lets the map and an item's plane be two sheets rather than
// two implementations of holding one.

export interface Point {
  x: number;
  y: number;
}

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

// The room everything drawn takes up, in whatever units the caller placed it
// in. Nothing drawn is a point rather than an absence, so a caller always has a
// centre and never divides by a zero span.
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(points: readonly Point[]): Box {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// The middle of the box, which is what a pan is an offset from: the sheet is
// drawn with this point over the middle of the window before any pan.
export const centreOf = (box: Box): Point => ({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });

// How far in and out a sheet can be taken. Far enough out that a walked-over
// island fits, far enough in that a node is a comfortable target, and no
// further either way: a sheet zoomed to nothing is a sheet the player has lost.
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 3;

export const clampZoom = (scale: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));

// The floor every control is held to, in CSS pixels. The stylesheet applies it
// to controls that stand still; a node on a sheet does not, because the sheet
// it is drawn on is scaled, and a target scaled to ZOOM_MIN is a target a thumb
// misses. So a sheet asks how big to draw its tap area for the scale it is at,
// and the answer grows as the sheet shrinks. Zoomed in, the node is already
// past the floor and the area stays where the node is.
export const TOUCH_FLOOR = 44;

export const tapTarget = (scale: number): number => TOUCH_FLOOR / Math.min(1, scale);

// A wheel notch is a fraction of the zoom rather than a fixed step, so zooming
// out and back in again lands where it started.
export const WHEEL_RATE = 0.0015;

export const zoomByWheel = (scale: number, deltaY: number): number => clampZoom(scale * Math.exp(-deltaY * WHEEL_RATE));

// Where the sheet has to sit for the point under the pointer -- or between the
// fingers -- to still be under it once the zoom has changed. Everything is
// measured from the middle of the window, which is what the pan is an offset
// from.
export function panAfterZoom(pan: number, focal: number, from: number, to: number): number {
  if (from === 0) return pan;
  return focal - (focal - pan) * (to / from);
}

export const spanBetween = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Panned until the furthest node reaches the middle of the window, and no
// further. Half a screen of nothing is a sheet being read at its edge; a whole
// one is a sheet the player has lost. Measured against the sheet alone and not
// against the window, because a sheet that is mostly gap between nodes is
// narrower than the window long after the player has zoomed all the way in, and
// asking it to cover the window is what left it barely able to move.
export function clampPan(offset: number, reach: number): number {
  const slack = reach / 2;
  return Math.min(slack, Math.max(-slack, offset));
}

// The room the sheet takes up, in unscaled pixels. A box spans the points nodes
// stand on, and a node is drawn as a bubble around its point, so one whole
// bubble is half a bubble at each end — which is the half that was still on
// screen when a pan measured from the points alone stopped.
export function drawnBox(box: Box, bubble: Size): Frame {
  return {
    left: box.minX - bubble.width / 2,
    top: box.minY - bubble.height / 2,
    width: box.maxX - box.minX + bubble.width,
    height: box.maxY - box.minY + bubble.height,
  };
}

// Where the sheet comes to rest after a gesture: the zoom it asked for, and the
// pan held to the slack that zoom leaves. One zoom goes in and both come out,
// because clamping a new pan against the room the old zoom took is how a
// zoomed-in sheet ends up unable to reach its own edges.
export function settled(pan: Point, zoom: number, box: Box, bubble: Size): { pan: Point; scale: number } {
  const drawn = drawnBox(box, bubble);
  return { scale: zoom, pan: { x: clampPan(pan.x, drawn.width * zoom), y: clampPan(pan.y, drawn.height * zoom) } };
}

// The pan that puts one point of the sheet in the middle of the window. Not
// clamped here: what a pan is allowed to be is `settled`'s, and a caller that
// asked for a point outside the slack is told where it can actually go rather
// than being refused.
export function panOnto(target: Point, box: Box, zoom: number): Point {
  const centre = centreOf(box);
  return { x: (centre.x - target.x) * zoom, y: (centre.y - target.y) * zoom };
}
