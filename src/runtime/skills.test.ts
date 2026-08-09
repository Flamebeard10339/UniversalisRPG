import { describe, expect, it } from 'vitest';
import { loadModule, Registry } from '../content/registry';
import { applyResultsNow, createGameState, GameState, initResources, PLAYER, statValue } from './runtime';
import { point } from '../grammar/range';
import { skillLevel, xpForLevel } from './skills';

// `brawling` feeds the flat channel and `footwork` the percent one, off the same
// two entities, so a level reaching the wrong actor is visible as a wrong stat.
const MODULE = `
# stat attack
base: 10

# stat dodge
base: 50

# stat max-stamina
base: 20

# resource stamina
max: max-stamina
rate: dodge

# skill brawling
stat-id: attack
per-level: +1

# skill footwork
stat-id: dodge
per-level: +2%

# skill lore

# entity player
title: You
stats: attack 10
skills: brawling, footwork

# entity rat
stats: attack 3
skills: brawling

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
  it('costs 1000 for the first level and doubles that cost every ten levels', () => {
    const cost = (level: number): number => xpForLevel(level + 1) - xpForLevel(level);
    expect(cost(1)).toBe(1000);
    expect(cost(11)).toBe(2000);
    expect(cost(21)).toBe(4000);
    expect(cost(31)).toBe(8000);
    expect(cost(101)).toBe(1024000);
  });

  it('rises on every level rather than resting flat inside a ten-level block', () => {
    for (let level = 1; level < 60; level += 1) {
      const cost = xpForLevel(level + 1) - xpForLevel(level);
      const next = xpForLevel(level + 2) - xpForLevel(level + 1);
      expect(next).toBeGreaterThan(cost);
    }
  });

  it('rounds a threshold up, so a level never costs less than the curve prices it', () => {
    expect([2, 3, 4, 5, 10, 11, 21, 31, 50, 101].map(xpForLevel)).toEqual([1000, 2072, 3221, 4452, 12067, 13933, 41799, 97530, 402058, 14253179]);
  });

  it('starts every skill at level 1, which the first threshold is zero xp for', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(skillLevel(0)).toBe(1);
    expect(skillLevel(999)).toBe(1);
    expect(skillLevel(1000)).toBe(2);
  });

  it('decides a level by integer comparison at thresholds across several ten-level spans', () => {
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

  it('takes a negative total as no progress rather than as a level below one', () => {
    expect(skillLevel(-1)).toBe(1);
  });
});

describe('a skill level feeding the stat it names', () => {
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

  it('reads the level off the actor being evaluated, not off the player', () => {
    const registry = loaded();
    const state = withXp({ brawling: xpForLevel(30) });
    expect(statValue('attack', state, registry, PLAYER)).toBe(10 + 30);
    // The rat has `brawling` and no xp of its own, so it is a level-1 brawler
    // however far the player has come.
    expect(statValue('attack', state, registry, 'rat')).toBe(3 + 1);
    expect(statValue('attack', state, registry, 'mannequin')).toBe(3);
  });

  it('grants nothing for a skill that names no stat', () => {
    const registry = loaded();
    expect(registry.skills.get('lore')!['stat-id']).toBeUndefined();
    expect(statValue('attack', withXp({ lore: xpForLevel(40) }), registry)).toBe(11);
  });

  it('refuses a grant with no stat-id to raise', () => {
    expect(() => loadModule('# skill brawling\nper-level: +1\n')).toThrow(/# skill brawling: per-level: needs a stat-id: to raise/);
  });

  it('refuses a grant that names a stat, since stat-id is where the stat is named', () => {
    expect(() => loadModule('# stat attack\n\n# skill brawling\nstat-id: attack\nper-level: +1 attack\n')).toThrow(/expected a bonus like \+1 or \+1%, got "\+1 attack"/);
    expect(() => loadModule('# skill brawling\nper-level: sneaky\n')).toThrow(/expected a bonus like \+1 or \+1%, got "sneaky"/);
  });
});

describe('crossing a level threshold', () => {
  it('moves the stat the skill names and leaves the rest of the state alone', () => {
    const registry = loaded();
    const state = createGameState('nowhere');
    initResources(state, registry);
    state.xp = { brawling: xpForLevel(4) - 1 };

    const before = { ...structuredClone(state), xp: undefined };
    expect(statValue('attack', state, registry)).toBe(13);

    applyResultsNow(state, registry, [{ kind: 'xp', skill: 'brawling', amount: point(1) }]);

    expect(statValue('attack', state, registry)).toBe(14);
    expect({ ...structuredClone(state), xp: undefined }).toEqual(before);
  });

  it('stores the total and never the level, so the level is derived on demand', () => {
    const state = withXp({ brawling: xpForLevel(7) });
    expect(JSON.stringify(state)).not.toMatch(/level/i);
    expect(skillLevel(state.xp.brawling)).toBe(7);
  });
});
