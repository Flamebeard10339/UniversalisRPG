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

export const centreOf = (box: Box): Point => ({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 3;

export const clampZoom = (scale: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));

export const TOUCH_FLOOR = 44;

export const tapTarget = (scale: number): number => TOUCH_FLOOR / Math.min(1, scale);

export const WHEEL_RATE = 0.0015;

export const zoomByWheel = (scale: number, deltaY: number): number => clampZoom(scale * Math.exp(-deltaY * WHEEL_RATE));

export function panAfterZoom(pan: number, focal: number, from: number, to: number): number {
  if (from === 0) return pan;
  return focal - (focal - pan) * (to / from);
}

export const spanBetween = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function clampPan(offset: number, reach: number): number {
  return Math.min(reach, Math.max(-reach, offset));
}

export function drawnBox(box: Box, bubble: Size): Frame {
  return {
    left: box.minX - bubble.width / 2,
    top: box.minY - bubble.height / 2,
    width: box.maxX - box.minX + bubble.width,
    height: box.maxY - box.minY + bubble.height,
  };
}

// `pan` says where the sheet's own origin is drawn, measured from the middle of the frame. The
// origin and not the middle of whatever happens to be drawn: a frame of reference read off the
// things on the sheet moves when any one of them moves, which is how dragging one place slid every
// other place across the map.
export function settled(pan: Point, zoom: number, box: Box, bubble: Size): { pan: Point; scale: number } {
  const drawn = drawnBox(box, bubble);
  const middle = centreOf(box);
  // How far the drawing may be pushed from the frame before it counts as lost: a whole width of
  // itself. Generous on purpose — the limit is here to stop a map being shoved off the edge and
  // never to nudge one while an author is working near it.
  return {
    scale: zoom,
    pan: {
      x: clampPan(pan.x + middle.x * zoom, drawn.width * zoom) - middle.x * zoom,
      y: clampPan(pan.y + middle.y * zoom, drawn.height * zoom) - middle.y * zoom,
    },
  };
}

export const panOnto = (target: Point, zoom: number): Point => ({ x: 0 - target.x * zoom, y: 0 - target.y * zoom });

// How much air is left between a place and the road out of it.
export const EDGE_GAP = 5;

// Where a line drawn from the middle of one box towards another leaves that box. A road runs from
// where one place stops to where the next one starts, so what is drawn is the road rather than the
// part of it lying under a name — and a road too short to leave its own box is not drawn at all.
export function leaving(from: Point, to: Point, box: Size): Point {
  const run = Math.hypot(to.x - from.x, to.y - from.y);
  if (run === 0) return from;
  const along = { x: (to.x - from.x) / run, y: (to.y - from.y) / run };
  const sides = [along.x === 0 ? Infinity : (box.width / 2 + EDGE_GAP) / Math.abs(along.x), along.y === 0 ? Infinity : (box.height / 2 + EDGE_GAP) / Math.abs(along.y)];
  const reach = Math.min(run, ...sides);
  return { x: from.x + along.x * reach, y: from.y + along.y * reach };
}

// The point of the sheet the middle of the frame is looking at.
export const lookingAt = (pan: Point, zoom: number): Point => ({ x: 0 - pan.x / zoom, y: 0 - pan.y / zoom });
