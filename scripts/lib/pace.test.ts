import { describe, expect, it } from 'vitest';
import { xpForLevel } from '../../src/runtime/skills';
import { GROWTH_CEILING, MINUTES_AT_LEVEL_ONE, MINUTES_GROWTH_PER_LEVEL, minutesForLevel, rateAtLevel } from './pace';

const costOfLevel = (level: number): number => xpForLevel(level + 1) - xpForLevel(level);

describe('the pace a level is meant to take', () => {
  it('grows no faster than the cost of a level does, which is the whole of what keeps the target reachable', () => {
    expect(MINUTES_GROWTH_PER_LEVEL).toBeLessThanOrEqual(GROWTH_CEILING);
    for (let level = 1; level < 100; level += 1) {
      expect(minutesForLevel(level + 1) / minutesForLevel(level)).toBeLessThanOrEqual(costOfLevel(level + 1) / costOfLevel(level));
    }
  });

  // The frontier is what the best offer within reach pays, and every offer a weaker character can
  // take a stronger one can take too — so the pace a world holds never falls with level. A target
  // that fell would be asking for a world that cannot exist, whatever was authored into it.
  it('asks a target that never falls, because a stronger character never earns less at the same offer', () => {
    for (let level = 1; level < 100; level += 1) expect(rateAtLevel(level + 1)).toBeGreaterThanOrEqual(rateAtLevel(level));
  });

  it('leaves the first level where a first level belongs, which is the one figure chosen rather than derived', () => {
    expect(minutesForLevel(1)).toBe(MINUTES_AT_LEVEL_ONE);
    expect(rateAtLevel(1)).toBeCloseTo((costOfLevel(1) * 60) / MINUTES_AT_LEVEL_ONE, 6);
  });

  it('asks for exactly the level cost over the level time, so a re-tune of either moves it', () => {
    for (const level of [1, 9, 30, 70]) {
      expect(rateAtLevel(level)).toBeCloseTo((costOfLevel(level) * 60) / minutesForLevel(level), 6);
    }
  });
});
