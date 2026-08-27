import { describe, expect, it } from 'vitest';
import { asLocalized } from './localizedFixture';
import { DIRECTION_VECTORS } from '../content/sections/location';
import { bearingOf, CLIMB_NUDGE, COMPASS, compassOf, drawnAt, placedAt, sheetOf, type Bearing, type Place, type Sheet, type Standing, type Way } from './map';
import type { PlayChoice } from './session';

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

const travel = (to: string, legs = 1): PlayChoice => ({ id: `travel:${to}`, kind: 'travel', label: asLocalized(`Travel to ${to}`), leadsTo: to, legs });

const status = (places: readonly Place[], here: string, choices: readonly PlayChoice[] = []): Standing => ({
  discovered: [...places],
  location: { id: here },
  choices: [...choices],
  mapGrid: 140,
});

const sheet = (places: readonly Place[], here: string, plane: number | null = null, choices: readonly PlayChoice[] = []): Sheet => sheetOf(status(places, here, choices), plane);

const idsOf = (drawn: Sheet): string[] => drawn.nodes.map((node) => String(node.place.id));

const roadOf = (drawn: Sheet, one: string, other: string) => drawn.roads.find((road) => [road.from, road.to].sort().join('-') === [one, other].sort().join('-'));

describe('one floor of the map', () => {
  it('draws what stands on the floor being looked at', () => {
    expect(idsOf(sheet(HOUSE, 'hall', 0))).toEqual(expect.arrayContaining(['hall', 'beach', 'cove']));
  });

  it('draws a place off the floor only when the player could step to it from here', () => {
    const withAttic = [...HOUSE, place('attic', 5, 5, 1, 'landing')];

    const ids = idsOf(sheet(withAttic, 'hall', 0));

    expect(ids).toContain('landing');
    expect(ids).toContain('cellar');
    expect(ids).not.toContain('attic');
  });

  it('draws a place the view is offering a walk to, however far off the shown floor it stands', () => {
    const withAttic = [...HOUSE, place('attic', 5, 5, 1, 'landing')];

    expect(idsOf(sheet(withAttic, 'hall', 0, [travel('attic', 2)]))).toContain('attic');
  });

  it('keeps the player on the map even when they are standing off the floor drawn', () => {
    expect(sheet(HOUSE, 'cellar', 0).nodes.filter((node) => node.here).map((node) => node.place.id)).toEqual(['cellar']);
  });

  it('nudges a place off the floor so it is not drawn under the stairs down to it', () => {
    const drawn = sheet(HOUSE, 'hall', 0);
    const at = (id: string): { x: number; y: number } => drawn.nodes.find((node) => String(node.place.id) === id)!.at;

    expect(at('hall')).toEqual({ x: 0, y: 0 });
    expect(at('landing')).toEqual({ x: CLIMB_NUDGE, y: -CLIMB_NUDGE });
    expect(at('cellar')).toEqual({ x: -CLIMB_NUDGE, y: CLIMB_NUDGE });
  });

  it('says how far off the floor each place is, so height can be read as well as drawn', () => {
    expect(Object.fromEntries(sheet(HOUSE, 'hall', 0).nodes.map((node) => [node.place.id, node.climb]))).toMatchObject({ hall: 0, landing: 1, cellar: -1, beach: 0 });
  });

  it('draws no two places of a sheet on the same point, from any floor the sheet offers', () => {
    for (const plane of sheet(HOUSE, 'hall').planes) {
      const points = sheet(HOUSE, 'hall', plane).nodes.map((node) => `${node.at.x},${node.at.y}`);

      expect(new Set(points).size, `on floor ${plane}`).toBe(points.length);
    }
  });

  it('takes the drawing nudge back out again, whichever floor a place was drawn from', () => {
    for (const z of [-2, -1, 0, 1, 2]) {
      for (const plane of [-1, 0, 1]) expect(placedAt(drawnAt({ x: 3, y: -4, z }, plane), z - plane)).toEqual({ x: 3, y: -4 });
    }
  });
});

// A floor you cannot get to from where you stand is not a floor of this place, and offering it is
// offering to look through the floor.
describe('the floors a player may look at', () => {
  it('is the one they stand on and the ones a road out of here reaches', () => {
    expect(sheet(HOUSE, 'hall').planes).toEqual([-1, 0, 1]);
    expect(sheet(HOUSE, 'beach').planes).toEqual([0]);
  });

  it('leaves out a floor the world has that no road from here goes to', () => {
    const withVault = [...HOUSE.map((each) => (each.id === 'cove' ? place('cove', 2, 0, 0, 'beach', 'vault') : each)), place('vault', 9, 9, -4, 'cove')];

    expect(sheet(withVault, 'hall').planes).not.toContain(-4);
    expect(sheet(withVault, 'cove').planes).toEqual([-4, 0]);
  });

  it('offers every floor there is when the player is standing nowhere the map knows', () => {
    expect(sheet(HOUSE, 'off-the-map').planes).toEqual([-1, 0, 1]);
  });
});

describe('the roads a sheet draws', () => {
  it('draws a road once even though both ends name each other', () => {
    expect(sheet(HOUSE, 'hall', 0).roads.filter((road) => [road.from, road.to].sort().join('-') === 'beach-hall')).toHaveLength(1);
  });

  it('says of a road whether it is walked both ways or only the way it points', () => {
    const oneWay = [place('cliff', 0, 0, 0, 'ledge'), place('ledge', 1, 0, 0)];

    expect(sheet(oneWay, 'cliff', 0).roads).toEqual([{ from: 'cliff', to: 'ledge', open: true, mutual: false }]);
    expect(roadOf(sheet(HOUSE, 'hall', 0), 'hall', 'beach')?.mutual).toBe(true);
    expect(roadOf(sheet(HOUSE, 'hall', 0), 'cove', 'beach')?.mutual).toBe(false);
  });

  it('leaves out a road to somewhere this floor is not drawing', () => {
    const roads = sheet(HOUSE, 'beach', 0).roads.flatMap((road) => [road.from, road.to]);

    expect(roads).not.toContain('landing');
    expect(roads).not.toContain('cellar');
  });

  it('carries whether each road can be walked right now', () => {
    const shut: Place[] = [{ ...place('hall', 0, 0, 0), adjacent: [{ to: 'vault', open: false }] }, place('vault', 1, 0, 0, 'hall')];

    expect(sheet(shut, 'hall', 0).roads.map((road) => road.open)).toEqual([false]);
  });
});

// Which way a place lies is worked out from the coordinates and from `DIRECTION_VECTORS`, so a world
// that turned its map over would turn every bearing with it and nothing here would need editing.
describe('which way one place lies from another', () => {
  const from = { x: 0, y: 0, z: 0 };

  it('points along each of the four the language declares', () => {
    for (const [direction, [dx, dy, dz]] of Object.entries(DIRECTION_VECTORS)) {
      if (dz !== 0) continue;
      expect(bearingOf(from, { x: dx * 5, y: dy * 5, z: 0 }), direction).toBe(direction);
    }
  });

  it('points between two of them where a place lies between them', () => {
    expect(bearingOf(from, { x: 3, y: 3, z: 0 })).toBe('north-east');
    expect(bearingOf(from, { x: -3, y: 3, z: 0 })).toBe('north-west');
    expect(bearingOf(from, { x: 3, y: -3, z: 0 })).toBe('south-east');
    expect(bearingOf(from, { x: -3, y: -3, z: 0 })).toBe('south-west');
  });

  it('rounds to the nearest of the eight rather than refusing anything off them', () => {
    expect(bearingOf(from, { x: 10, y: 1, z: 0 })).toBe('east');
    expect(bearingOf(from, { x: 10, y: 8, z: 0 })).toBe('north-east');
  });

  it('is a floor rather than a heading for a place straight above or below', () => {
    expect(bearingOf(from, { x: 0, y: 0, z: 2 })).toBe('up');
    expect(bearingOf(from, { x: 0, y: 0, z: -2 })).toBe('down');
  });

  it('is nowhere at all for a place drawn on the same square of the same floor', () => {
    expect(bearingOf(from, { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it('carries onto every place the sheet draws, so nothing works the geometry out twice', () => {
    const drawn = sheet(HOUSE, 'hall', 0);

    expect(drawn.nodes.find((node) => node.place.id === 'beach')!.bearing).toBe('east');
    expect(drawn.nodes.find((node) => node.place.id === 'landing')!.bearing).toBe('up');
    expect(drawn.nodes.find((node) => node.here)!.bearing).toBeNull();
  });
});

describe('the nine squares a way out is offered in', () => {
  const way = (bearing: Bearing | null, at: number, legs = 1): Way => ({ to: `to-${at}`, at, label: asLocalized(`Way ${at}`), legs, bearing });

  it('holds a square for each of the eight headings and the player in the middle', () => {
    expect(COMPASS).toHaveLength(9);
    expect(COMPASS[4]).toBeNull();
    expect(new Set(COMPASS.filter((each) => each !== null)).size).toBe(8);
  });

  it('puts each way out where it lies', () => {
    const { cells } = compassOf([way('north-west', 1), way('east', 2), way('south', 3)]);

    expect(cells[0]?.at).toBe(1);
    expect(cells[5]?.at).toBe(2);
    expect(cells[7]?.at).toBe(3);
    expect(cells.filter((cell) => cell !== null)).toHaveLength(3);
  });

  it('keeps the first way to a square and lists the rest under the grid', () => {
    const { cells, rest } = compassOf([way('east', 1), way('east', 2)]);

    expect(cells[5]?.at).toBe(1);
    expect(rest.map((each) => each.at)).toEqual([2]);
  });

  it('lists a floor and a road that points nowhere, since neither is a square of a compass', () => {
    const { cells, rest } = compassOf([way('up', 1), way('down', 2), way(null, 3)]);

    expect(cells.every((cell) => cell === null)).toBe(true);
    expect(rest.map((each) => each.at)).toEqual([1, 2, 3]);
  });

  it('leaves out a journey across the map, which is a way to somewhere and not a way out of here', () => {
    const { cells, rest } = compassOf([way('east', 1), way('north', 2, 3)]);

    expect(cells[5]?.at).toBe(1);
    expect(cells[1]).toBeNull();
    expect(rest).toEqual([]);
  });

  it('reads the ways the sheet already worked out, in the order the engine offers them', () => {
    const drawn = sheet(HOUSE, 'hall', 0, [travel('beach'), travel('landing')]);

    expect(drawn.ways.map((each) => [String(each.to), each.bearing])).toEqual([
      ['beach', 'east'],
      ['landing', 'up'],
    ]);
    expect(compassOf(drawn.ways).cells[5]?.to).toBe('beach');
    expect(compassOf(drawn.ways).rest.map((each) => String(each.to))).toEqual(['landing']);
  });
});
