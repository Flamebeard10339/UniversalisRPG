import { describe, expect, it } from 'vitest';
import { asLocalized } from './localizedFixture';
import { DIRECTION_VECTORS } from '../content/sections/location';
import { bearingOf, CLIMB_NUDGE, COMPASS, compassOf, drawnAt, placedAt, REGION_PAD, regionHolding, sheetOf, type Bearing, type Place, type Sheet, type Standing, type Way } from './map';
import type { PlayChoice } from './session';
import { loadUniverse } from '../content/load';
import { fixtureSources } from '../content/worldFixture';

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

  it('draws a road once for a pair only one end of which lists it, and calls it walked both ways', () => {
    const oneEnd = [place('cliff', 0, 0, 0, 'ledge'), place('ledge', 1, 0, 0)];

    expect(sheet(oneEnd, 'cliff', 0).roads).toEqual([{ from: 'cliff', to: 'ledge', open: true, mutual: true }]);
    expect(sheet(oneEnd, 'ledge', 0).roads).toEqual([{ from: 'cliff', to: 'ledge', open: true, mutual: true }]);
  });

  // A found place lists only the roads to places the player has found, so from the market square
  // there is no edge to a room nobody has been in — and an author, who is shown both, would have been
  // shown half their map as roads running one way that nobody wrote.
  it('draws the road to a place the player has not found from the end that still lists it', () => {
    const found = [place('hall', 0, 0, 0), place('shed', 1, 0, 0, 'hall')];
    const drawn = sheetOf({ ...status(found, 'hall'), discovered: [found[0]!], undiscovered: [found[1]!] }, 0, 'every');

    expect(drawn.roads).toEqual([{ from: 'hall', to: 'shed', open: true, mutual: true }]);
  });

  it('shuts a road either end of which says it is shut', () => {
    const gated: Place[] = [
      { ...place('yard', 0, 0, 0), adjacent: [{ to: 'gate', open: false }] },
      { ...place('gate', 1, 0, 0), adjacent: [{ to: 'yard', open: true }] },
    ];

    expect(sheet(gated, 'yard', 0).roads[0]!.open).toBe(false);
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

  // A world's own words and the map's own bearings have to agree, and they did not: a place written
  // `north of` another was drawn below it. The subjects are the four the fixture writes one of each
  // way round its green, so the four headings are each read off a line an author wrote.
  it('agrees with what a world calls the ways out of a place', () => {
    const places = loadUniverse([...fixtureSources()]).locations;
    const green = places.get('fixture-town.green')!;

    expect(bearingOf(green, places.get('fixture-town.store')!)).toContain('north');
    expect(bearingOf(green, places.get('fixture-town.lane')!)).toContain('south');
    expect(bearingOf(green, places.get('fixture-town.gate')!)).toBe('west');
    expect(bearingOf(green, places.get('fixture-town.well')!)).toBe('east');
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

  // Not the point a place is drawn at but the whole square it stands in: only one place can be at a
  // coordinate, so the square is what a place occupies, and a shape that held only the middles left
  // every room of the castle sitting half outside its own wall.
  const squareOf = (at: { x: number; y: number }): { x: number; y: number }[] =>
    [-1, 1].flatMap((across) => [-1, 1].map((down) => ({ x: at.x + across * REGION_PAD, y: at.y + down * REGION_PAD })));

  it('goes round the whole square of every place it holds that the sheet is drawing', () => {
    const sheet = withRegions([HOUSE_REGION]);
    const drawn = sheet.regions[0]!;

    expect(drawn.drawn.sort()).toEqual(['cellar', 'hall', 'landing']);
    for (const id of drawn.drawn) {
      const node = sheet.nodes.find((each) => each.place.id === id)!;
      for (const corner of squareOf(node.at)) expect(inside(drawn.hull, corner), `${id} ${corner.x},${corner.y}`).toBe(true);
    }
  });

  it('leaves outside it a place it does not hold', () => {
    const drawn = withRegions([HOUSE_REGION]).regions[0]!;
    const beach = withRegions([HOUSE_REGION]).nodes.find((each) => each.place.id === 'beach')!;

    expect(inside(drawn.hull, beach.at)).toBe(false);
  });

  it('draws a shape for one place and for two, which have no ring of their own', () => {
    for (const holds of [['hall'], ['hall', 'beach']]) {
      const sheet = withRegions([{ ...HOUSE_REGION, holds }]);
      const drawn = sheet.regions[0]!;

      expect(drawn.hull.length, holds.join()).toBeGreaterThanOrEqual(4);
      for (const id of holds) {
        const node = sheet.nodes.find((each) => each.place.id === id)!;
        for (const corner of squareOf(node.at)) expect(inside(drawn.hull, corner), `${holds.join()} ${id}`).toBe(true);
      }
    }
  });

  // The setting is the whole of the difference, so what there is to prove is that the map reads it
  // and that the other shape still holds what the region holds.
  it('draws one rectangle round the lot for a run standing at the other shape', () => {
    const boxed = sheetOf({ ...status(HOUSE, 'hall'), regions: [HOUSE_REGION], settings: [{ name: 'regions', standing: 'box' }] }, 0).regions[0]!;

    expect(boxed.hull).toHaveLength(4);
    expect(new Set(boxed.hull.map((corner) => corner.x)).size).toBe(2);
    for (const id of boxed.drawn) {
      const node = withRegions([HOUSE_REGION]).nodes.find((each) => each.place.id === id)!;
      for (const corner of squareOf(node.at)) expect(inside(boxed.hull, corner), id).toBe(true);
    }
  });

  // A building does not change shape while you are looking at it. Drawn round what the sheet was
  // showing, the castle moved and resized every time a room of it was found — which is what an
  // arrival inside one looked like from outside.
  it('draws the same shape however few of its places the sheet is showing', () => {
    const whole = withRegions([HOUSE_REGION]).regions[0]!;
    const one = sheetOf({ ...status(HOUSE, 'hall'), discovered: [HOUSE[0]!], undiscovered: HOUSE.slice(1), regions: [HOUSE_REGION] }, 0).regions[0]!;

    expect(one.drawn).toEqual(['hall']);
    expect(one.hull).toEqual(whole.hull);
    expect(one.at).toEqual(whole.at);
  });

  // A region is a building, and a building shows its rooms to somebody who is in it. From outside, the
  // one room of it on the map is the one a road from here reaches — which is why a road into a region
  // can never be left pointing at a room that is not drawn: the road is what draws it.
  it('shows the room a road from out here reaches, and keeps the rest of the building shut', () => {
    const outside = withRegions([HOUSE_REGION], 'beach');

    expect(outside.nodes.map((node) => String(node.place.id)).sort()).toEqual(['beach', 'cove', 'hall']);
    expect(outside.regions[0]!.drawn).toEqual(['hall']);
  });

  // Opening a region does not open the floors it reaches onto: a room overhead is drawn when a step
  // from here would put you in it, region or no region, which is the rule this one is said beside.
  it('shows every room of it to somebody standing in one of them, on the floors they could step to', () => {
    expect(withRegions([HOUSE_REGION], 'hall').regions[0]!.drawn.sort()).toEqual(['cellar', 'hall', 'landing']);
    expect(withRegions([HOUSE_REGION], 'cellar').regions[0]!.drawn.sort()).toEqual(['cellar', 'hall']);
  });

  it('leaves the building standing once its rooms are shut away again', () => {
    const away = [...HOUSE, place('dune', 3, 0, 0, 'cove')];
    const gone = sheetOf({ ...status(away, 'dune'), regions: [HOUSE_REGION] }, 0);

    expect(gone.nodes.map((node) => String(node.place.id))).not.toContain('hall');
    expect(gone.regions[0]!.drawn).toEqual([]);
    expect(gone.regions[0]!.hull).toEqual(withRegions([HOUSE_REGION]).regions[0]!.hull);
  });

  it('shows an author every room of every region, because a floor is what they are laying out', () => {
    const author = sheetOf({ ...status(HOUSE, 'beach'), regions: [HOUSE_REGION] }, 0, 'every');

    expect(author.regions[0]!.drawn).toEqual(['hall']);
    expect(sheetOf({ ...status(HOUSE, 'beach'), regions: [HOUSE_REGION] }, 1, 'every').regions[0]!.drawn).toEqual(['landing']);
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

// A place written `above castle-hall` is somewhere the moment the world loads, and it still says
// what it hangs off — which is what prints it back the way it was written, and what tells a map that
// moving the hall moves this too.
describe('a place placed by how it stands to another', () => {
  const world = () =>
    loadUniverse([
      {
        name: 'keep',
        text: ['# info keep', 'version: 1.0.0', '', '# location hall', 'x: 4, y: 2', 'starting', '', '# location loft', 'above hall', '', '# location attic', 'above loft'].join('\n'),
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

  // A floor a step away is part of the room a player is standing in; it is not part of the floor an
  // author is laying out, and drawing it there put rooms on the map that the floor being edited does
  // not have on it.
  const STOREYED: Place[] = [place('hall', 0, 0, 0, 'cellar'), place('cellar', 0, 0, -1, 'hall'), place('attic', 2, 0, 1)];

  const storeys = (showing: 'found' | 'every', ghost: number | null = null): Sheet =>
    sheetOf({ discovered: STOREYED, undiscovered: [], regions: [], location: { id: 'hall' }, choices: [], mapGrid: 140 }, 0, showing, ghost);

  it('draws the floor it was asked for and no other, where a player is shown the one a step away', () => {
    expect(idsOf(storeys('found'))).toContain('cellar');
    expect(idsOf(storeys('every'))).toEqual(['hall']);
  });

  it('draws a second floor beside it when one is being looked at, on either showing', () => {
    expect(idsOf(storeys('every', -1)).sort()).toEqual(['cellar', 'hall']);
    expect(idsOf(storeys('every', 1)).sort()).toEqual(['attic', 'hall']);
    expect(storeys('every', -1).nodes.find((node) => node.place.id === 'cellar')?.climb).toBe(-1);
  });

  it('offers every floor there is to whoever is writing it, road or no road', () => {
    expect(storeys('found').planes).toEqual([-1, 0]);
    expect(storeys('every').planes).toEqual([-1, 0, 1]);
  });
});
