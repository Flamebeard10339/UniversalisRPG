import { describe, expect, it } from 'vitest';
import type { Location } from '../content/location';
import { loadUniverseWithDiagnostics } from '../content/registry';
import { addressable, MAPPED_KIND, NOWHERE, offeredBy, type Section } from './authoringSurface';
import { drawnAt, placedAt } from './discovery';
import { createDriver, type Driver } from './driver';
import { movedTo, settledOn } from './mapEdit';
import { SHIPPED_SOURCES } from './shippedContent';

const SECTIONS = addressable(SHIPPED_SOURCES);

// Every location the shipped content draws, taken off the map surface rather
// than named: a location added to content/ tomorrow is dragged here too.
const DRAWN = offeredBy(SECTIONS, NOWHERE, 'map');

const shipped = (): Map<string, Location> => loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry.locations;

// What the load path made of the modules with one edit staged over them. The
// registry rather than the view, because a location the player has not
// discovered is still a location an author can move.
const withStaged = (local: string): Map<string, Location> =>
  loadUniverseWithDiagnostics([...SHIPPED_SOURCES, { name: 'local-changes', text: local }]).registry.locations;

const opened = (): Driver => createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined });

const said = (driver: Driver): string[] => driver.snapshot().transcript.entries.map((entry) => String(entry.text));

// A location whose position is a fact about another one, found rather than
// named so the case survives the tutorial being rewritten.
const RELATIVE = DRAWN.filter((section) => /^[ \t]*(?:relative[ \t]*:[ \t]*)?(?:north|south|east|west|up|down)[ \t]+of[ \t]/m.test(section.text));

const ABSOLUTE = DRAWN.filter((section) => !RELATIVE.includes(section));

describe('a drag is a section edit and nothing else (c8)', () => {
  it('reads the locations it is a rule about', () => {
    expect(DRAWN.length).toBeGreaterThan(3);
    expect(RELATIVE.length).toBeGreaterThan(0);
    expect(ABSOLUTE.length).toBeGreaterThan(0);
    expect(DRAWN.every((section) => section.kind === MAPPED_KIND)).toBe(true);
  });

  // The whole of it, per location: what a drag produces is a `/dsl` line, the
  // line goes through the driver, and what came out the far end is the same
  // location standing somewhere else.
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

      // The coordinates the drag settled on, the floor left where it was, and
      // everything else the section says still saying it.
      expect(withStaged(driver.localChanges()!).get(section.address)).toEqual({ ...before, x: 11, y: -7 });
    });
  }

  for (const section of RELATIVE) {
    it(`refuses to drag ${section.address} with a reason, rather than restating it absolutely`, () => {
      const moved = movedTo(section, { x: 3, y: 3 });

      expect(moved).toHaveProperty('refused');
      expect((moved as { refused: string }).refused).toContain(section.address);
      // Nothing was produced to send, so there is no coordinate on its way to
      // the registry to be silently adopted.
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
    expect(driver.snapshot().view?.discovered.find((each) => each.id === section.address)).toEqual(
      opened().snapshot().view?.discovered.find((each) => each.id === section.address),
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

  // The drawing nudges a place that is not on the floor being looked at, so a
  // drag has to come back through the nudge before it says where the place is.
  it('undoes the nudge a place off the drawn floor was drawn with', () => {
    for (const z of [-2, -1, 0, 1, 2]) {
      for (const plane of [-1, 0, 1]) {
        const place = { id: 'a', title: undefined as never, x: 3, y: -4, z, adjacent: [] };

        expect(placedAt(drawnAt(place, plane), z - plane)).toEqual({ x: 3, y: -4 });
      }
    }
  });
});
