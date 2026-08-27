import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { PlayView } from '../runtime/session';
import { waysOut } from '../runtime/waysOut';
import { CLIMB_NUDGE, drawnAt, mapBox, newlyFound, sheetAt, onWalk, walkingAt, walkLine, type Node, type Place } from './discovery';

// Any grid proves the same rule; the world's own number is `# variable map-grid` and is not this file's business.
const GRID = 140;

const place = (id: string, x: number, y: number, z: number, ...adjacent: string[]): Place => ({
  id,
  title: asLocalized(id.toUpperCase()),
  x,
  y,
  z,
  adjacent: adjacent.map((to) => ({ to, open: true })),
});

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
    const withAttic = [...HOUSE, place('attic', 5, 5, 1, 'landing')];

    const ids = sheetAt(withAttic, 'hall', 0).nodes.map((node) => node.place.id);

    expect(ids).toContain('landing');
    expect(ids).toContain('cellar');
    expect(ids).not.toContain('attic');
  });

  it('draws a place the view is offering a walk to, however far off the shown plane it stands', () => {
    const withAttic = [...HOUSE, place('attic', 5, 5, 1, 'landing')];
    const walk: PlayView['choices'][number] = { id: 'travel:attic', kind: 'travel', label: asLocalized('Travel to Attic'), leadsTo: 'attic', legs: 2 };

    const ids = sheetAt(withAttic, 'hall', 0, new Map(waysOut([walk]).map((way) => [way.to, way.at]))).nodes.map((node) => node.place.id);

    expect(ids).toContain('attic');
  });

  it('keeps the player on the map even when they are standing off the plane', () => {
    const sheet = sheetAt(HOUSE, 'cellar', 0);

    expect(sheet.nodes.filter((node) => node.here).map((node) => node.place.id)).toEqual(['cellar']);
  });

  it('nudges a place off the plane so it is not drawn under the stairs down to it', () => {
    const sheet = sheetAt(HOUSE, 'hall', 0);
    const at = (id: string): { x: number; y: number } => sheet.nodes.find((node) => node.place.id === id)!.at;

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

  it('says of a road whether it is walked both ways or only the way it points', () => {
    const oneWay = [place('cliff', 0, 0, 0, 'ledge'), place('ledge', 1, 0, 0)];

    expect(sheetAt(oneWay, 'cliff', 0).roads.map((road) => [road.from.place.id, road.to.place.id, road.mutual])).toEqual([['cliff', 'ledge', false]]);
    const house = sheetAt(HOUSE, 'hall', 0).roads;
    const between = (one: string, other: string) => house.find((road) => [road.from.place.id, road.to.place.id].sort().join('-') === [one, other].sort().join('-'));
    expect(between('hall', 'beach')?.mutual).toBe(true);
    expect(between('cove', 'beach')?.mutual).toBe(false);
  });

  it('leaves out a road to somewhere this plane is not drawing', () => {
    const roads = sheetAt(HOUSE, 'beach', 0).roads.flatMap((road) => [road.from.place.id, road.to.place.id]);

    expect(roads).not.toContain('landing');
    expect(roads).not.toContain('cellar');
  });

  it('carries whether each road can be walked right now', () => {
    const shut: Place[] = [{ ...place('hall', 0, 0, 0), adjacent: [{ to: 'vault', open: false }] }, place('vault', 1, 0, 0, 'hall')];

    expect(sheetAt(shut, 'hall', 0).roads.map((road) => road.open)).toEqual([false]);
  });
});

describe('the room the map takes up', () => {
  it('is the places it draws, turned into the pixels a viewport is held against', () => {
    expect(mapBox(sheetAt(HOUSE, 'hall', 0).nodes, GRID)).toEqual({
      minX: -CLIMB_NUDGE * GRID,
      minY: -CLIMB_NUDGE * GRID,
      maxX: 2 * GRID,
      maxY: CLIMB_NUDGE * GRID,
    });
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

  it('draws no two places of a sheet on the same point, from any plane the sheet offers', () => {
    for (const plane of sheetAt(HOUSE, 'hall', 0).planes) {
      const points = sheetAt(HOUSE, 'hall', plane).nodes.map((node) => `${node.at.x},${node.at.y}`);

      expect(new Set(points).size, `on plane ${plane}`).toBe(points.length);
    }
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

    expect(onWalk(line, 'a', 'b')?.stretch).toBe('now');
    expect(onWalk(line, 'c', 'b')?.stretch).toBe('ahead');
    expect(onWalk(line, 'c', 'd')?.stretch).toBe('ahead');
  });

  it('tells the road under the player from the rest of the route, whichever end it was drawn from', () => {
    const line = walkLine('a', journey);

    expect(onWalk(line, 'a', 'b')).toEqual({ stretch: 'now', along: true });
    expect(onWalk(line, 'b', 'a')).toEqual({ stretch: 'now', along: false });
  });

  it('says which way a road is drawn against the way it is walked, so a march along it goes forwards', () => {
    const line = walkLine('a', journey);

    expect(onWalk(line, 'b', 'c')?.along).toBe(true);
    expect(onWalk(line, 'c', 'b')?.along).toBe(false);
  });

  it('leaves the roads it does not take, including a short cut between two places on it', () => {
    const line = walkLine('a', journey);

    expect(onWalk(line, 'a', 'c')).toBeNull();
    expect(onWalk(line, 'b', 'elsewhere')).toBeNull();
    expect(onWalk([], 'a', 'b')).toBeNull();
  });
});

const at = (id: string, here = false): Node => ({ place: place(id, 0, 0, 0), here, climb: 0, at: { x: 0, y: 0 } });

describe('what a place is while a journey is on', () => {
  const line = walkLine('a', { to: 'd', legs: ['b', 'c', 'd'] });

  it('tells the four apart: where the player stands, the next stop, one further on, and the far end', () => {
    expect(line.map((id) => walkingAt(line, at(id, id === 'a')))).toEqual(['here', 'next', 'ahead', 'target']);
  });

  it('says nothing of a place the journey does not pass through', () => {
    expect(walkingAt(line, at('elsewhere'))).toBeUndefined();
  });

  it('says where the player stands even when no journey is under way, and nothing of anywhere else', () => {
    expect(walkingAt([], at('a', true))).toBe('here');
    expect(walkingAt([], at('b'))).toBeUndefined();
  });

  it('says target rather than next for a journey of one leg, which is the fact the player chose', () => {
    const short = walkLine('a', { to: 'b', legs: ['b'] });

    expect(walkingAt(short, at('b'))).toBe('target');
  });

  it('gives every place on the line one of the four and never nothing, so no leg goes undrawn', () => {
    expect(line.map((id) => walkingAt(line, at(id, id === 'a'))).filter((each) => each === undefined)).toEqual([]);
  });
});

