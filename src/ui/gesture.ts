// A drag is one axis or the other, decided once it has travelled far enough to
// have a direction at all. Below the slop a touch is a tap with a shaky thumb.
export const AXIS_SLOP_PX = 8;

// How far across a pane a drag has to get before releasing lands on the next
// one, and how fast and how far a short drag has to have gone to count anyway.
// All three are what a thumb produces, and none is derivable from anything
// else here. 0.6 px/ms is a flick rather than a slow drag let go while moving.
export const SETTLE_RATIO = 0.25;
export const FLICK_PX_PER_MS = 0.6;
export const FLICK_MIN_PX = 24;

// A drag past the first or last pane still moves, and moves less, because a
// surface that does not answer at all reads as a surface that is broken.
export const EDGE_RESISTANCE = 0.35;

export type Axis = 'x' | 'y';

export function dragAxis(dx: number, dy: number): Axis | null {
  if (Math.abs(dx) < AXIS_SLOP_PX && Math.abs(dy) < AXIS_SLOP_PX) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

// How far the strip actually moves for a drag of dx, which is all of it in the
// middle and a fraction of it at either end.
export function pagerOffset(dx: number, index: number, count: number): number {
  const heldAtStart = index === 0 && dx > 0;
  const heldAtEnd = index === count - 1 && dx < 0;
  return heldAtStart || heldAtEnd ? dx * EDGE_RESISTANCE : dx;
}

// Which pane a release lands on, relative to the one it started from: far
// enough across, or moving fast enough in the direction it was let go.
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
  // The browser took the gesture rather than the player ending it.
  taken: boolean;
}

// The whole of what a release decides, so the component holds none of it. A
// taken gesture lands where it started: only a release the player made picks a
// pane.
export function landingIndex(release: Release, index: number, count: number): number {
  const step = release.taken ? 0 : settleStep(release.dx, release.width, release.velocity);
  return clampIndex(index + step, count);
}

// Far enough to have been a drag, which is what makes the click that follows
// it not a choice being made.
export const wasDragged = (dx: number): boolean => Math.abs(dx) >= AXIS_SLOP_PX;

// Speed is measured over a window rather than between two events, because a
// pointer reporting at 1000Hz gives a 1ms gap over three pixels and that reads
// as a flick. A finger that stopped before letting go threw nothing, however
// fast it was travelling before it stopped.
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
