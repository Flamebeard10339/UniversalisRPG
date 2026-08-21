export const AXIS_SLOP_PX = 8;

export const SETTLE_RATIO = 0.25;
export const FLICK_PX_PER_MS = 0.6;
export const FLICK_MIN_PX = 24;

export const EDGE_RESISTANCE = 0.35;


export type Axis = 'x' | 'y';

export function dragAxis(dx: number, dy: number): Axis | null {
  if (Math.abs(dx) < AXIS_SLOP_PX && Math.abs(dy) < AXIS_SLOP_PX) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

export function pagerOffset(dx: number, index: number, count: number): number {
  const heldAtStart = index === 0 && dx > 0;
  const heldAtEnd = index === count - 1 && dx < 0;
  return heldAtStart || heldAtEnd ? dx * EDGE_RESISTANCE : dx;
}

export function settleStep(dx: number, width: number, velocity: number): -1 | 0 | 1 {
  if (Math.abs(dx) < AXIS_SLOP_PX) return 0;
  const flicked = Math.abs(velocity) >= FLICK_PX_PER_MS && Math.abs(dx) >= FLICK_MIN_PX && Math.sign(velocity) === Math.sign(dx);
  if (!flicked && Math.abs(dx) < width * SETTLE_RATIO) return 0;
  return dx < 0 ? 1 : -1;
}

export function clampIndex(index: number, count: number): number {
  return Math.min(count - 1, Math.max(0, index));
}

export interface Release {
  dx: number;
  width: number;
  velocity: number;
  taken: boolean;
}

export function landingIndex(release: Release, index: number, count: number): number {
  const step = release.taken ? 0 : settleStep(release.dx, release.width, release.velocity);
  return clampIndex(index + step, count);
}

export const wasDragged = (dx: number): boolean => Math.abs(dx) >= AXIS_SLOP_PX;

export const SPLIT_DEFAULT = 0.5;
export const SPLIT_MIN = 0.15;
export const SPLIT_MAX = 0.85;

export function splitFrom(start: number, dy: number, height: number): number {
  if (height <= 0) return start;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, start + dy / height));
}

export const VELOCITY_WINDOW_MS = 40;
export const STILL_MS = 120;

export interface Motion {
  x: number;
  at: number;
  velocity: number;
}

export const motionFrom = (x: number, at: number): Motion => ({ x, at, velocity: 0 });

export function sampleVelocity(motion: Motion, x: number, at: number): Motion {
  const span = at - motion.at;
  if (span < VELOCITY_WINDOW_MS) return motion;
  return { x, at, velocity: (x - motion.x) / span };
}

export function releaseVelocity(motion: Motion, at: number): number {
  return at - motion.at > STILL_MS ? 0 : motion.velocity;
}

export const STILL = 'input, textarea, select, [data-still]';

export function heldStill(target: EventTarget | null): boolean {
  const node = target as { closest?: (selector: string) => unknown } | null;
  return typeof node?.closest === 'function' && node.closest(STILL) !== null;
}
