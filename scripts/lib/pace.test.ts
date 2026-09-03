import { describe, expect, it } from 'vitest';
import { xpForLevel } from '../../src/runtime/skills';
import { ABILITY_AT_LEVEL_ONE, ABILITY_GROWTH_PER_LEVEL, abilityAtLevel, GROWTH_CEILING, Ladder, ladderFor, MINUTES_AT_LEVEL_ONE, MINUTES_GROWTH_PER_LEVEL, minutesForLevel, minutesToReach, ONE_LINE, rateAtLevel } from './pace';

const costOfLevel = (level: number): number => xpForLevel(level + 1) - xpForLevel(level);

describe('the pace a level is meant to take', () => {
  it('grows no faster than the cost of a level does, which is the whole of what keeps the target reachable', () => {
    expect(MINUTES_GROWTH_PER_LEVEL).toBeLessThanOrEqual(GROWTH_CEILING);
    for (let level = 1; level < 100; level += 1) {
      expect(minutesForLevel(level + 1) / minutesForLevel(level)).toBeLessThanOrEqual(costOfLevel(level + 1) / costOfLevel(level));
    }
  });

  it('asks a target that never falls, because a stronger character never earns less at the same offer', () => {
    for (let level = 1; level < 100; level += 1) expect(rateAtLevel(level + 1)).toBeGreaterThanOrEqual(rateAtLevel(level));
  });

  it('leaves the first level where a first level belongs, which is the one figure chosen rather than derived', () => {
    expect(minutesForLevel(1)).toBe(MINUTES_AT_LEVEL_ONE);
    expect(rateAtLevel(1)).toBeCloseTo((costOfLevel(1) * 60) / MINUTES_AT_LEVEL_ONE, 6);
  });

  it('reaches a level by the sum of every level before it, and level one by nothing at all', () => {
    expect(minutesToReach(1)).toBe(0);
    expect(minutesToReach(2)).toBe(minutesForLevel(1));
    expect(minutesToReach(5)).toBeCloseTo(minutesForLevel(1) + minutesForLevel(2) + minutesForLevel(3) + minutesForLevel(4), 9);
  });

  it('asks for exactly the level cost over the level time, so a re-tune of either moves it', () => {
    for (const level of [1, 9, 30, 70]) {
      expect(rateAtLevel(level)).toBeCloseTo((costOfLevel(level) * 60) / minutesForLevel(level), 6);
    }
  });
});

describe('the ability a level is assumed to stand at', () => {
  it('never falls, because a character does not get weaker for having levelled', () => {
    for (let level = 1; level < 100; level += 1) expect(abilityAtLevel(level + 1)).toBeGreaterThanOrEqual(abilityAtLevel(level));
  });

  it('stands the first level on the anchor, which is the one figure chosen rather than derived', () => {
    expect(abilityAtLevel(1)).toBe(ABILITY_AT_LEVEL_ONE);
  });

  it('puts exactly one growth between one level and the next, wherever the two constants are moved to', () => {
    for (let level = 1; level < 100; level += 1) expect(abilityAtLevel(level + 1) - abilityAtLevel(level)).toBeCloseTo(ABILITY_GROWTH_PER_LEVEL, 9);
  });
});

describe('a ladder per stat, rather than one line for all of them', () => {
  const STEEPER: Ladder = { minutesAtLevelOne: 10, minutesGrowthPerLevel: 1.09, abilityAtLevelOne: 4, abilityGrowthPerLevel: 11 };

  const readOff = (ladder: Ladder, level: number): number => ladder.abilityAtLevelOne + ladder.abilityGrowthPerLevel * (level - 1);

  it('gives an id nobody declared one for the line everything used to share', () => {
    expect(ladderFor('nothing.declared-here')).toBe(ONE_LINE);
    expect(ladderFor()).toBe(ONE_LINE);
  });

  it('reads fishing off a ladder of its own, whatever that ladder later says', () => {
    expect(ladderFor('fishing.fishing')).toBeDefined();
  });

  it('would tell two ladders apart at every rung, so a declaration that moves is a reading that moves', () => {
    for (let level = 2; level < 100; level += 1) {
      expect(readOff(STEEPER, level)).not.toBeCloseTo(readOff(ONE_LINE, level), 6);
    }
  });

  it('reads every rung of a named ladder off that ladder and not off the shared one', () => {
    for (let level = 1; level < 100; level += 1) {
      const named = ladderFor('fishing.fishing');
      expect(abilityAtLevel(level, 'fishing.fishing')).toBeCloseTo(readOff(named, level), 9);
      expect(minutesForLevel(level, 'fishing.fishing')).toBeCloseTo(named.minutesAtLevelOne * named.minutesGrowthPerLevel ** (level - 1), 9);
    }
  });
});
