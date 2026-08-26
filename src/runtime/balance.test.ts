import { describe, expect, it } from 'vitest';
import { loadModule, loadUniverseWithDiagnostics } from '../content/load';
import { shippedSources } from '../content/shipped';
import { describeInversion, encounters, inversions, placements, threatOf } from './balance';
import { createGameState } from './state';

// One world, arranged so every claim below can move one thing and watch the answer change: three
// locations in a line out of the gate, an island no road reaches, and a foe for each shape a foe
// can take. The reference actor is `# entity player`, which is what the engine calls the player.
const WORLD = `
# stat attack
base: 10

# stat defense
base: 0

# stat swing-rate
base: 60

# stat mending
base: 0

# stat max-life

# resource life
rate: mending
max: max-life

# action strike
title: Strike
continuous
rate: my swing-rate
damage: my attack vs their defense
depletes: their life

# action shout
title: Shout
instant
say: Hoy!

# location gate
x: 0, y: 0
starting
adjacent:
  road

# location road
x: 1, y: 0
adjacent:
  gate
  far

# location far
x: 2, y: 0
adjacent:
  road

# location island
x: 9, y: 9

# entity player
stats: max-life 100, attack 10, swing-rate 60, mending 6
uses: strike

# entity meek
stats: max-life 10, attack 1, swing-rate 60
aggressive
uses: strike

# entity brute
stats: max-life 200, attack 30, swing-rate 60
aggressive
uses: strike

# entity bystander
stats: max-life 10, attack 1, swing-rate 60
uses: strike

# entity heckler
stats: max-life 10, attack 1, swing-rate 60
aggressive
uses: shout

# entity captain
stats: max-life 10, attack 1, swing-rate 60
aggressive
uses: strike
allies:
  2 brute

# entity unkillable
stats: max-life 10, attack 30, defense 10, mending 120, swing-rate 60
aggressive
uses: strike

# entity harmless
stats: max-life 10, attack 0, swing-rate 60
aggressive
uses: strike
`;

const world = (placed: Record<string, string>): ReturnType<typeof loadModule> =>
  loadModule(Object.entries(placed).reduce((text, [at, standing]) => text.replace(`# location ${at}\n`, `# location ${at}\nentities:\n  ${standing}\n`), WORLD));

const named = (registry: ReturnType<typeof loadModule>): string[] => encounters(registry).map((found) => found.entity);

describe('what the world picks a fight with', () => {
  it('counts a foe that comes at you unbidden', () => {
    expect(named(world({ road: 'meek' }))).toEqual(['meek']);
  });

  it('leaves out a foe you have to start it with', () => {
    expect(named(world({ road: 'bystander' }))).toEqual([]);
  });

  it('leaves out a foe that brings nothing to swing', () => {
    expect(named(world({ road: 'heckler' }))).toEqual([]);
  });

  it('leaves out a foe standing where no road reaches', () => {
    expect(named(world({ island: 'meek' }))).toEqual([]);
  });

  it('stands an ally where whoever brings it stands', () => {
    expect(placements(world({ road: 'captain' })).get('brute')).toEqual({ at: 'road', depth: 1 });
  });

  it('stands a foe at the shallowest place it is found', () => {
    expect(placements(world({ road: 'meek', far: 'meek' })).get('meek')).toEqual({ at: 'road', depth: 1 });
  });
});

describe('how hard a fight is', () => {
  const state = createGameState();

  it('rates a foe that mends faster than it is cut above every foe that can be finished', () => {
    const registry = world({ road: 'unkillable' });
    expect(threatOf(registry, state, 'unkillable')).toBe(Infinity);
    expect(threatOf(registry, state, 'brute')).toBeLessThan(Infinity);
  });

  it('rates a foe whose blows never outpace what they mend at nothing', () => {
    expect(threatOf(world({ road: 'harmless' }), state, 'harmless')).toBe(0);
  });

  it('rates a foe that hits harder and lasts longer above one that does neither', () => {
    const registry = world({ road: 'meek', far: 'brute' });
    expect(threatOf(registry, state, 'brute')).toBeGreaterThan(threatOf(registry, state, 'meek'));
  });
});

describe('difficulty does not fall away as the world opens out', () => {
  it('names a fight harder than everything past it', () => {
    const found = inversions(world({ road: 'brute', far: 'meek' }));
    expect(found.map((one) => one.encounter.entity)).toEqual(['brute']);
    expect(describeInversion(found[0]!)).toContain('meek');
  });

  it('lets the last fight in the world be the hardest one', () => {
    expect(inversions(world({ road: 'meek', far: 'brute' }))).toEqual([]);
  });

  it('does not order two fights the same road out', () => {
    expect(inversions(world({ road: 'meek, brute' }))).toEqual([]);
  });

  it('holds across the shipped world', () => {
    const { registry } = loadUniverseWithDiagnostics(shippedSources());
    expect(inversions(registry).map(describeInversion)).toEqual([]);
  });
});
