import { describe, expect, it } from 'vitest';
import { DEFAULT_RNG_SEED, nextRandom, RngCursor } from './rng';

const MULTIPLIER = 1103515245n;
const INCREMENT = 12345n;
const MODULUS = 4294967296n;

function cursor(rng = DEFAULT_RNG_SEED): RngCursor {
  return { rng };
}

describe('nextRandom', () => {
  it('computes the LCG exactly, losing no low bits to float rounding', () => {
    const state = cursor();
    let reference = BigInt(DEFAULT_RNG_SEED);

    for (let i = 0; i < 100_000; i++) {
      nextRandom(state);
      reference = (reference * MULTIPLIER + INCREMENT) % MODULUS;
      if (state.rng !== Number(reference)) {
        expect({ step: i, actual: state.rng }).toEqual({ step: i, actual: Number(reference) });
      }
    }
    expect(state.rng).toBe(Number(reference));
  });

  it('visits a distinct state every step across a span no fight will reach', () => {
    const state = cursor();
    const seen = new Set<number>();
    for (let i = 0; i < 500_000; i++) {
      nextRandom(state);
      seen.add(state.rng);
    }
    expect(seen.size).toBe(500_000);
  });

  it('returns a value in [0, 1) from every one of the low bits, not only the high ones', () => {
    const state = cursor();
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const value = nextRandom(state);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      buckets[Math.floor(value * 10)]++;
    }
    for (const count of buckets) expect(count).toBeGreaterThan(9_000);
  });
});
