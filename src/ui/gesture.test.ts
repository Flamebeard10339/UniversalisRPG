import { describe, expect, it } from 'vitest';
import {
  AXIS_SLOP_PX,
  clampIndex,
  columnsIn,
  COLUMNS_MAX,
  dragAxis,
  EDGE_RESISTANCE,
  heldStill,
  FLICK_MIN_PX,
  FLICK_PX_PER_MS,
  landingIndex,
  motionFrom,
  pagerOffset,
  pagesIn,
  releaseVelocity,
  sampleVelocity,
  settleStep,
  SPLIT_MAX,
  SPLIT_MIN,
  splitFrom,
  STILL,
  STILL_MS,
  VELOCITY_WINDOW_MS,
  wasDragged,
} from './gesture';

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
    expect(clampIndex(-1, 5)).toBe(0);
    expect(clampIndex(5, 5)).toBe(4);
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
    for (let at = 1; at <= 240; at++) motion = sampleVelocity(motion, at * 0.5, at);

    expect(motion.velocity).toBeCloseTo(0.5, 2);
  });

  it('throws nothing when the finger stopped before it let go', () => {
    const moving = { x: 200, at: 1000, velocity: -1.4 };

    expect(releaseVelocity(moving, 1000 + STILL_MS)).toBe(-1.4);
    expect(releaseVelocity(moving, 1000 + STILL_MS + 1)).toBe(0);
  });
});

describe('what a release lands on', () => {
  const release = { dx: -WIDTH * 0.4, width: WIDTH, velocity: 0, taken: false };

  it('moves a pane for a release the player made', () => {
    expect(landingIndex(release, 2, 5)).toBe(3);
    expect(landingIndex({ ...release, dx: WIDTH * 0.4 }, 2, 5)).toBe(1);
  });

  it('goes back where it started when the browser took the gesture', () => {
    expect(landingIndex({ ...release, taken: true }, 2, 5)).toBe(2);
  });

  it('stops at the ends', () => {
    expect(landingIndex(release, 4, 5)).toBe(4);
    expect(landingIndex({ ...release, dx: WIDTH * 0.4 }, 0, 5)).toBe(0);
  });

  it('calls a drag long enough to have been one, and a twitch not', () => {
    expect(wasDragged(AXIS_SLOP_PX)).toBe(true);
    expect(wasDragged(-AXIS_SLOP_PX)).toBe(true);
    expect(wasDragged(AXIS_SLOP_PX - 1)).toBe(false);
  });
});

describe('where the player put the split', () => {
  it('moves with the drag, as a fraction of the surface it divides', () => {
    expect(splitFrom(0.5, 100, 400)).toBe(0.75);
    expect(splitFrom(0.5, -100, 400)).toBe(0.25);
  });

  it('leaves both sides something to hold', () => {
    expect(splitFrom(0.5, 1000, 400)).toBe(SPLIT_MAX);
    expect(splitFrom(0.5, -1000, 400)).toBe(SPLIT_MIN);
  });

  it('stays where it was when there is no surface to measure against', () => {
    expect(splitFrom(0.4, 100, 0)).toBe(0.4);
  });
});

describe('an element that keeps a drag to itself', () => {
  const asked: string[] = [];
  const node = (found: boolean): EventTarget =>
    ({
      closest: (selector: string) => {
        asked.push(selector);
        return found ? {} : null;
      },
    }) as unknown as EventTarget;

  it('asks what the drag began over and everything it stands in', () => {
    expect(heldStill(node(true))).toBe(true);
    expect(heldStill(node(false))).toBe(false);
    expect(asked).toEqual([STILL, STILL]);
  });

  it('is nothing at all when the drag began outside the document', () => {
    expect(heldStill(null)).toBe(false);
    expect(heldStill({} as EventTarget)).toBe(false);
  });

  it('holds every control text is typed into without any of them having to say so', () => {
    const named = STILL.split(', ');

    expect(named).toContain('input');
    expect(named).toContain('textarea');
    expect(named).toContain('select');
    expect(named).toContain('[data-still]');
  });
});

describe('two pages standing side by side', () => {
  it('draws one column on a screen taller than it is wide and two on a wider one', () => {
    expect(columnsIn(false, 4)).toBe(1);
    expect(columnsIn(true, 4)).toBe(COLUMNS_MAX);
  });

  it('never draws more columns than the layer has pages to fill them', () => {
    expect(columnsIn(true, 1)).toBe(1);
    expect(columnsIn(true, 0)).toBe(1);
  });

  it('loses a resting place for every extra column, and keeps at least one', () => {
    expect(pagesIn(4, 1)).toBe(4);
    expect(pagesIn(4, 2)).toBe(3);
    expect(pagesIn(2, 2)).toBe(1);
    expect(pagesIn(1, 2)).toBe(1);
  });
});
