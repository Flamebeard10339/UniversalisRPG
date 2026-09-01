export interface RngCursor {
  rng: number;
}

const MULTIPLIER = 1103515245;
const INCREMENT = 12345;
const MODULUS = 4294967296;

export const DEFAULT_RNG_SEED = 20260718;

export function nextRandom(cursor: RngCursor): number {
  cursor.rng = (Math.imul(cursor.rng, MULTIPLIER) + INCREMENT) >>> 0;
  return cursor.rng / MODULUS;
}

export const isRoll = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value < 1;
