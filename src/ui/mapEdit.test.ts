import { describe, expect, it } from 'vitest';
import { arrowAt } from './MapPane';
import type { Location } from '../content/sections/location';
import { loadUniverseWithDiagnostics } from '../content/load';
import { addressable, MAPPED_KIND, names, NOWHERE, offeredBy, type Section } from './authoringSurface';
import { gotoLine } from './devMode';
import { drawnAt, PER_UNIT, placedAt, type Node } from './discovery';
import { createDriver, type Driver } from './driver';
import { answering, centredOn, created, droppedAt, joined, joinedInto, linkedTo, linksTo, movedTo, placedInto, settledOn, stagedKey, unlinkedFrom } from './mapEdit';
import { SHIPPED_SOURCES } from './shippedContent';

const addressed = addressable(SHIPPED_SOURCES);

const DRAWN = offeredBy(addressed, NOWHERE, 'map');

const withStaged = (local: string): Map<string, Location> =>
  loadUniverseWithDiagnostics([...SHIPPED_SOURCES, { name: 'local-changes', text: local }]).registry.locations;

const opened = (): Driver => createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined });

const REGISTRY_PLACES: Map<string, Location> = loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry.locations;

function bodyOf(staged: { line: string }): string {
  const driver = opened();
  driver.send(staged.line);
  return driver.localChanges() ?? '';
}

const said = (driver: Driver): string[] => driver.snapshot().transcript.entries.map((entry) => String(entry.text));

const RELATIVE = DRAWN.filter((section) => /^[ \t]*(?:relative[ \t]*:[ \t]*)?(?:north|south|east|west|up|down)[ \t]+of[ \t]/m.test(section.text));

const ABSOLUTE = DRAWN.filter((section) => !RELATIVE.includes(section));

describe('a drag is a section edit and nothing else (c8)', () => {
  it('reads the locations it is a rule about', () => {
    expect(DRAWN.length).toBeGreaterThan(3);
    expect(RELATIVE.length).toBeGreaterThan(0);
    expect(ABSOLUTE.length).toBeGreaterThan(0);
    expect(DRAWN.every((section) => section.kind === MAPPED_KIND)).toBe(true);
  });

  for (const section of ABSOLUTE) {
    it(`stages ${section.address} where it was dropped, through the same door a typed edit takes`, () => {
      const driver = opened();
      const before = REGISTRY_PLACES.get(section.address)!;
      const moved = movedTo(section, { x: 11.4, y: -6.6 });

      expect(moved).toHaveProperty('line');
      const line = (moved as { line: string }).line;
      expect(line.startsWith(`/dsl ${MAPPED_KIND} ${section.address} `)).toBe(true);

      driver.send(line);
      expect(said(driver)).toContain(`Staged # ${MAPPED_KIND} ${section.address} in local-changes.`);

      expect(withStaged(driver.localChanges()!).get(section.address)).toEqual({ ...before, x: 11, y: -7 });
    });
  }

  for (const section of RELATIVE) {
    it(`refuses to drag ${section.address} with a reason, rather than restating it absolutely`, () => {
      const moved = movedTo(section, { x: 3, y: 3 });

      expect(moved).toHaveProperty('refused');
      expect((moved as { refused: string }).refused).toContain(section.address);
      expect(moved).not.toHaveProperty('line');
    });
  }

  it('is refused whole when the section it carries will not load, and the map does not move', () => {
    const driver = opened();
    const section = ABSOLUTE[0];
    const broken: Section = { ...section, text: `# ${MAPPED_KIND} ${section.address}\nadjacent:\n  nowhere-at-all` };

    driver.send((movedTo(broken, { x: 40, y: 40 }) as { line: string }).line);

    expect(said(driver)).toContain('local changes did not load.');
    expect(driver.localChanges()).toBe('');
    expect(driver.snapshot().view.discovered.find((each) => each.id === section.address)).toEqual(
      opened().snapshot().view.discovered.find((each) => each.id === section.address),
    );
  });

  it('says where a location is, for one that never said', () => {
    const section: Section = { kind: MAPPED_KIND, address: 'made-up.somewhere', text: '# location made-up.somewhere\nstarting\nexamine: Nowhere in particular.', module: 'made-up', staged: false };

    expect(movedTo(section, { x: 2, y: -3 })).toEqual({ line: '/dsl location made-up.somewhere x: 2, y: -3| starting| examine: Nowhere in particular.' });
  });

  it('leaves the floor alone while restating the two axes a drag moves', () => {
    const section: Section = { kind: MAPPED_KIND, address: 'made-up.upstairs', text: '# location made-up.upstairs\nx: 0, y: 0, z: 1\nexamine: A landing.', module: 'made-up', staged: false };

    expect(movedTo(section, { x: 5, y: 6 })).toEqual({ line: '/dsl location made-up.upstairs x: 5, y: 6, z: 1| examine: A landing.' });
  });

  it('refuses a section the map does not draw', () => {
    expect(movedTo({ kind: 'entity', address: 'a.b', text: '# entity a.b', module: 'a', staged: false }, { x: 0, y: 0 })).toHaveProperty('refused');
  });
});

describe('where a drag lets go is where the place is (c8)', () => {
  it('rounds to the units a location can be written in', () => {
    expect(settledOn({ x: 1.49, y: -1.49 })).toEqual({ x: 1, y: -1 });
    expect(settledOn({ x: 1.5, y: -1.5 })).toEqual({ x: 2, y: -1 });
  });

  it('undoes the nudge a place off the drawn floor was drawn with', () => {
    for (const z of [-2, -1, 0, 1, 2]) {
      for (const plane of [-1, 0, 1]) {
        const place = { id: 'a', title: undefined as never, x: 3, y: -4, z, adjacent: [] };

        expect(placedAt(drawnAt(place, plane), z - plane)).toEqual({ x: 3, y: -4 });
      }
    }
  });
});

describe('where the map lets a place go (c8)', () => {
  const drawn = (address: string, climb = 0): Node => {
    const place = REGISTRY_PLACES.get(address)!;
    return { place: { id: address, title: place.title as never, x: place.x, y: place.y, z: place.z, adjacent: [] }, here: false, climb, at: drawnAt({ x: place.x, y: place.y, z: place.z } as never, place.z - climb) };
  };

  const moved = ABSOLUTE[0].address;

  it('turns the pixels a finger carried a place into the line that says where it is', () => {
    const node = drawn(moved);
    const before = REGISTRY_PLACES.get(moved)!;

    const staged = droppedAt(DRAWN, node, { x: PER_UNIT * 3, y: PER_UNIT * -2 });

    expect(staged).toHaveProperty('line');
    expect(withStaged(bodyOf(staged as { line: string })).get(moved)).toEqual({ ...before, x: before.x + 3, y: before.y - 2 });
  });

  for (const climb of [-2, 2]) {
    it(`takes the drawing nudge back out for a place ${Math.abs(climb)} floors ${climb > 0 ? 'up' : 'down'}`, () => {
      const place = REGISTRY_PLACES.get(moved)!;
      const off: Node = { place: { id: moved, title: place.title as never, x: place.x, y: place.y, z: place.z, adjacent: [] }, here: false, climb, at: drawnAt({ ...place, adjacent: [] } as never, place.z - climb) };

      const staged = droppedAt(DRAWN, off, { x: 0, y: 0 });

      expect(withStaged(bodyOf(staged as { line: string })).get(moved)).toEqual(place);
    });
  }

  it('refuses a place the map is drawing that no module declares', () => {
    const stray: Node = { place: { id: 'nowhere.at-all', title: '' as never, x: 0, y: 0, z: 0, adjacent: [] }, here: false, climb: 0, at: { x: 0, y: 0 } };

    expect(droppedAt(DRAWN, stray, { x: 0, y: 0 })).toEqual({ refused: 'the map is drawing nowhere.at-all, which no module declares' });
    expect(placedInto(DRAWN, 'nowhere.at-all', { x: 1, y: 1 })).toHaveProperty('refused');
  });

  it('carries a refusal out of the section itself rather than swallowing it', () => {
    const relative = RELATIVE[0];

    expect(placedInto(DRAWN, relative.address, { x: 5, y: 5 })).toHaveProperty('refused');
  });
});

describe('what a staged edit does from a surface (c8)', () => {
  const watching = (): { act: { send(line: string): void; note(text: string): void }; sent: string[]; said: string[] } => {
    const sent: string[] = [];
    const said: string[] = [];
    return { act: { send: (line) => void sent.push(line), note: (text) => void said.push(text) }, sent, said };
  };

  it('sends a line down the one route and says a refusal out loud', () => {
    const taken = watching();
    answering({ line: '/dsl location a.b x: 1, y: 1' }, taken.act);
    const refused = watching();
    answering({ refused: 'that one is placed relative to another' }, refused.act);

    expect([taken.sent, taken.said]).toEqual([['/dsl location a.b x: 1, y: 1'], []]);
    expect([refused.sent, refused.said]).toEqual([[], ['that one is placed relative to another']]);
  });
});

const lineOf = (staged: ReturnType<typeof joined>, where: string): string => {
  if ('refused' in staged) throw new Error(`${where}: ${staged.refused}`);
  return staged.line;
};

describe('a connection is a section edit and nothing else', () => {
  // Any real drawn location proves the same rule; naming one by hand would go stale the day an author renamed it.
  const REAL_PLACE = DRAWN[0].address;

  const waysOut = (places: Map<string, Location>, address: string): string[] => (places.get(address)?.adjacent ?? []).map((edge) => edge.target).sort();

  const restaged = (section: Section, to: string): { text: string; adjacent: string[] } => {
    const text = bodyOf({ line: lineOf(joined(section, to), section.address) });
    return { text, adjacent: waysOut(withStaged(text), section.address) };
  };

  const stagedSection = (text: string, address: string): Section => addressable([{ name: 'local-changes', text }]).find((each) => each.address === address)!;

  it('is a rule about every location the map draws', () => {
    expect(DRAWN.length).toBeGreaterThan(2);
  });

  // One case per place rather than one loop over all of them: each stages an edit and reloads the universe twice to read it back, and a corpus that grows a region runs the loop out of one test's budget while each place on its own stays quick.
  for (const section of DRAWN) {
    it(`adds a way out of ${section.address} and takes the same one away again`, () => {
      const to = [...REGISTRY_PLACES.keys()].find((id) => id !== section.address && !linksTo(section, id));
      expect(to, section.address).toBeDefined();

      const added = restaged(section, to!);
      expect(added.adjacent, section.address).toContain(to);
      expect(added.adjacent, section.address).toEqual([...waysOut(REGISTRY_PLACES, section.address), to].sort());

      const taken = restaged(stagedSection(added.text, section.address), to!);
      expect(taken.adjacent, section.address).toEqual(waysOut(REGISTRY_PLACES, section.address));
    });
  }

  it('reads a way out that was already written, however it was written', () => {
    for (const section of DRAWN) {
      for (const edge of REGISTRY_PLACES.get(section.address)?.adjacent ?? []) {
        expect(linksTo(section, edge.target), `${section.address} -> ${edge.target}`).toBe(true);
      }
      expect(linksTo(section, 'nowhere-at-all'), section.address).toBe(false);
    }
  });

  it('refuses to take away a way out that was never written, and to draw one on what the map does not draw', () => {
    const alone: Section = { kind: MAPPED_KIND, address: 'made-up.alone', text: '# location made-up.alone\nx: 0, y: 0', module: 'made-up', staged: false };

    expect(unlinkedFrom(alone, REAL_PLACE)).toHaveProperty('refused');
    expect(joined(alone, REAL_PLACE)).toHaveProperty('line');
    expect(linkedTo({ ...alone, kind: 'entity' }, REAL_PLACE)).toHaveProperty('refused');
    expect(joinedInto([alone], 'nowhere.at-all', REAL_PLACE)).toHaveProperty('refused');
  });
});

describe('a new place is written where the map is looking', () => {
  it('reads the point at the middle of the sheet, wherever the sheet has been dragged to', () => {
    const box = { minX: 0, minY: 0, maxX: 2 * PER_UNIT, maxY: 2 * PER_UNIT };

    expect(centredOn({ pan: { x: 0, y: 0 }, zoom: 1, box })).toEqual({ x: 1, y: 1 });
    expect(centredOn({ pan: { x: -PER_UNIT, y: 0 }, zoom: 1, box })).toEqual({ x: 2, y: 1 });
    expect(centredOn({ pan: { x: -PER_UNIT, y: 0 }, zoom: 2, box })).toEqual({ x: 1.5, y: 1 });
  });

  it('writes the plane it was drawn on and leaves the ground plane unsaid', () => {
    expect(lineOf(created('north-shore', { x: 3.4, y: -2.6 }, 0), 'north-shore')).toBe('/dsl location north-shore x: 3, y: -3');
    expect(lineOf(created('north-shore', { x: 0, y: 0 }, 2), 'north-shore')).toBe('/dsl location north-shore x: 0, y: 0, z: 2');
  });

  it('refuses a name the DSL would not take rather than staging a section that will not load', () => {
    for (const name of ['', 'North Shore', 'north shore', '3-shore', 'north.shore']) {
      expect(created(name, { x: 0, y: 0 }, 0), name).toHaveProperty('refused');
    }
  });

  it('stands the author in the place they made, which is the one the map goes on to draw', () => {
    const driver = opened();
    driver.send('/dev on');

    driver.send(lineOf(created('north-shore', { x: 3, y: -3 }, 0), 'north-shore'));
    driver.send(gotoLine(stagedKey('north-shore')));

    expect(said(driver).filter((line) => line.includes('did not load'))).toEqual([]);
    expect(driver.snapshot().view.location.id).toBe('local-changes.north-shore');
    expect(driver.snapshot().view.discovered.map((place) => place.id)).toContain('local-changes.north-shore');
    expect(withStaged(driver.localChanges() ?? '').get('local-changes.north-shore')).toMatchObject({ x: 3, y: -3, z: 0 });
  });

  it('places and connects a place it made, which the map addresses by a key no module spells', () => {
    const driver = opened();
    driver.send('/dev on');
    driver.send(lineOf(created('north-shore', { x: 3, y: -3 }, 0), 'north-shore'));
    driver.send(gotoLine(stagedKey('north-shore')));
    const made = addressable([{ name: 'local-changes', text: driver.localChanges() ?? '' }]).find((each) => each.address === 'north-shore')!;

    expect(names(made.address, stagedKey('north-shore'))).toBe(true);
    expect(placedInto([made], stagedKey('north-shore'), { x: 9, y: 9 })).toHaveProperty('line');
    expect(joined(made, DRAWN[0].address)).toHaveProperty('line');
  });
});

describe('the point of a one-way road', () => {
  it('stands in the middle of it, pointing the way it is walked', () => {
    const points = arrowAt({ x: 0, y: 0 }, { x: 100, y: 0 }).split(' ').map((pair) => pair.split(',').map(Number));

    expect(points[1]).toEqual([55, 0]);
    expect(points[0]![0]).toBeLessThan(points[1]![0]!);
    expect(points[0]![1]).toBe(-points[2]![1]!);
  });

  it('turns with the road, so it points at the far end whichever way that lies', () => {
    const [, tip] = arrowAt({ x: 0, y: 0 }, { x: 0, y: 100 }).split(' ').map((pair) => pair.split(',').map(Number));

    expect(tip).toEqual([0, 55]);
  });
});
