import { describe, expect, it } from 'vitest';
import { Direction, Location, resolveCoordinates } from './location';

function loc(id: string, over: Partial<Location> = {}): Location {
  return { id, x: 0, y: 0, z: 0, title: id, entities: [], adjacent: [], starting: false, ...over };
}

function relative(id: string, direction: Direction, of: string): Location {
  return loc(id, { relative: { direction, of } });
}

function place(...locations: Location[]): Map<string, Location> {
  const map = new Map(locations.map((location) => [location.id, location]));
  resolveCoordinates(map);
  return map;
}

describe('resolveCoordinates', () => {
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
    expect(map.get('n')).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(map.get('s')).toMatchObject({ x: 0, y: -1, z: 0 });
    expect(map.get('e')).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(map.get('w')).toMatchObject({ x: -1, y: 0, z: 0 });
    expect(map.get('u')).toMatchObject({ x: 0, y: 0, z: 1 });
    expect(map.get('d')).toMatchObject({ x: 0, y: 0, z: -1 });
  });

  it('resolves a chain whose origin is itself relative, regardless of order', () => {
    // 'far' is placed relative to 'near', which parses after it.
    const map = place(relative('far', 'east', 'near'), relative('near', 'east', 'home'), loc('home'));
    expect(map.get('near')).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(map.get('far')).toMatchObject({ x: 2, y: 0, z: 0 });
  });

  it('throws on a relative reference to an unknown origin', () => {
    expect(() => place(relative('beach', 'east', 'nowhere'))).toThrow(/unknown location 'nowhere'/);
  });

  it('throws on a relative cycle', () => {
    expect(() => place(relative('a', 'east', 'b'), relative('b', 'west', 'a'))).toThrow(/cycle/);
  });
});
