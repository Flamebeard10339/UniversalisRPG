import { describe, expect, it } from 'vitest';
import { LEVELS_PER_DOUBLING, xpForLevel } from '../../src/runtime/skills';
import { minutesForLevel, MINUTES_PER_LEVEL, rateAtLevel, slackestLevel } from './pace';

describe('the pace a level is meant to take', () => {
  it('rises by the same amount every level, which is what makes the climb linear', () => {
    for (let level = 1; level < 100; level += 1) expect(minutesForLevel(level + 1) - minutesForLevel(level)).toBe(MINUTES_PER_LEVEL);
  });

  it('doubles the rate it asks for every doubling span, once the levels are far enough apart to be linear about', () => {
    // A doubling span doubles the cost and adds a fixed amount of time, so the ratio approaches two
    // from below and is asked for where the time is no longer most of the difference.
    for (const level of [40, 60, 80]) {
      const ratio = rateAtLevel(level + LEVELS_PER_DOUBLING) / rateAtLevel(level);
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(2);
    }
  });

  it('is not a rising line: the cheapest level to be at is neither the first nor the last', () => {
    const slackest = slackestLevel(70);
    expect(slackest).toBeGreaterThan(1);
    expect(slackest).toBeLessThan(70);
    expect(rateAtLevel(slackest)).toBeLessThan(rateAtLevel(1));
    expect(rateAtLevel(slackest)).toBeLessThan(rateAtLevel(70));
  });

  it('asks for exactly the level cost over the level time, so a re-tune of either moves it', () => {
    for (const level of [1, 9, 30, 70]) {
      expect(rateAtLevel(level)).toBeCloseTo(((xpForLevel(level + 1) - xpForLevel(level)) * 60) / minutesForLevel(level), 6);
    }
  });
});
