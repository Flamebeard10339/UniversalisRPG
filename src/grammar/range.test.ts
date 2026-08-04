import { describe, expect, it } from 'vitest';
import { sampleCount } from './range';

describe('sampleCount', () => {
  it('spreads a roll evenly over the whole closed range', () => {
    const range = { min: 4, max: 7 };
    expect([0, 0.24, 0.26, 0.49, 0.51, 0.74, 0.76, 0.99].map((roll) => sampleCount(range, roll))).toEqual([4, 4, 5, 5, 6, 6, 7, 7]);
  });

  it('stays inside the range at both ends, taking roll as closed', () => {
    expect(sampleCount({ min: 4, max: 7 }, 1)).toBe(7);
    expect(sampleCount({ min: 0, max: 3 }, 0)).toBe(0);
  });
});
