export interface RngCursor {
  rng: number;
}

const MULTIPLIER = 1103515245;
const INCREMENT = 12345;
const MODULUS = 4294967296;

// Hull-Dobell: the increment is odd and the multiplier is 1 mod 4, so the period
// is the full 2^32 from any seed and this one needs no property of its own.
export const DEFAULT_RNG_SEED = 20260718;

export function nextRandom(cursor: RngCursor): number {
  cursor.rng = (Math.imul(cursor.rng, MULTIPLIER) + INCREMENT) >>> 0;
  return cursor.rng / MODULUS;
}
