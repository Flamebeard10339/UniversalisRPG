import { describe, expect, it } from 'vitest';
import { DslError } from '../grammar/parser';
import { point } from '../grammar/range';
import { nextRandom } from './rng';
import { armAction, createGameState, GameState, hitChance, initResources, resolve } from './runtime';
import { loadModule, Registry } from '../content/registry';
import { secondsToMs, toMilliUnits } from './units';

// Three entities differing only in what they oppose the player with: `dummy`
// does not dodge, `phantom` matches the player exactly, `biter` swings back.
const MODULE = `
# stat attack
base: 10

# stat dr

# stat dodge

# stat attack-skill
base: 100

# stat rat-skill
base: 100

# stat attack-rate
base: 60

# stat max-health
base: 1000000

# stat regeneration

# resource health
rate: regeneration
max: max-health

# location arena
x: 0, y: 0
starting
entities: dummy, phantom, biter

# entity dummy
stats: max-health 1000000, dodge 0
strike:
  repeating
  time: 60
  speed: attack-rate
  target: health
  accuracy: attack-skill
  evasion: dodge
  ability: attack
  dr: dr

# entity phantom
stats: max-health 1000000, dodge 100
strike:
  repeating
  time: 60
  speed: attack-rate
  target: health
  accuracy: attack-skill
  evasion: dodge
  ability: attack
  dr: dr

# entity biter
stats: max-health 1000000, dodge 0
strike:
  repeating
  time: 60
  speed: attack-rate
  target: health
  accuracy: attack-skill
  evasion: dodge
  ability: attack
  dr: dr
bite:
  retaliates
  time: 60
  speed: attack-rate
  target: health
  accuracy: rat-skill
  evasion: dodge
  ability: attack
  dr: dr
`;

const ATTEMPTS = 2000; // one per second at 60/min
const DAMAGE = 10; // attack 10 - dr 0, both unranged
const MAX_HEALTH = toMilliUnits(1000000);
const DAMAGE_MILLI = toMilliUnits(DAMAGE);

function loaded(source = MODULE): Registry {
  return loadModule(source);
}

function fighting(registry: Registry, entityId: string): GameState {
  const state = createGameState('arena');
  initResources(state, registry);
  armAction('entity', entityId, 'strike', registry, state);
  return state;
}

// Hits are the only thing that moves the pool and each lands for a flat 10.
function hitsLanded(state: GameState, entityId: string): number {
  const pool = state.activeAction!.actors![entityId].resources.health;
  return (MAX_HEALTH - pool) / DAMAGE_MILLI;
}

function hitsTaken(state: GameState): number {
  return (MAX_HEALTH - state.resources['health']) / DAMAGE_MILLI;
}

describe('the opposed roll', () => {
  const registry = loaded();

  it('puts equal stats at a coin flip and a spread of advantage at ~91%', () => {
    expect(hitChance(100, 100, registry)).toBeCloseTo(0.5, 12);
    expect(hitChance(100, 0, registry)).toBeCloseTo(0.909, 3);
    expect(hitChance(200, 0, registry)).toBeCloseTo(0.99, 3);
    expect(hitChance(0, 100, registry)).toBeCloseTo(0.0909, 4);
  });

  it('reads only the gap, not the magnitudes', () => {
    expect(hitChance(1040, 1000, registry)).toBeCloseTo(hitChance(40, 0, registry), 12);
  });

  it('is symmetric — swapping the two sides gives the complement', () => {
    for (const [a, e] of [
      [100, 0],
      [37, 812],
      [5, 5],
    ]) {
      expect(hitChance(a, e, registry) + hitChance(e, a, registry)).toBeCloseTo(1, 12);
    }
  });

  it('closes on certainty without reaching it, across any gap that can occur in play', () => {
    // 15 spreads of advantage is already one loss in 10^15.
    expect(hitChance(1500, 0, registry)).toBeLessThan(1);
    expect(hitChance(0, 1500, registry)).toBeGreaterThan(0);
    // Asymptotic in exact arithmetic but not in a double: past ~16 spreads the
    // near side rounds to 1, which the [0, 1) uniform reads as "always hits".
    expect(hitChance(1700, 0, registry)).toBe(1);
  });

  it('sharpens or flattens with contest-spread', () => {
    const sharp = loaded('# variable contest-spread\nvalue: 10\n');
    const flat = loaded('# variable contest-spread\nvalue: 1000\n');
    expect(hitChance(140, 100, sharp)).toBeCloseTo(0.9999, 4);
    expect(hitChance(140, 100, flat)).toBeCloseTo(0.523, 3);
  });

  it('rejects a spread that cannot divide a gap', () => {
    expect(() => loaded('# variable contest-spread\nvalue: 0\n')).toThrow(DslError);
    expect(() => loaded('# variable contest-spread\nvalue: -5\n')).toThrow(/must be positive/);
  });
});

describe('a contest inside a fight', () => {
  it('lands more often against a target that opposes nothing', () => {
    const registry = loaded();

    const open = fighting(registry, 'dummy');
    resolve(open, registry, ATTEMPTS);
    const evasive = fighting(registry, 'phantom');
    resolve(evasive, registry, ATTEMPTS);

    // Only the target's `dodge` differs, so this pins `evasion:` to the TARGET.
    expect(hitsLanded(open, 'dummy') / ATTEMPTS).toBeCloseTo(0.909, 1);
    expect(hitsLanded(evasive, 'phantom') / ATTEMPTS).toBeCloseTo(0.5, 1);
    expect(hitsLanded(open, 'dummy')).toBeGreaterThan(hitsLanded(evasive, 'phantom'));
  });

  it('reads the same evasion stat off the player when the rat is the one swinging', () => {
    const registry = loaded();

    const bare = fighting(registry, 'biter');
    resolve(bare, registry, ATTEMPTS);

    const nimble = fighting(registry, 'biter');
    // A ring of dodging: +100 closes the rat's 100-point skill advantage to nil.
    nimble.activeBuffs['ring:dodge'] = { statId: 'dodge', kind: 'added', amount: point(100), expiresAt: secondsToMs(1e9) };
    resolve(nimble, registry, ATTEMPTS);

    expect(hitsTaken(bare) / ATTEMPTS).toBeCloseTo(0.909, 1);
    expect(hitsTaken(nimble) / ATTEMPTS).toBeCloseTo(0.5, 1);
  });

  it('leaves the player hitting just as hard while dodging — the buff moves one side only', () => {
    const registry = loaded();

    const nimble = fighting(registry, 'biter');
    nimble.activeBuffs['ring:dodge'] = { statId: 'dodge', kind: 'added', amount: point(100), expiresAt: secondsToMs(1e9) };
    resolve(nimble, registry, ATTEMPTS);

    // The player's own `evasion: dodge` reads the BITER's dodge, not their buff.
    expect(hitsLanded(nimble, 'biter') / ATTEMPTS).toBeCloseTo(0.909, 1);
  });

  it('still costs exactly one draw per attempt, contested or not', () => {
    const registry = loaded();
    const state = fighting(registry, 'phantom');
    resolve(state, registry, ATTEMPTS);

    // The reference cursor steps through nextRandom itself: restating the LCG
    // here would pin this test to the implementation (rng.test.ts checks that).
    const reference = createGameState();
    for (let i = 0; i < ATTEMPTS; i++) nextRandom(reference);
    expect(state.rng).toBe(reference.rng);
  });

  it('stays associative across arbitrary splits', () => {
    const registry = loaded();
    const oneShot = fighting(registry, 'biter');
    resolve(oneShot, registry, 600);

    let seed = 31;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 20; trial++) {
      const waypoints = new Set<number>();
      for (let i = 0; i < 3 + Math.floor(rand() * 6); i++) waypoints.add(rand() * 600);
      const sorted = [...waypoints].filter((t) => t > 0 && t < 600).sort((a, b) => a - b);
      sorted.push(600);

      const folded = fighting(registry, 'biter');
      for (const t of sorted) resolve(folded, registry, t);

      expect(folded.rng).toBe(oneShot.rng);
      expect(folded.time).toBe(oneShot.time);
      expect(hitsLanded(folded, 'biter')).toBe(hitsLanded(oneShot, 'biter'));
      expect(folded.resources['health']).toBe(oneShot.resources['health']);
    }
  });
});
