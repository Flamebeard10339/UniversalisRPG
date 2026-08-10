import { describe, expect, it } from 'vitest';
import {
  AXIS_SLOP_PX,
  clampIndex,
  dragAxis,
  EDGE_RESISTANCE,
  FLICK_MIN_PX,
  FLICK_PX_PER_MS,
  motionFrom,
  pagerOffset,
  releaseVelocity,
  sampleVelocity,
  settleStep,
  STILL_MS,
  VELOCITY_WINDOW_MS,
} from './gesture';
import { OPENING_TAB, TABS } from './tabs';

const WIDTH = 400;

describe('a drag across the panes', () => {
  it('has no axis until it has gone far enough to have a direction', () => {
    expect(dragAxis(0, 0)).toBeNull();
    expect(dragAxis(AXIS_SLOP_PX - 1, AXIS_SLOP_PX - 1)).toBeNull();
    expect(dragAxis(AXIS_SLOP_PX, 2)).toBe('x');
    expect(dragAxis(2, AXIS_SLOP_PX)).toBe('y');
  });

  it('gives the column back to the scroller once the drag is a downward one', () => {
    expect(dragAxis(30, 90)).toBe('y');
  });

  it('follows the finger through the middle and resists at either end', () => {
    expect(pagerOffset(-120, 2, 5)).toBe(-120);
    expect(pagerOffset(120, 0, 5)).toBe(120 * EDGE_RESISTANCE);
    expect(pagerOffset(-120, 4, 5)).toBe(-120 * EDGE_RESISTANCE);
    expect(pagerOffset(120, 4, 5)).toBe(120);
  });
});

describe('where a release lands', () => {
  it('stays put for a drag that never crossed a quarter of the pane', () => {
    expect(settleStep(WIDTH * 0.2, WIDTH, 0)).toBe(0);
    expect(settleStep(-WIDTH * 0.2, WIDTH, 0)).toBe(0);
  });

  it('lands on the next pane once the drag crossed a quarter of it', () => {
    expect(settleStep(-WIDTH * 0.3, WIDTH, 0)).toBe(1);
    expect(settleStep(WIDTH * 0.3, WIDTH, 0)).toBe(-1);
  });

  it('lands on a short drag that was still moving fast when it was let go', () => {
    expect(settleStep(-FLICK_MIN_PX, WIDTH, -FLICK_PX_PER_MS)).toBe(1);
    expect(settleStep(FLICK_MIN_PX, WIDTH, FLICK_PX_PER_MS)).toBe(-1);
  });

  it('stays put for a drag let go while merely moving, rather than flicked', () => {
    expect(settleStep(-FLICK_MIN_PX, WIDTH, -FLICK_PX_PER_MS + 0.01)).toBe(0);
    expect(settleStep(-FLICK_MIN_PX + 1, WIDTH, -FLICK_PX_PER_MS)).toBe(0);
  });

  it('stays put for a flick pulled back the way it came, and for a twitch', () => {
    expect(settleStep(-30, WIDTH, FLICK_PX_PER_MS)).toBe(0);
    expect(settleStep(-AXIS_SLOP_PX + 1, WIDTH, -FLICK_PX_PER_MS)).toBe(0);
  });

  it('stops at each end rather than wrapping the whole strip on one gesture', () => {
    expect(clampIndex(-1, TABS.length)).toBe(0);
    expect(clampIndex(TABS.length, TABS.length)).toBe(TABS.length - 1);
  });
});

describe('how fast the drag was going', () => {
  it('ignores a sample too close to the last one to measure anything', () => {
    const start = motionFrom(100, 0);

    const twitch = sampleVelocity(start, 103, VELOCITY_WINDOW_MS - 1);

    expect(twitch).toBe(start);
    expect(twitch.velocity).toBe(0);
  });

  it('measures over the window, so a 1000Hz pointer is not a flick for reporting often', () => {
    let motion = motionFrom(0, 0);
    // 120px in 240ms is 0.5px/ms, whatever rate the samples arrive at.
    for (let at = 1; at <= 240; at++) motion = sampleVelocity(motion, at * 0.5, at);

    expect(motion.velocity).toBeCloseTo(0.5, 2);
  });

  it('throws nothing when the finger stopped before it let go', () => {
    const moving = { x: 200, at: 1000, velocity: -1.4 };

    expect(releaseVelocity(moving, 1000 + STILL_MS)).toBe(-1.4);
    expect(releaseVelocity(moving, 1000 + STILL_MS + 1)).toBe(0);
  });
});

describe('the tab order', () => {
  it('opens on Home with two panes either side of it', () => {
    expect(TABS.map((tab) => tab.id)).toEqual(['map', 'character', 'home', 'settings', 'edit']);
    expect(OPENING_TAB).toBe(2);
  });
});
