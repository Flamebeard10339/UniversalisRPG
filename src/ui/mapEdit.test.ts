import { describe, expect, it } from 'vitest';
import type { Location } from '../content/sections/location';
import { loadUniverseWithDiagnostics } from '../content/load';
import { addressable, MAPPED_KIND, NOWHERE, offeredBy, type Section } from './authoringSurface';
import { drawnAt, PER_UNIT, placedAt, type Node } from './discovery';
import { createDriver, type Driver } from './driver';
import { answering, droppedAt, movedTo, placedInto, settledOn } from './mapEdit';
import { SHIPPED_SOURCES } from './shippedContent';

const addressed = addressable(SHIPPED_SOURCES);

const DRAWN = offeredBy(addressed, NOWHERE, 'map');

const shipped = (): Map<string, Location> => loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry.locations;

const withStaged = (local: string): Map<string, Location> =>
  loadUniverseWithDiagnostics([...SHIPPED_SOURCES, { name: 'local-changes', text: local }]).registry.locations;

const opened = (): Driver => createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined });

const REGISTRY_PLACES = shipped();

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
      const before = shipped().get(section.address)!;
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
    const before = shipped().get(moved)!;

    const staged = droppedAt(DRAWN, node, { x: PER_UNIT * 3, y: PER_UNIT * -2 });

    expect(staged).toHaveProperty('line');
    expect(withStaged(bodyOf(staged as { line: string })).get(moved)).toEqual({ ...before, x: before.x + 3, y: before.y - 2 });
  });

  for (const climb of [-2, 2]) {
    it(`takes the drawing nudge back out for a place ${Math.abs(climb)} floors ${climb > 0 ? 'up' : 'down'}`, () => {
      const place = shipped().get(moved)!;
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
