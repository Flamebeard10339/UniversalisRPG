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

export function settled(pan: Point, zoom: number, box: Box, bubble: Size): { pan: Point; scale: number } {
  const drawn = drawnBox(box, bubble);
  const middle = centreOf(box);
  return {
    scale: zoom,
    pan: {
      x: clampPan(pan.x + middle.x * zoom, drawn.width * zoom) - middle.x * zoom,
      y: clampPan(pan.y + middle.y * zoom, drawn.height * zoom) - middle.y * zoom,
    },
  };
}

export const panOnto = (target: Point, zoom: number): Point => ({ x: 0 - target.x * zoom, y: 0 - target.y * zoom });

export const EDGE_GAP = 5;

export function heading(from: Point, to: Point): Point {
  const run = Math.hypot(to.x - from.x, to.y - from.y);
  return run === 0 ? { x: 0, y: 0 } : { x: (to.x - from.x) / run, y: (to.y - from.y) / run };
}

export function leaving(from: Point, to: Point, box: Size): Point {
  const along = heading(from, to);
  if (along.x === 0 && along.y === 0) return from;
  const run = Math.hypot(to.x - from.x, to.y - from.y);
  const sides = [along.x === 0 ? Infinity : (box.width / 2 + EDGE_GAP) / Math.abs(along.x), along.y === 0 ? Infinity : (box.height / 2 + EDGE_GAP) / Math.abs(along.y)];
  const reach = Math.min(run / 2, ...sides);
  return { x: from.x + along.x * reach, y: from.y + along.y * reach };
}

export const lookingAt = (pan: Point, zoom: number): Point => ({ x: 0 - pan.x / zoom, y: 0 - pan.y / zoom });
