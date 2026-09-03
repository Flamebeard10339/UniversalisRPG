import { describe, expect, it } from 'vitest';
import { xpForLevel } from '../../src/runtime/skills';
import { GROWTH_CEILING, MINUTES_AT_LEVEL_ONE, MINUTES_GROWTH_PER_LEVEL, minutesForLevel, minutesToReach, rateAtLevel } from './pace';

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
