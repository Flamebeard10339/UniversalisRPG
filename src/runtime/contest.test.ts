import { describe, expect, it } from 'vitest';
import { DslError } from '../grammar/parser';
import { nextRandom } from './rng';
import { armAction, armFightAction, createGameState, GameState, grantBuff, hitChance, initResources, PLAYER, resolve } from './runtime';
import { IMPLICIT_TARGET_FULL } from './encounter';
import { Registry } from '../content/registry';
import { loadModule } from '../content/load';
import { secondsToMs, toMilliUnits } from './units';

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

# action strike
title: strike
continuous
rate: us.attack-rate
accuracy: us.attack-skill vs them.dodge
damage: us.attack vs them.dr
depletes: them.health

// The same block from the other end: the rat reads its own accuracy stat where
// the player reads its own, so uses: order is the whole difference.
# action bite
title: bite
continuous
rate: us.attack-rate
accuracy: us.rat-skill vs them.dodge
damage: us.attack vs them.dr
depletes: them.health

# item ring-of-dodging
food, +100 dodge, 60s

# entity player
stats: max-health 1000000, dodge 0, attack 10, attack-skill 100, attack-rate 60
uses: strike

# entity dummy
stats: max-health 1000000, dodge 0

# entity phantom
stats: max-health 1000000, dodge 100

# entity biter
stats: max-health 1000000, dodge 0, attack 10, rat-skill 100, attack-rate 60
uses: bite
`;

const ATTEMPTS = 2000;
const DAMAGE = 10;
const MAX_HEALTH = toMilliUnits(1000000);
const DAMAGE_MILLI = toMilliUnits(DAMAGE);

function loaded(source = MODULE): Registry {
  return loadModule(source);
}

function fighting(registry: Registry, entityId: string): GameState {
  const state = createGameState('arena');
  initResources(state, registry);
  armFightAction('strike', entityId, registry, state);
  return state;
}

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
    expect(hitChance(1500, 0, registry)).toBeLessThan(1);
    expect(hitChance(0, 1500, registry)).toBeGreaterThan(0);
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
    expect(() => loaded('# variable contest-spread\nvalue: -5\n')).toThrow(/must be at least 1/);
  });
});

describe('a contest inside a fight', () => {
  it('lands more often against a target that opposes nothing', () => {
    const registry = loaded();

    const open = fighting(registry, 'dummy');
    resolve(open, registry, secondsToMs(ATTEMPTS));
    const evasive = fighting(registry, 'phantom');
    resolve(evasive, registry, secondsToMs(ATTEMPTS));

    expect(hitsLanded(open, 'dummy') / ATTEMPTS).toBeCloseTo(0.909, 1);
    expect(hitsLanded(evasive, 'phantom') / ATTEMPTS).toBeCloseTo(0.5, 1);
    expect(hitsLanded(open, 'dummy')).toBeGreaterThan(hitsLanded(evasive, 'phantom'));
  });

  it('reads the same evasion stat off the player when the rat is the one swinging', () => {
    const registry = loaded();

    const bare = fighting(registry, 'biter');
    resolve(bare, registry, secondsToMs(ATTEMPTS));

    const nimble = fighting(registry, 'biter');
    grantBuff(nimble, PLAYER, registry.items.get('ring-of-dodging')!, secondsToMs(1e9));
    resolve(nimble, registry, secondsToMs(ATTEMPTS));

    expect(hitsTaken(bare) / ATTEMPTS).toBeCloseTo(0.909, 1);
    expect(hitsTaken(nimble) / ATTEMPTS).toBeCloseTo(0.5, 1);
  });

  it('leaves the player hitting just as hard while dodging — the buff moves one side only', () => {
    const registry = loaded();

    const nimble = fighting(registry, 'biter');
    grantBuff(nimble, PLAYER, registry.items.get('ring-of-dodging')!, secondsToMs(1e9));
    resolve(nimble, registry, secondsToMs(ATTEMPTS));

    expect(hitsLanded(nimble, 'biter') / ATTEMPTS).toBeCloseTo(0.909, 1);
  });

  it('still costs exactly one draw per attempt, contested or not', () => {
    const registry = loaded();
    const state = fighting(registry, 'phantom');
    resolve(state, registry, secondsToMs(ATTEMPTS));

    const reference = createGameState();
    for (let i = 0; i < ATTEMPTS; i++) nextRandom(reference);
    expect(state.rng).toBe(reference.rng);
  });

  it('stays associative across arbitrary splits', () => {
    const registry = loaded();
    const oneShot = fighting(registry, 'biter');
    resolve(oneShot, registry, secondsToMs(600));

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
      for (const t of sorted) resolve(folded, registry, secondsToMs(t));

      expect(folded.rng).toBe(oneShot.rng);
      expect(folded.time).toBe(oneShot.time);
      expect(hitsLanded(folded, 'biter')).toBe(hitsLanded(oneShot, 'biter'));
      expect(folded.resources['health']).toBe(oneShot.resources['health']);
    }
  });

  function fighters(blow: number): Registry {
    return loaded(
      MODULE +
        `
# stat blow
base: ${blow}

# flag fled

# item ring-of-dodging
food, +100 dodge, 60s

# entity player
stats: max-health 1000000, dodge 0, attack 10, attack-skill 100, attack-rate 60, blow ${blow}
uses: strike, test-pool

# action test-pool
title: test-pool
rate: us.attack-rate
damage: us.blow
depletes: them.health

# location arena
+entities: test-fighter

# entity test-fighter
stats: max-health 100000, dodge 0

# entity striker
stats: max-health 100000, dodge 0, blow ${blow}, attack-rate 60
test-implicit:
  rate: attack-rate
  damage: blow
  attempts: 5
test-escaper:
  rate: attack-rate
  damage: blow
  attempts: 2
  on unfinished:
    set: fled
`
    );
  }

  function poolSpentPerAttempt(registry: Registry, attempts: number): number {
    const state = createGameState('arena');
    initResources(state, registry);
    armFightAction('test-pool', 'test-fighter', registry, state);
    resolve(state, registry, secondsToMs(attempts));
    const foe = state.activeAction!.actors!['test-fighter'];
    return (toMilliUnits(100000) - foe.resources['health']) / attempts;
  }

  it('unify-action-health-into-target: a target: hit spends the authored ability at its authored scale (runtime-2026-07-30-m2)', () => {
    expect(poolSpentPerAttempt(fighters(2.5), 4)).toBe(toMilliUnits(2.5));
    expect(poolSpentPerAttempt(fighters(0.4), 2)).toBe(toMilliUnits(0.4));
  });

  it('escapes a deterministic fight on its attempt count, not on an emptied pool', () => {
    const registry = fighters(0.4);
    const state = createGameState('arena');
    initResources(state, registry);
    armAction('entity', 'striker', 'test-escaper', registry, state);

    resolve(state, registry, secondsToMs(2));
    expect(state.activeAction).toBeNull();
    expect(state.flags['fled']).toBe(true);
  });

  it('keeps a hit above zero when the ability stat reads zero', () => {
    expect(poolSpentPerAttempt(fighters(0), 2)).toBe(1);
  });

  it('unify-action-health-into-target: the implicit target spends it at the same scale (runtime-2026-07-30-m2)', () => {
    const registry = fighters(0.4);
    const state = createGameState('arena');
    initResources(state, registry);
    armAction('entity', 'striker', 'test-implicit', registry, state);
    resolve(state, registry, secondsToMs(2));

    const spent = IMPLICIT_TARGET_FULL - state.activeAction!.implicitTarget;
    expect(spent / 2).toBe(toMilliUnits(0.4));
    expect(spent / 2).toBe(poolSpentPerAttempt(fighters(0.4), 2));
  });
});
