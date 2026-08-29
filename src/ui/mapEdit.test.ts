import { describe, expect, it } from 'vitest';
import { arrowAt } from './MapPane';
import { loadUniverseWithDiagnostics } from '../content/load';
import { addressable, names, NOWHERE, offeredBy } from './authoringSurface';
import { gotoLine } from './devMode';
import { drawnAt, placedAt, sheetOf, type Node, type Place, type Sheet } from '../runtime/map';
import { createDriver, type Driver } from './driver';
import { answering, centredOn, created, droppedAt, joinedInto, joinLine, pinnedInto, placeLine, settledOn, stagedKey } from './mapEdit';
import { SHIPPED_SOURCES } from './shippedContent';

// Any grid proves the same rule; what the shipped world draws at is `# variable map-grid`.
const GRID = 140;

const opened = (): Driver => createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined });

const REGISTRY_PLACES = loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry.locations;

const said = (driver: Driver): string[] => driver.snapshot().transcript.entries.map((entry) => String(entry.text));

const at = (id: string, x: number, y: number, z = 0, ...adjacent: string[]): Place => ({
  id,
  title: '' as never,
  x,
  y,
  z,
  adjacent: adjacent.map((to) => ({ to, open: true })),
});

const drawn = (places: readonly Place[], here: string): Sheet => sheetOf({ discovered: places, undiscovered: [], regions: [], location: { id: here }, choices: [], mapGrid: GRID }, null);

describe('where a drag lets go is where the place is (c8)', () => {
  it('rounds to the units a location can be written in', () => {
    expect(settledOn({ x: 1.49, y: -1.49 })).toEqual({ x: 1, y: -1 });
    expect(settledOn({ x: 1.5, y: -1.5 })).toEqual({ x: 2, y: -1 });
  });

  it('undoes the nudge a place off the drawn floor was drawn with', () => {
    for (const z of [-2, -1, 0, 1, 2]) {
      for (const plane of [-1, 0, 1]) expect(placedAt(drawnAt({ x: 3, y: -4, z }, plane), z - plane)).toEqual({ x: 3, y: -4 });
    }
  });

  const node = (x: number, y: number, climb = 0): Node => ({ place: at('somewhere', x, y, climb), here: false, climb, goes: null, bearing: null, found: true, at: drawnAt({ x, y, z: climb }, 0) });

  it('turns the pixels a finger carried a place into the square it landed on', () => {
    expect(droppedAt(node(3, -4), { x: GRID * 3, y: GRID * -2 }, GRID)).toEqual({ x: 6, y: -6 });
  });

  for (const climb of [-2, 2]) {
    it(`takes the drawing nudge back out for a place ${Math.abs(climb)} floors ${climb > 0 ? 'up' : 'down'}`, () => {
      expect(droppedAt(node(3, -4, climb), { x: 0, y: 0 }, GRID)).toEqual({ x: 3, y: -4 });
    });
  }
});

// The map pane says what happened; what it means is the command line's, and the same line typed by
// hand does the same thing. A gesture that composed its own edit was an edit only a screen could make.
describe('what a gesture on the map says', () => {
  it('puts a place where it was dropped', () => {
    expect(placeLine('tulsa.market-square', { x: 8, y: -1 })).toBe('/place tulsa.market-square 8 -1');
  });

  it('draws a road where there is none, and rubs one out where there is', () => {
    const joined = drawn([at('gate', 0, 0, 0, 'yard'), at('yard', 1, 0, 0, 'gate'), at('lane', 2, 0)], 'gate');

    expect(joinedInto(joined, 'gate', 'lane')).toBe('/link gate lane');
    expect(joinedInto(joined, 'gate', 'yard')).toBe('/unlink gate yard');
  });

  it('says it in the words the command line takes', () => {
    expect(joinLine('a', 'b', true)).toBe('/link a b');
    expect(joinLine('a', 'b', false)).toBe('/unlink a b');
  });

  // Which way one place hangs off another is not asked of the author, because where the two stand
  // already answers it. A floor between them is the only thing a relation can be — a heading keeps its
  // floor — so a room and the cellar under it say `down of` however far apart their labels are drawn.
  it('works out which step the pin is from where the two places stand', () => {
    const places = [at('street', 4, 4, 0), at('sewer', 4, 4, -1), at('gate', 5, 4, 0), at('far', 9, 5, 0)];

    expect(pinnedInto(places, 'sewer', 'street')).toEqual({ line: '/place sewer below street' });
    expect(pinnedInto(places, 'street', 'sewer')).toEqual({ line: '/place street above sewer' });
    expect(pinnedInto(places, 'gate', 'street')).toEqual({ line: '/place gate east of street' });
    expect(pinnedInto(places, 'far', 'street')).toEqual({ line: '/place far east of street' });
  });

  it('refuses a pin between two places drawn in the same square, which is no step at all', () => {
    const places = [at('one', 2, 2, 0), at('other', 2, 2, 0)];

    expect(pinnedInto(places, 'one', 'other')).toEqual({ refused: expect.stringContaining('same square') });
    expect(pinnedInto(places, 'one', 'nowhere')).toEqual({ refused: expect.stringContaining('on the map') });
  });
});

describe('what a staged edit does from a surface (c8)', () => {
  const watching = (): { act: { send(line: string): void; note(text: string): void }; sent: string[]; said: string[] } => {
    const sent: string[] = [];
    const spoken: string[] = [];
    return { act: { send: (line) => void sent.push(line), note: (text) => void spoken.push(text) }, sent, said: spoken };
  };

  it('sends a line down the one route and says a refusal out loud', () => {
    const taken = watching();
    answering({ line: '/place a.b 1 1' }, taken.act);
    const refused = watching();
    answering({ refused: 'that one is placed relative to another' }, refused.act);

    expect([taken.sent, taken.said]).toEqual([['/place a.b 1 1'], []]);
    expect([refused.sent, refused.said]).toEqual([[], ['that one is placed relative to another']]);
  });
});

describe('a new place is written where the map is looking', () => {
  const lineOf = (staged: ReturnType<typeof created>, where: string): string => {
    if ('refused' in staged) throw new Error(`${where}: ${staged.refused}`);
    return staged.line;
  };

  it('reads the point at the middle of the sheet, wherever the sheet has been dragged to', () => {
    expect(centredOn({ pan: { x: 0, y: 0 }, zoom: 1 }, GRID)).toEqual({ x: 0, y: 0 });
    expect(centredOn({ pan: { x: -GRID, y: 0 }, zoom: 1 }, GRID)).toEqual({ x: 1, y: 0 });
    expect(centredOn({ pan: { x: -GRID, y: 0 }, zoom: 2 }, GRID)).toEqual({ x: 0.5, y: 0 });
  });

  it('writes the plane it was drawn on and leaves the ground plane unsaid', () => {
    expect(lineOf(created('north-shore', { x: 3.4, y: -2.6 }, 0), 'north-shore')).toBe('/dsl location local-changes.north-shore x: 3, y: -3');
    expect(lineOf(created('north-shore', { x: 0, y: 0 }, 2), 'north-shore')).toBe('/dsl location local-changes.north-shore x: 0, y: 0, z: 2');
  });

  it('refuses a name the DSL would not take rather than staging a section that will not load', () => {
    for (const name of ['', 'North Shore', 'north shore', '3-shore', 'north.shore']) {
      expect(created(name, { x: 0, y: 0 }, 0), name).toHaveProperty('refused');
    }
  });

  it('stands the author in the place they made, which is the one the map goes on to draw', () => {
    const driver = opened();
    driver.send('/dev on');

    driver.send(lineOf(created('north-shore', { x: 8, y: -8 }, 0), 'north-shore'));
    driver.send(gotoLine(stagedKey('north-shore')));

    expect(said(driver).filter((line) => line.includes('did not load'))).toEqual([]);
    expect(driver.snapshot().view.location.id).toBe('local-changes.north-shore');
    expect(driver.snapshot().view.discovered.map((place) => place.id)).toContain('local-changes.north-shore');
  });

  it('places and connects a place it made, which the map addresses by a key no module spells', () => {
    const driver = opened();
    driver.send('/dev on');
    driver.send(lineOf(created('north-shore', { x: 8, y: -8 }, 0), 'north-shore'));
    driver.send(gotoLine(stagedKey('north-shore')));
    const made = addressable([{ name: 'local-changes', text: driver.localChanges() ?? '' }]).find((each) => each.address === stagedKey('north-shore'))!;

    expect(names(made.address, stagedKey('north-shore'))).toBe(true);
    driver.send(placeLine(stagedKey('north-shore'), { x: 9, y: 9 }));

    expect(said(driver).filter((line) => line.includes('did not load'))).toEqual([]);
    expect(driver.snapshot().view.discovered.find((place) => place.id === 'local-changes.north-shore')).toMatchObject({ x: 9, y: 9 });
  });
});

// One case per drawn place: the map is a rule about all of them, and a corpus that grows a quarter is
// covered with nothing here edited.
describe('a drag is a section edit and nothing else (c8)', () => {
  const DRAWN = offeredBy(addressable(SHIPPED_SOURCES), NOWHERE, 'map');
  const ABSOLUTE = DRAWN.filter((section) => REGISTRY_PLACES.get(section.address)?.relative === undefined);

  it('reads the locations it is a rule about', () => {
    expect(DRAWN.length).toBeGreaterThan(3);
    expect(ABSOLUTE.length).toBeGreaterThan(3);
    expect(DRAWN.length - ABSOLUTE.length).toBeGreaterThan(0);
  });

  for (const section of ABSOLUTE) {
    it(`stages ${section.address} where it was dropped, through the same door a typed edit takes`, () => {
      const driver = opened();
      const before = REGISTRY_PLACES.get(section.address)!;

      driver.send(placeLine(section.address, { x: 11, y: -7 }));

      expect(said(driver).filter((line) => line.includes('did not load'))).toEqual([]);
      const moved = loadUniverseWithDiagnostics([...SHIPPED_SOURCES, { name: 'local-changes', text: driver.localChanges()! }]).registry.locations.get(section.address);
      expect(moved).toEqual({ ...before, x: 11, y: -7 });
    });
  }
});

describe('the point of a one-way road', () => {
  it('stands where it is put, pointing the way it is given', () => {
    const points = arrowAt({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 1, y: 0 }).split(' ').map((pair) => pair.split(',').map(Number));

    expect(points[1]).toEqual([55, 0]);
    expect(points[0]![0]).toBeLessThan(points[1]![0]!);
    expect(points[0]![1]).toBe(-points[2]![1]!);
  });

  // Two places drawn on top of each other leave no road between them to read a direction off, so the
  // arrow takes the direction the places themselves lie in and stays an arrow.
  it('points nowhere rather than somewhere wrong when it is given nowhere', () => {
    expect(arrowAt({ x: 40, y: 0 }, { x: 60, y: 0 }, { x: 0, y: 0 })).toBe('50,0 50,0 50,0');
  });
});
