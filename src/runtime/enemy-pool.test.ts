import { describe, expect, it } from 'vitest';
import { armFightAction, createGameState, GameState, initResources, resolve } from './runtime';
import { Registry } from '../content/registry';
import { loadModule } from '../content/load';
import { secondsToMs } from './units';

const MODULE = `
# stat attack
base: 5

# stat swing-rate
base: 60

# stat max-vigor
base: 30

# stat foe-regen
base: 7

# stat foe-max
base: 100

# resource vigor
max: max-vigor

# resource stamina
rate: foe-regen
max: foe-max

# event spending
resource: vigor
trigger: on empty

# flag spent

# item trophy

# location pit
x: 0, y: 0
starting
entities: 3 brute

# action wear-down
title: wear-down
rate: my swing-rate
damage: my attack
depletes: their stamina

# action grind-down
title: grind-down
continuous
rate: my swing-rate
damage: my attack
depletes: their stamina
give: trophy
on success:
  drain: 12 vigor

# entity player
stats: max-vigor 30, attack 5, swing-rate 60
uses: wear-down, grind-down
on spending:
  say: You are spent.
  set: spent
  stop

# entity brute
stats: foe-max 100, foe-regen 7
`;

function fighting(registry: Registry, label: string): GameState {
  const state = createGameState('pit');
  initResources(state, registry);
  armFightAction(label, 'brute', registry, state);
  return state;
}

function splitPoints(seed: number, horizon: number): number[][] {
  let value = seed;
  const rand = (): number => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
  const runs: number[][] = [];
  for (let trial = 0; trial < 25; trial++) {
    const waypoints = new Set<number>();
    for (let i = 0; i < 3 + Math.floor(rand() * 5); i++) waypoints.add(rand() * horizon);
    const sorted = [...waypoints].filter((t) => t > 0 && t < horizon).sort((a, b) => a - b);
    sorted.push(horizon);
    runs.push(sorted);
  }
  return runs;
}

describe('a regenerating enemy pool settles like the player\'s', () => {
  const OPENS = 2;
  const HORIZON = 13;

  function underway(registry: Registry): GameState {
    const state = fighting(registry, 'wear-down');
    resolve(state, registry, secondsToMs(OPENS));
    return state;
  }

  it('reaches the same level and carries the same remainder however the span is split', () => {
    const registry = loadModule(MODULE);

    const oneShot = underway(registry);
    resolve(oneShot, registry, secondsToMs(HORIZON));
    const foe = oneShot.activeAction!.actors!['brute'];
    expect(foe.resources['stamina']).toBe(36516);
    expect(foe.rateRemainders['stamina']).toBeGreaterThan(0);

    for (const run of splitPoints(7, HORIZON).map((run) => run.filter((t) => t > OPENS))) {
      const folded = underway(registry);
      for (const t of run) resolve(folded, registry, secondsToMs(t));
      resolve(folded, registry, secondsToMs(HORIZON));
      const foldedFoe = folded.activeAction!.actors!['brute'];
      expect(foldedFoe.resources['stamina']).toBe(foe.resources['stamina']);
      expect(foldedFoe.rateRemainders['stamina']).toBe(foe.rateRemainders['stamina']);
      expect(folded.time).toBe(oneShot.time);
    }
  });
});

describe('a fight pool emptied by a result, not by the hit that opened the segment', () => {
  const HORIZON = 200;

  it('fires on empty: at the drained instant, not at the end of the segment', () => {
    const registry = loadModule(MODULE);

    const oneShot = fighting(registry, 'grind-down');
    resolve(oneShot, registry, secondsToMs(HORIZON));

    expect(oneShot.inventory['trophy']).toBe(3);
    expect(oneShot.flags['spent']).toBe(true);
    expect(oneShot.activeAction).toBeNull();
  });

  it('stays associative across split resolution', () => {
    const registry = loadModule(MODULE);
    const oneShot = fighting(registry, 'grind-down');
    resolve(oneShot, registry, secondsToMs(HORIZON));

    for (const run of splitPoints(23, HORIZON)) {
      const folded = fighting(registry, 'grind-down');
      for (const t of run) resolve(folded, registry, secondsToMs(t));
      expect(folded.inventory).toEqual(oneShot.inventory);
      expect(folded.flags).toEqual(oneShot.flags);
      expect(folded.resources['vigor']).toBe(oneShot.resources['vigor']);
      expect(folded.activeAction).toEqual(oneShot.activeAction);
    }
  });
});

const STILLBORN = `
# stat attack
base: 5

# stat swing-rate
base: 60

# stat foe-max
base: 100

# resource stamina
max: foe-max

# event collapse
resource: stamina
trigger: on empty

# item trophy

# action wear-down
title: wear-down
rate: my swing-rate
damage: my attack
depletes: their stamina

# entity player
stats: attack 5, swing-rate 60
uses: wear-down

# entity brute
stats: foe-max 100
on collapse:
  credit:
    give: 1 trophy

# entity wisp
stats: foe-max 0
on collapse:
  credit:
    give: 1 trophy

# location pit
x: 0, y: 0
starting
entities: brute, wisp
`;

describe('a pool fires on empty: by falling to nothing', () => {
  const swungAt = (registry: Registry, foe: string): GameState => {
    const state = createGameState('pit');
    initResources(state, registry);
    armFightAction('wear-down', foe, registry, state);
    resolve(state, registry, secondsToMs(60));
    return state;
  };

  it('pays out for the foe that had something to lose, and not for the one that never did', () => {
    const registry = loadModule(STILLBORN);

    const brute = swungAt(registry, 'brute');
    expect(brute.inventory['trophy']).toBe(1);
    expect(brute.activeAction).toBeNull();

    const wisp = swungAt(registry, 'wisp');
    expect(wisp.inventory['trophy'] ?? 0, 'nothing fell, so nothing emptied — the blow does not decide this').toBe(0);
    expect(wisp.activeAction, 'it is taken out of the fight all the same').toBeNull();
  });
});
