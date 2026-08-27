import { describe, expect, it } from 'vitest';
import { bounds, centreOf, clampPan, clampZoom, drawnBox, EDGE_GAP, leaving, lookingAt, midpoint, panAfterZoom, panOnto, settled, spanBetween, tapTarget, TOUCH_FLOOR, ZOOM_MAX, ZOOM_MIN, zoomByWheel } from './viewport';

describe('how far a sheet can be pushed around', () => {
  it('gives back the room everything drawn takes up', () => {
    expect(bounds([{ x: -3, y: 2 }, { x: 10, y: -4 }, { x: 4, y: 4 }])).toEqual({ minX: -3, minY: -4, maxX: 10, maxY: 4 });
  });

  it('is a point when there is nothing drawn, so a caller still has a centre', () => {
    expect(bounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(centreOf(bounds([]))).toEqual({ x: 0, y: 0 });
  });

  it('lets a sheet be pushed a whole drawing away from the middle, and no further', () => {
    expect(clampPan(1900, 1000)).toBe(1000);
    expect(clampPan(-1900, 1000)).toBe(-1000);
    expect(clampPan(900, 1000)).toBe(900);
  });

  it('still moves a sheet narrower than the window, which is most of them zoomed in', () => {
    expect(clampPan(200, 300)).toBe(200);
    expect(clampPan(400, 300)).toBe(300);
  });

  it('holds still when there is one node and nowhere to pan to', () => {
    expect(clampPan(50, 0)).toBe(0);
  });
});

describe('how far in and out a sheet goes', () => {
  it('stops at each end rather than zooming to nothing or to one room', () => {
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('reads a wheel as a fraction of where it is, so one notch means the same at every zoom', () => {
    const out = zoomByWheel(1, 120);
    const back = zoomByWheel(out, -120);

    expect(out).toBeLessThan(1);
    expect(back).toBeCloseTo(1, 10);
    expect(zoomByWheel(2, 120) / 2).toBeCloseTo(out, 10);
  });

  it('zooms in when the wheel goes the way a page scrolls up', () => {
    expect(zoomByWheel(1, -120)).toBeGreaterThan(1);
  });

  it('will not be wheeled past either end', () => {
    expect(zoomByWheel(ZOOM_MAX, -10_000)).toBe(ZOOM_MAX);
    expect(zoomByWheel(ZOOM_MIN, 10_000)).toBe(ZOOM_MIN);
  });
});

describe('what stays put while a sheet is zoomed', () => {
  it('keeps the point under the pointer under the pointer', () => {
    expect(panAfterZoom(0, 200, 1, 2)).toBe(-200);
  });

  it('leaves the middle of the window alone, since it is the point zoom is about', () => {
    expect(panAfterZoom(0, 0, 1, 3)).toBe(0);
  });

  it('undoes itself when the zoom is undone', () => {
    const there = panAfterZoom(40, 130, 1, 2.5);

    expect(panAfterZoom(there, 130, 2.5, 1)).toBeCloseTo(40, 10);
  });

  it('holds still rather than dividing by a zoom of nothing', () => {
    expect(panAfterZoom(40, 130, 0, 2)).toBe(40);
  });
});

describe('the two fingers', () => {
  it('measures how far apart they are, whichever way round they are', () => {
    expect(spanBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(spanBetween({ x: 3, y: 4 }, { x: 0, y: 0 })).toBe(5);
  });

  it('takes the point between them as what the pinch is about', () => {
    expect(midpoint({ x: -10, y: 4 }, { x: 30, y: 8 })).toEqual({ x: 10, y: 6 });
  });
});

describe('where a sheet comes to rest', () => {
  const BOX = { minX: 0, minY: 0, maxX: 416, maxY: 0 };
  const BUBBLE = { width: 150, height: 34 };
  const NO_BUBBLE = { width: 0, height: 0 };

  it('grows the box a node stands in by the bubble drawn around it', () => {
    expect(drawnBox(BOX, BUBBLE)).toEqual({ left: -75, top: -17, width: 416 + 150, height: 34 });
  });

  it('hands back the zoom it was asked for', () => {
    expect(settled({ x: 0, y: 0 }, 1.75, BOX, BUBBLE).scale).toBe(1.75);
  });

  it('holds the pan to the slack the new zoom leaves, not the slack the old one did', () => {
    const close = settled({ x: 9999, y: 0 }, 2, BOX, BUBBLE).pan.x;
    const far = settled({ x: 9999, y: 0 }, 1, BOX, BUBBLE).pan.x;

    expect(close).toBeGreaterThan(far);
  });

  // Measured from where the drawing's own middle would sit rather than from the sheet's origin: the
  // limit is about the drawing, and the origin may be nowhere near it.
  it('stops a whole drawing away from the middle of the window', () => {
    const drawn = 416 + 150;
    const middle = 416 / 2;

    expect(settled({ x: 9999, y: 0 }, 1, BOX, BUBBLE).pan.x).toBe(drawn - middle);
    expect(settled({ x: -9999, y: 0 }, 1, BOX, BUBBLE).pan.x).toBe(-drawn - middle);
  });

  it('still leaves a lone node room to be dragged off centre by its own width', () => {
    const alone = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    expect(settled({ x: 500, y: 500 }, 1, alone, BUBBLE).pan).toEqual({ x: 150, y: 34 });
  });

  it('refuses to move a sheet with nowhere to go, however far the gesture went', () => {
    const alone = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    expect(settled({ x: 500, y: 500 }, 1, alone, NO_BUBBLE).pan).toEqual({ x: 0, y: 0 });
  });
});

describe('putting one node back in the middle', () => {
  it('is no pan at all for the node standing on the sheet’s own origin', () => {
    expect(panOnto({ x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0 });
  });

  it('carries a node back by how far it stands from that origin, at the zoom drawn', () => {
    expect(panOnto({ x: 200, y: 100 }, 1)).toEqual({ x: -200, y: -100 });
    expect(panOnto({ x: 200, y: 100 }, 2)).toEqual({ x: -400, y: -200 });
  });

  // The one claim: whatever `panOnto` hands back, the middle of the frame is then looking at the node
  // it was given, whatever the sheet had got to and whatever else is drawn on it.
  it('lands the node in the middle from wherever the sheet had got to', () => {
    for (const zoom of [0.5, 1, 1.5, 3]) {
      const node = { x: 320, y: 40 };
      expect(lookingAt(panOnto(node, zoom), zoom).x).toBeCloseTo(node.x, 10);
      expect(lookingAt(panOnto(node, zoom), zoom).y).toBeCloseTo(node.y, 10);
    }
  });

  // What a place is dragged to, and where a new place is put, are read back through this: they are
  // sheet points, and nothing about the frame of reference may depend on what else is drawn.
  it('reads back the same point whatever else the sheet holds', () => {
    expect(lookingAt({ x: -300, y: 50 }, 2)).toEqual({ x: 150, y: -25 });
  });
});

describe('how big a node is to tap', () => {
  it('asks for the floor and no more while the sheet is at its own size or bigger', () => {
    expect(tapTarget(1)).toBe(TOUCH_FLOOR);
    expect(tapTarget(ZOOM_MAX)).toBe(TOUCH_FLOOR);
  });

  it('grows as the sheet shrinks, so what reaches the screen is the floor at every zoom', () => {
    for (const scale of [ZOOM_MIN, 0.5, 0.75, 1, 2, ZOOM_MAX]) {
      expect(tapTarget(scale) * scale).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }
  });
});

describe('where a road between two places starts and stops', () => {
  const BUBBLE = { width: 100, height: 40 };

  it('leaves the box it starts in, rather than the point at the middle of it', () => {
    expect(leaving({ x: 0, y: 0 }, { x: 500, y: 0 }, BUBBLE)).toEqual({ x: 50 + EDGE_GAP, y: 0 });
    expect(leaving({ x: 0, y: 0 }, { x: 0, y: -500 }, BUBBLE)).toEqual({ x: 0, y: -(20 + EDGE_GAP) });
  });

  it('leaves by whichever side the road actually crosses', () => {
    const corner = leaving({ x: 0, y: 0 }, { x: 500, y: 500 }, BUBBLE);

    expect(corner.x).toBeCloseTo(20 + EDGE_GAP, 10);
    expect(corner.y).toBeCloseTo(20 + EDGE_GAP, 10);
  });

  it('stops at the far end rather than running past it, for two places nearly on top of each other', () => {
    expect(leaving({ x: 0, y: 0 }, { x: 3, y: 0 }, BUBBLE)).toEqual({ x: 3, y: 0 });
  });

  it('holds still for two places drawn in the same spot', () => {
    expect(leaving({ x: 7, y: 7 }, { x: 7, y: 7 }, BUBBLE)).toEqual({ x: 7, y: 7 });
  });

  it('is the middle of the place itself when nothing has been measured yet', () => {
    expect(leaving({ x: 0, y: 0 }, { x: 500, y: 0 }, { width: 0, height: 0 })).toEqual({ x: EDGE_GAP, y: 0 });
  });
});
