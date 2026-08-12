import { describe, expect, it } from 'vitest';
import type { PlayView } from '../runtime/session';
import { bounds, clampPan, CLIMB_NUDGE, clampZoom, drawnAt, drawnBox, midpoint, newlyFound, panAfterZoom, PER_UNIT, settled, sheetAt, onWalk, spanBetween, tapTarget, TOUCH_FLOOR, walkLine, waysOut, ZOOM_MAX, ZOOM_MIN, zoomByWheel, type Place } from './discovery';

const place = (id: string, x: number, y: number, z: number, ...adjacent: string[]): Place => ({
  id,
  title: id.toUpperCase(),
  x,
  y,
  z,
  adjacent: adjacent.map((to) => ({ to, open: true })),
});

// A house with a floor above and a cellar below, both stacked on the same x and
// y as the hall, and a beach one unit east of it.
const HOUSE: Place[] = [
  place('hall', 0, 0, 0, 'landing', 'cellar', 'beach'),
  place('landing', 0, 0, 1, 'hall'),
  place('cellar', 0, 0, -1, 'hall'),
  place('beach', 1, 0, 0, 'hall'),
  place('cove', 2, 0, 0, 'beach'),
];

describe('one plane of the map', () => {
  it('draws what stands on the plane being looked at', () => {
    const ids = sheetAt(HOUSE, 'hall', 0).nodes.map((node) => node.place.id);

    expect(ids).toContain('hall');
    expect(ids).toContain('beach');
    expect(ids).toContain('cove');
  });

  it('draws a place off the plane only when the player could step to it from here', () => {
    // Both are at z 1: the landing is adjacent to the hall and the attic is not.
    const withAttic = [...HOUSE, place('attic', 5, 5, 1, 'landing')];

    const ids = sheetAt(withAttic, 'hall', 0).nodes.map((node) => node.place.id);

    expect(ids).toContain('landing');
    expect(ids).toContain('cellar');
    expect(ids).not.toContain('attic');
  });

  it('keeps the player on the map even when they are standing off the plane', () => {
    const sheet = sheetAt(HOUSE, 'cellar', 0);

    expect(sheet.nodes.filter((node) => node.here).map((node) => node.place.id)).toEqual(['cellar']);
  });

  it('nudges a place off the plane so it is not drawn under the stairs down to it', () => {
    const sheet = sheetAt(HOUSE, 'hall', 0);
    const at = (id: string): { x: number; y: number } => sheet.nodes.find((node) => node.place.id === id)!.at;

    // All three are authored at (0, 0), which is why the hall would otherwise
    // have two places hidden underneath it.
    expect(at('hall')).toEqual({ x: 0, y: 0 });
    expect(at('landing')).toEqual({ x: CLIMB_NUDGE, y: -CLIMB_NUDGE });
    expect(at('cellar')).toEqual({ x: -CLIMB_NUDGE, y: CLIMB_NUDGE });
  });

  it('says how far off the plane each place is, so height can be read as well as drawn', () => {
    const climbs = Object.fromEntries(sheetAt(HOUSE, 'hall', 0).nodes.map((node) => [node.place.id, node.climb]));

    expect(climbs).toMatchObject({ hall: 0, landing: 1, cellar: -1, beach: 0 });
  });

  it('offers every plane the world has, in order, however the places were listed', () => {
    expect(sheetAt(HOUSE, 'hall', 0).planes).toEqual([-1, 0, 1]);
  });

  it('draws a road once even though both ends name each other', () => {
    const roads = sheetAt(HOUSE, 'hall', 0).roads.map((road) => [road.from.place.id, road.to.place.id].sort().join('-'));

    expect(roads.filter((road) => road === 'beach-hall')).toHaveLength(1);
  });

  it('draws a one-way road, which no second end will draw for it', () => {
    const oneWay = [place('cliff', 0, 0, 0, 'ledge'), place('ledge', 1, 0, 0)];

    expect(sheetAt(oneWay, 'cliff', 0).roads).toHaveLength(1);
  });

  it('leaves out a road to somewhere this plane is not drawing', () => {
    const roads = sheetAt(HOUSE, 'beach', 0).roads.flatMap((road) => [road.from.place.id, road.to.place.id]);

    // Standing on the beach, the landing and cellar are two rooms away and off
    // the plane, so neither they nor the roads to them are drawn.
    expect(roads).not.toContain('landing');
    expect(roads).not.toContain('cellar');
  });

  it('carries whether each road can be walked right now', () => {
    const shut: Place[] = [{ ...place('hall', 0, 0, 0), adjacent: [{ to: 'vault', open: false }] }, place('vault', 1, 0, 0, 'hall')];

    expect(sheetAt(shut, 'hall', 0).roads.map((road) => road.open)).toEqual([false]);
  });
});

describe('how far the map can be pushed around', () => {
  it('gives back the room everything drawn takes up', () => {
    expect(bounds(sheetAt(HOUSE, 'hall', 0).nodes)).toEqual({ minX: -CLIMB_NUDGE, minY: -CLIMB_NUDGE, maxX: 2, maxY: CLIMB_NUDGE });
  });

  it('is a point when there is nothing drawn, so a caller still has a centre', () => {
    expect(bounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('lets the furthest place be dragged to the middle, and no further', () => {
    expect(clampPan(900, 1000)).toBe(500);
    expect(clampPan(-900, 1000)).toBe(-500);
    expect(clampPan(100, 1000)).toBe(100);
  });

  it('still moves a map narrower than the window, which is most of them zoomed in', () => {
    expect(clampPan(200, 300)).toBe(150);
  });

  it('holds still when there is one place and nowhere to pan to', () => {
    expect(clampPan(50, 0)).toBe(0);
  });
});

describe('what the world just gave up', () => {
  it('names only what was not there before', () => {
    expect(newlyFound([place('hall', 0, 0, 0)], HOUSE)).toEqual(['landing', 'cellar', 'beach', 'cove']);
  });

  it('says nothing when the same places come round again', () => {
    expect(newlyFound(HOUSE, HOUSE)).toEqual([]);
  });

  it('says nothing for a place that left, since only an arrival is acknowledged', () => {
    expect(newlyFound(HOUSE, [place('hall', 0, 0, 0)])).toEqual([]);
  });
});

describe('where a place is drawn', () => {
  it('is where it is, on its own plane', () => {
    expect(drawnAt(place('beach', 3, 4, 0), 0)).toEqual({ x: 3, y: 4 });
  });

  it('moves one nudge per floor, so two places over each other do not land on one point', () => {
    expect(drawnAt(place('landing', 0, 0, 1), 0)).toEqual({ x: CLIMB_NUDGE, y: -CLIMB_NUDGE });
    expect(drawnAt(place('spire', 0, 0, 3), 0)).toEqual({ x: 3 * CLIMB_NUDGE, y: -3 * CLIMB_NUDGE });
  });

  // The author's report: standing in the hall and looking at the floor above,
  // the hall is one floor down and the cellar is two, and a nudge that read
  // only which way drew the hall underneath the cellar.
  it('draws no two places of a sheet on the same point, from any plane the sheet offers', () => {
    for (const plane of sheetAt(HOUSE, 'hall', 0).planes) {
      const points = sheetAt(HOUSE, 'hall', plane).nodes.map((node) => `${node.at.x},${node.at.y}`);

      expect(new Set(points).size, `on plane ${plane}`).toBe(points.length);
    }
  });
});

describe('which offer is the way to a place', () => {
  const offer = (id: string, leadsTo?: string): PlayView['choices'][number] => ({ id, kind: leadsTo ? 'travel' : 'action', label: id, leadsTo });

  it('answers with the position a driver dispatches it at, counting from one', () => {
    const ways = waysOut([offer('look'), offer('travel:beach', 'beach'), offer('travel:cove', 'cove')]);

    expect(ways.get('beach')).toBe(2);
    expect(ways.get('cove')).toBe(3);
  });

  it('takes a staircase, which publishes an action and not a travel', () => {
    const stairs: PlayView['choices'][number] = { id: 'use:entity.stairs.ascend', kind: 'action', label: 'ascend', leadsTo: 'landing' };

    expect(waysOut([stairs]).get('landing')).toBe(1);
  });

  it('leaves out an offer that goes nowhere, so it can never be dispatched by a tap on a place', () => {
    const ways = waysOut([offer('roast chestnuts'), offer('talk to miki')]);

    expect([...ways.keys()]).toEqual([]);
  });

  it('keeps the first of two ways to one place, which is the order the engine offered them', () => {
    const ways = waysOut([offer('a'), offer('travel:beach', 'beach'), offer('use:entity.path.walk', 'beach')]);

    expect(ways.get('beach')).toBe(2);
  });
});

describe('how far in and out the map goes', () => {
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
    // The property a fixed step per notch would fail: the same notch moves a
    // zoomed-in map by the same proportion, not by the same number of pixels.
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

describe('what stays put while the map is zoomed', () => {
  it('keeps the point under the pointer under the pointer', () => {
    // A world point 200px right of the middle at rest is 400 away at 2x, so the
    // map has to give back the 200 it gained for the pointer to still be on it.
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

describe('where the map comes to rest', () => {
  const BOX = { minX: 0, minY: 0, maxX: 4, maxY: 0 };
  const BUBBLE = { width: 150, height: 34 };
  const NO_BUBBLE = { width: 0, height: 0 };

  it('grows the box a place stands in by the bubble drawn around it', () => {
    expect(drawnBox(BOX, BUBBLE)).toEqual({ left: -75, top: -17, width: 4 * PER_UNIT + 150, height: 34 });
  });

  it('hands back the zoom it was asked for', () => {
    expect(settled({ x: 0, y: 0 }, 1.75, BOX, BUBBLE).scale).toBe(1.75);
  });

  it('holds the pan to the slack the new zoom leaves, not the slack the old one did', () => {
    // Zooming in makes the sheet wider, so there is further to pan, and a pan
    // clamped against the smaller sheet could never reach the new edges.
    const close = settled({ x: 9999, y: 0 }, 2, BOX, BUBBLE).pan.x;
    const far = settled({ x: 9999, y: 0 }, 1, BOX, BUBBLE).pan.x;

    expect(close).toBeGreaterThan(far);
  });

  it('stops with the outer edge of the last bubble under the middle of the window', () => {
    expect(settled({ x: 9999, y: 0 }, 1, BOX, BUBBLE).pan.x).toBe((4 * PER_UNIT + 150) / 2);
  });

  it('still leaves a lone place room to be dragged off centre by its own width', () => {
    const alone = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    expect(settled({ x: 500, y: 500 }, 1, alone, BUBBLE).pan).toEqual({ x: 75, y: 17 });
  });

  it('refuses to move a sheet with nowhere to go, however far the gesture went', () => {
    const alone = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    expect(settled({ x: 500, y: 500 }, 1, alone, NO_BUBBLE).pan).toEqual({ x: 0, y: 0 });
  });
});

describe('the walk under way', () => {
  const journey = { to: 'd', legs: ['b', 'c', 'd'] };

  it('runs from where the player is standing to where they are going', () => {
    expect(walkLine('a', journey)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is nothing at all when nobody is walking', () => {
    expect(walkLine('a', null)).toEqual([]);
    expect(walkLine('a', { to: 'd', legs: [] })).toEqual([]);
  });

  it('takes the road between two places it crosses in a row, either way round', () => {
    const line = walkLine('a', journey);

    expect(onWalk(line, 'a', 'b')).toBe(true);
    expect(onWalk(line, 'c', 'b')).toBe(true);
    expect(onWalk(line, 'c', 'd')).toBe(true);
  });

  it('leaves the roads it does not take, including a short cut between two places on it', () => {
    const line = walkLine('a', journey);

    expect(onWalk(line, 'a', 'c')).toBe(false);
    expect(onWalk(line, 'b', 'elsewhere')).toBe(false);
    expect(onWalk([], 'a', 'b')).toBe(false);
  });
});

describe('how big a place is to tap', () => {
  it('asks for the floor and no more while the sheet is at its own size or bigger', () => {
    expect(tapTarget(1)).toBe(TOUCH_FLOOR);
    expect(tapTarget(ZOOM_MAX)).toBe(TOUCH_FLOOR);
  });

  it('grows as the sheet shrinks, so what reaches the screen is the floor at every zoom', () => {
    // Drawn inside the scale, so the figure a thumb meets is the product of
    // the two — which is what fell to 13.6 px when the area was fixed.
    for (const scale of [ZOOM_MIN, 0.5, 0.75, 1, 2, ZOOM_MAX]) {
      expect(tapTarget(scale) * scale).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }
  });
});
