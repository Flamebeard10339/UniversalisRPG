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
  const slack = reach / 2;
  return Math.min(slack, Math.max(-slack, offset));
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
  return { scale: zoom, pan: { x: clampPan(pan.x, drawn.width * zoom), y: clampPan(pan.y, drawn.height * zoom) } };
}

export function panOnto(target: Point, box: Box, zoom: number): Point {
  const centre = centreOf(box);
  return { x: (centre.x - target.x) * zoom, y: (centre.y - target.y) * zoom };
}
