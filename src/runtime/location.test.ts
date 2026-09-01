import { describe, expect, it } from 'vitest';
import { Direction, Location, location as locationSection, recursivelyResolveRelativeCoordinates } from '../content/sections/location';
import { Authored, hydrateSection } from '../grammar/section';
import { loadModule } from '../content/load';
import { apply, startSession, view } from './session';

function loc(id: string, over: Partial<Location> = {}): Location {
  return { id, x: 0, y: 0, z: 0, title: id, entities: [], adjacent: [], flags: [], actions: [], starting: false, ...over };
}

function relative(id: string, direction: Direction, of: string): Location {
  return loc(id, { relative: { direction, of } });
}

function place(...locations: Location[]): Map<string, Location> {
  const map = new Map(locations.map((location) => [location.id, location]));
  recursivelyResolveRelativeCoordinates(map);
  return map;
}

describe('recursivelyResolveRelativeCoordinates', () => {
  it('leaves an absolute location untouched', () => {
    const map = place(loc('home', { x: 3, y: -2, z: 1 }));
    expect(map.get('home')).toMatchObject({ x: 3, y: -2, z: 1 });
  });

  it('places each direction one unit off its origin', () => {
    const map = place(
      loc('home', { x: 0, y: 0, z: 0 }),
      relative('n', 'north', 'home'),
      relative('s', 'south', 'home'),
      relative('e', 'east', 'home'),
      relative('w', 'west', 'home'),
      relative('u', 'up', 'home'),
      relative('d', 'down', 'home'),
    );
    expect(map.get('n')).toMatchObject({ x: 0, y: -1, z: 0 });
    expect(map.get('s')).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(map.get('e')).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(map.get('w')).toMatchObject({ x: -1, y: 0, z: 0 });
    expect(map.get('u')).toMatchObject({ x: 0, y: 0, z: 1 });
    expect(map.get('d')).toMatchObject({ x: 0, y: 0, z: -1 });
  });

  it('resolves a chain whose origin is itself relative, regardless of order', () => {
    const map = place(relative('far', 'east', 'near'), relative('near', 'east', 'home'), loc('home'));
    expect(map.get('near')).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(map.get('far')).toMatchObject({ x: 2, y: 0, z: 0 });
  });

  it('throws on a relative reference to an unknown origin', () => {
    expect(() => place(relative('beach', 'east', 'nowhere'))).toThrow(/unknown location 'nowhere'/);
  });

  it('resolves hydrated locations, whose coordinates are read-only getters', () => {
    const home = hydrateSection({ id: 'home' } as Authored<Location>, locationSection.schema as never);
    const east = hydrateSection({ id: 'east-of-home', relative: { direction: 'east', of: 'home' } } as Authored<Location>, locationSection.schema as never);
    expect(() => {
      (east as { x: number }).x = 99;
    }).toThrow(TypeError);

    const map = place(home, east);
    expect(map.get('east-of-home')).toMatchObject({ x: 1, y: 0, z: 0 });
  });

  it('throws on a relative cycle', () => {
    expect(() => place(relative('a', 'east', 'b'), relative('b', 'west', 'a'))).toThrow(/cycle/);
  });
});

const WITH_ACTIONS = `
# location shore
x: 0, y: 0
starting
flags: searched
search tideline:
  time: 2
  give: 1 driftwood
  set: searched
light beacon:
  requires: searched
  say: The beacon catches.

# item driftwood
examine: Salt-bleached and dry.
`;

describe('a location’s own actions', () => {
  it('parses them and offers them beside the entities standing there', () => {
    const registry = loadModule(WITH_ACTIONS);
    expect(registry.locations.get('shore')!.actions.map((a) => a.label)).toEqual(['search tideline', 'light beacon']);

    const session = startSession(registry);
    const ids = view(session).choices.map((c) => c.id);
    expect(ids).toContain('use:location.shore.search-tideline');
    expect(ids).toContain('use:location.shore.light-beacon');
  });

  it('offers one whose requires: does not stand, and refuses it when it is taken', () => {
    const session = startSession(loadModule(WITH_ACTIONS));

    const v = apply(session, 'use:location.shore.light-beacon');
    expect(v.said).toHaveLength(1);
    expect(String(v.said[0])).not.toContain('The beacon catches.');
    expect(v.time).toBe(0);
  });

  it('runs one, scoping its bare references to the location that owns it', () => {
    const session = startSession(loadModule(WITH_ACTIONS));

    const v = apply(session, 'use:location.shore.search-tideline');
    expect(v.inventory['driftwood']).toBe(1);
    expect(v.flags['shore.searched']).toBe(true);
    expect(v.time).toBe(2);
    expect(v.choices.map((c) => c.id)).toContain('use:location.shore.light-beacon');
  });
});
