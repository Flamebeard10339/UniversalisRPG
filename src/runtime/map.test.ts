import { describe, expect, it } from 'vitest';
import { asLocalized } from './localizedFixture';
import { DIRECTION_VECTORS } from '../content/sections/location';
import { bearingOf, CLIMB_NUDGE, COMPASS, compassOf, drawnAt, placedAt, regionHolding, sheetOf, type Bearing, type Place, type Sheet, type Standing, type Way } from './map';
import type { PlayChoice } from './session';
import { loadUniverse } from '../content/load';
import { shippedSources } from '../content/shipped';

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
  undiscovered: [],
  regions: [],
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
    expect(bearingOf(from, { x: 3, y: -3, z: 0 })).toBe('north-east');
    expect(bearingOf(from, { x: -3, y: -3, z: 0 })).toBe('north-west');
    expect(bearingOf(from, { x: 3, y: 3, z: 0 })).toBe('south-east');
    expect(bearingOf(from, { x: -3, y: 3, z: 0 })).toBe('south-west');
  });

  it('rounds to the nearest of the eight rather than refusing anything off them', () => {
    expect(bearingOf(from, { x: 10, y: 1, z: 0 })).toBe('east');
    expect(bearingOf(from, { x: 10, y: -8, z: 0 })).toBe('north-east');
  });

  // The world's own words and the map's own bearings have to agree, and they did not: the corpus
  // writes its north gate above its square, and the language said north was below.
  it('agrees with what the shipped world calls its gates', () => {
    const places = loadUniverse([...shippedSources()]).locations;
    const square = places.get('tulsa.market-square')!;

    expect(bearingOf(square, places.get('tulsa.kings-road')!)).toContain('north');
    expect(bearingOf(square, places.get('tulsa.riverside')!)).toContain('south');
    expect(bearingOf(square, places.get('tulsa.swamp-edge')!)).toBe('west');
    expect(bearingOf(square, places.get('tulsa.market-row')!)).toBe('east');
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

// A region is drawn and nothing else. Nothing in the engine reads one, so what there is to prove is
// about the shape: that it goes round what the region holds, and that what it holds moves together.
describe('the shape a region draws', () => {
  const HOUSE_REGION = { id: 'house', title: asLocalized('The House'), holds: ['hall', 'landing', 'cellar'] };

  const withRegions = (regions: readonly { id: string; title: ReturnType<typeof asLocalized>; holds: string[] }[], here = 'hall', plane: number | null = 0): Sheet =>
    sheetOf({ ...status(HOUSE, here), regions }, plane);

  const inside = (hull: readonly { x: number; y: number }[], point: { x: number; y: number }): boolean =>
    hull.every((corner, at) => {
      const next = hull[(at + 1) % hull.length]!;
      return (next.x - corner.x) * (point.y - corner.y) - (next.y - corner.y) * (point.x - corner.x) >= -1e-9;
    });

  it('goes round every place it holds that the sheet is drawing', () => {
    const drawn = withRegions([HOUSE_REGION]).regions[0]!;

    expect(drawn.drawn.sort()).toEqual(['cellar', 'hall', 'landing']);
    for (const id of drawn.drawn) {
      const node = withRegions([HOUSE_REGION]).nodes.find((each) => each.place.id === id)!;
      expect(inside(drawn.hull, node.at), id).toBe(true);
    }
  });

  it('leaves outside it a place it does not hold', () => {
    const drawn = withRegions([HOUSE_REGION]).regions[0]!;
    const beach = withRegions([HOUSE_REGION]).nodes.find((each) => each.place.id === 'beach')!;

    expect(inside(drawn.hull, beach.at)).toBe(false);
  });

  it('draws a shape for one place and for two, which have no ring of their own', () => {
    for (const holds of [['hall'], ['hall', 'beach']]) {
      const drawn = withRegions([{ ...HOUSE_REGION, holds }]).regions[0]!;

      expect(drawn.hull.length, holds.join()).toBeGreaterThanOrEqual(4);
      for (const id of holds) {
        const node = withRegions([{ ...HOUSE_REGION, holds }]).nodes.find((each) => each.place.id === id)!;
        expect(inside(drawn.hull, node.at), id).toBe(true);
      }
    }
  });

  it('draws nothing for a region none of whose places are on this floor', () => {
    expect(withRegions([{ ...HOUSE_REGION, holds: ['nowhere-at-all'] }]).regions).toEqual([]);
  });

  it('draws round what is on this floor, for a region that reaches onto another', () => {
    const drawn = withRegions([HOUSE_REGION], 'beach').regions[0]!;

    expect(drawn.drawn).toEqual(['hall']);
  });

  it('says which region carries a place, so a drag knows what it is holding', () => {
    expect(regionHolding([HOUSE_REGION], 'landing')?.holds).toEqual(HOUSE_REGION.holds);
    expect(regionHolding([HOUSE_REGION], 'beach')).toBeUndefined();
  });
});

// A place written `up of castle-hall` is somewhere the moment the world loads, and it still says
// what it hangs off — which is what prints it back the way it was written, and what tells a map that
// moving the hall moves this too.
describe('a place placed by how it stands to another', () => {
  const world = () =>
    loadUniverse([
      {
        name: 'keep',
        text: ['# info keep', 'version: 1.0.0', '', '# location hall', 'x: 4, y: 2', 'starting', '', '# location loft', 'up of hall', '', '# location attic', 'up of loft'].join('\n'),
      },
    ]);

  it('is where the direction puts it, and says which place put it there', () => {
    const places = world().locations;

    expect(places.get('keep.loft')).toMatchObject({ x: 4, y: 2, z: 1, relative: { direction: 'up', of: 'keep.hall' } });
    expect(places.get('keep.attic')).toMatchObject({ x: 4, y: 2, z: 2, relative: { direction: 'up', of: 'keep.loft' } });
  });

  it('says nothing of the sort for a place that said where it is', () => {
    expect(world().locations.get('keep.hall')?.relative).toBeUndefined();
  });
});

// A map that draws only what a player has found is no use for putting the next place beside the
// last one, so an author may ask for the whole floor. What has not been found says so.
describe('the whole floor, for whoever is writing it', () => {
  const HIDDEN: Place[] = [place('hall', 0, 0, 0, 'vault'), place('vault', 1, 0, 0, 'hall'), place('attic', 2, 0, 1)];

  const both = (showing: 'found' | 'every'): Sheet =>
    sheetOf({ discovered: [HIDDEN[0]!], undiscovered: HIDDEN.slice(1), regions: [], location: { id: 'hall' }, choices: [], mapGrid: 140 }, 0, showing);

  it('draws what has been found, and nothing else, unless it is asked', () => {
    expect(idsOf(both('found'))).toEqual(['hall']);
  });

  it('draws every place on the floor when it is asked, and says which have been found', () => {
    const drawn = both('every');

    expect(idsOf(drawn).sort()).toEqual(['hall', 'vault']);
    expect(Object.fromEntries(drawn.nodes.map((node) => [node.place.id, node.found]))).toEqual({ hall: true, vault: false });
  });

  it('draws the roads to a place nobody has found, which the found ones do not name', () => {
    expect(both('found').roads).toEqual([]);
    expect(both('every').roads.map((road) => [String(road.from), String(road.to)])).toEqual([['hall', 'vault']]);
  });
});
