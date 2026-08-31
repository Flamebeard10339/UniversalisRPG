import { describe, expect, it } from 'vitest';
import { Registry } from '../content/registry';
import { loadModule } from '../content/load';
import { applyResultsNow, createGameState, GameState, initResources, PLAYER, statRange, statValue } from './runtime';
import { point } from '../grammar/range';
import { FIRST_LEVEL_COST, LEVELS_PER_DOUBLING, skillLevel, xpForLevel } from './skills';

const MODULE = `
# stat attack
base: 10

# stat dodge
base: 50

# stat max-stamina
base: 20

# stat haggle
base: 10

# stat grudge-power
base: 10

# resource stamina
max: max-stamina
rate: dodge

# skill brawling
tags: +1 attack per level of brawling

# skill footwork
tags: +2% dodge per level of footwork

# skill lore

# skill haggling
tags: +2-5 haggle per level of haggling

# skill grudge
tags: -3% grudge-power per level of grudge

# entity player
title: You
stats: attack 10
skills: brawling, footwork, haggling, grudge

# entity rat
stats: attack 3
skills: brawling, brawling

# entity mannequin
stats: attack 3
`;

const loaded = (): Registry => loadModule(MODULE);

function withXp(xp: Record<string, number>): GameState {
  const state = createGameState('nowhere');
  state.xp = xp;
  return state;
}

describe('the xp curve', () => {
  it('costs the first level what the curve declares, and doubles that cost every doubling span', () => {
    const cost = (level: number): number => xpForLevel(level + 1) - xpForLevel(level);
    expect(cost(1)).toBe(FIRST_LEVEL_COST);
    for (const doublings of [1, 2, 3, 10]) expect(cost(1 + doublings * LEVELS_PER_DOUBLING)).toBe(FIRST_LEVEL_COST * 2 ** doublings);
  });

  it('rises on every level rather than resting flat inside a doubling span', () => {
    for (let level = 1; level < 60; level += 1) {
      const cost = xpForLevel(level + 1) - xpForLevel(level);
      const next = xpForLevel(level + 2) - xpForLevel(level + 1);
      expect(next).toBeGreaterThan(cost);
    }
  });

  it('rounds a threshold up, so a level never costs less than the curve prices it, and the rounding never accumulates', () => {
    const ratio = 2 ** (1 / LEVELS_PER_DOUBLING);
    for (let level = 2; level < 200; level += 1) {
      const priced = (FIRST_LEVEL_COST * (ratio ** (level - 1) - 1)) / (ratio - 1);
      expect(xpForLevel(level)).toBeGreaterThanOrEqual(priced);
      expect(xpForLevel(level) - priced).toBeLessThan(1);
    }
  });

  it('starts every skill at level 1, which the first threshold is zero xp for', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(skillLevel(0)).toBe(1);
    expect(skillLevel(xpForLevel(2) - 1)).toBe(1);
    expect(skillLevel(xpForLevel(2))).toBe(2);
  });

  it('decides a level by integer comparison at thresholds across several doubling spans', () => {
    for (const level of [2, 3, 5, 9, 10, 11, 12, 20, 21, 25, 30, 31, 50, 75, 100, 101, 200]) {
      const threshold = xpForLevel(level);
      expect(Number.isInteger(threshold)).toBe(true);
      expect(skillLevel(threshold)).toBe(level);
      expect(skillLevel(threshold - 1)).toBe(level - 1);
    }
  });

  it('agrees with the accumulated curve at every level, not only at its thresholds', () => {
    let expected = 1;
    for (let xp = 0; xp <= 60000; xp += 37) {
      while (xp >= xpForLevel(expected + 1)) expected += 1;
      expect(skillLevel(xp)).toBe(expected);
    }
  });

  it('takes any negative total as no progress, including one past where the curve stops being real', () => {
    expect([-1, -13000, -13929, -20000, -1e9].map(skillLevel)).toEqual([1, 1, 1, 1, 1]);
  });

  it('holds the threshold guarantee across every level a threshold is an exact integer for', () => {
    let level = 2;
    for (; Number.isSafeInteger(xpForLevel(level)); level += 1) {
      expect(skillLevel(xpForLevel(level))).toBe(level);
      expect(skillLevel(xpForLevel(level) - 1)).toBe(level - 1);
    }
    expect(level).toBeGreaterThan(30 * LEVELS_PER_DOUBLING);
  });
});

describe('a skill level counting a bonus the skill carries', () => {
  it('folds a flat grant through the added channel, once per level', () => {
    const registry = loaded();
    expect(statValue('attack', withXp({}), registry)).toBe(11);
    expect(statValue('attack', withXp({ brawling: xpForLevel(5) }), registry)).toBe(15);
    expect(statValue('attack', withXp({ brawling: xpForLevel(5) - 1 }), registry)).toBe(14);
  });

  it('folds a percent grant through the increased channel, once per level', () => {
    const registry = loaded();
    expect(statValue('dodge', withXp({}), registry)).toBeCloseTo(51);
    expect(statValue('dodge', withXp({ footwork: xpForLevel(11) }), registry)).toBeCloseTo(50 * 1.22);
  });

  it('scales a ranged grant as a range and a negative one downward', () => {
    const registry = loaded();
    expect(statRange('haggle', withXp({ haggling: xpForLevel(4) }), registry)).toEqual({ min: 18, max: 30 });
    expect(statValue('grudge-power', withXp({ grudge: xpForLevel(5) }), registry)).toBeCloseTo(8.5);
  });

  it('reads the level off the actor being evaluated, not off the player', () => {
    const registry = loaded();
    const state = withXp({ brawling: xpForLevel(30) });
    expect(statValue('attack', state, registry, PLAYER)).toBe(10 + 30);
    expect(registry.entities.get('rat')!.skills).toEqual(['brawling']);
    expect(statValue('attack', state, registry, 'rat')).toBe(3 + 1);
    expect(statValue('attack', state, registry, 'mannequin')).toBe(3);
  });

  it('grants nothing for a skill that carries no bonus', () => {
    const registry = loaded();
    expect(registry.skills.get('lore')!.tags).toEqual([]);
    expect(statValue('attack', withXp({ lore: xpForLevel(40) }), registry)).toBe(11);
  });

  it('counts a level of any skill, not only the one carrying the clause', () => {
    const registry = loadModule(MODULE.replace('+1 attack per level of brawling', '+1 attack per level of footwork'));
    expect(statValue('attack', withXp({ footwork: xpForLevel(5) }), registry)).toBe(15);
  });
});

describe('crossing a level threshold', () => {
  it('moves the stat the skill names, says so, and leaves the rest of the state alone', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    initResources(state, registry);
    state.xp = { brawling: xpForLevel(4) - 1 };

    const before = { ...structuredClone(state), xp: undefined, log: undefined };
    expect(statValue('attack', state, registry)).toBe(13);

    applyResultsNow(state, registry, [{ kind: 'xp', skill: 'brawling', amount: point(1) }]);

    expect(statValue('attack', state, registry)).toBe(14);
    expect(state.log).toEqual(['engine.skill.levelled']);
    expect({ ...structuredClone(state), xp: undefined, log: undefined }).toEqual(before);
  });

  it('says nothing when the total moves without crossing anything', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    initResources(state, registry);
    state.xp = { brawling: xpForLevel(4) };

    applyResultsNow(state, registry, [{ kind: 'xp', skill: 'brawling', amount: point(1) }]);

    expect(state.log).toEqual([]);
  });

  it('stores the total and never the level, so the level is derived on demand', () => {
    const state = withXp({ brawling: xpForLevel(7) });
    expect(JSON.stringify(state)).not.toMatch(/level/i);
    expect(skillLevel(state.xp.brawling)).toBe(7);
  });
});
