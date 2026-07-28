import { describe, expect, it } from 'vitest';
import { DEFAULT_RNG_SEED, nextRandom, RngCursor } from './rng';

// The draw sequence is a save field, so a fight's whole hit/miss/damage pattern
// is whatever this produces. It was for a long time NOT what its constants
// describe: `state * 1103515245` reaches 2^61, and a float multiply rounds the
// low bits away before the modulus can take them, collapsing a nominal 2^31
// period to a measured 10,466 states. Roughly eleven in-game hours of combat
// then replayed identically, forever.
//
// These check the two halves of that separately: the arithmetic against an
// exact reference, and the period against the collapse. Neither restates the
// implementation — the reference is BigInt, which cannot lose a bit.
const MULTIPLIER = 1103515245n;
const INCREMENT = 12345n;
const MODULUS = 4294967296n; // 2^32

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
        // Reported rather than asserted per step so a failure names the step.
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
    // A uniform draw puts 10,000 in each bucket; the band is wide enough to be
    // a uniformity check rather than a restatement of the exact sequence.
    for (const count of buckets) expect(count).toBeGreaterThan(9_000);
  });
});
