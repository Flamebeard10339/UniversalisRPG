import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { PlayView } from '../runtime/session';
import { CLIMB_NUDGE, drawnAt, mapBox, newlyFound, PER_UNIT, sheetAt, onWalk, walkLine, waysOut, type Place } from './discovery';

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

    const ids = sheetAt(withAttic, 'hall', 0, waysOut([walk])).nodes.map((node) => node.place.id);

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
    expect(mapBox(sheetAt(HOUSE, 'hall', 0).nodes)).toEqual({
      minX: -CLIMB_NUDGE * PER_UNIT,
      minY: -CLIMB_NUDGE * PER_UNIT,
      maxX: 2 * PER_UNIT,
      maxY: CLIMB_NUDGE * PER_UNIT,
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

describe('which offer is the way to a place', () => {
  const offer = (id: string, leadsTo?: string): PlayView['choices'][number] => ({ id, kind: leadsTo ? 'travel' : 'action', label: asLocalized(id), leadsTo });

  it('answers with the position a driver dispatches it at, counting from one', () => {
    const ways = waysOut([offer('look'), offer('travel:beach', 'beach'), offer('travel:cove', 'cove')]);

    expect(ways.get('beach')).toBe(2);
    expect(ways.get('cove')).toBe(3);
  });

  it('takes a staircase, which publishes an action and not a travel', () => {
    const stairs: PlayView['choices'][number] = { id: 'use:entity.stairs.ascend', kind: 'action', label: asLocalized('ascend'), leadsTo: 'landing' };

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

