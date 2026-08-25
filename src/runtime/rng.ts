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

// What a thing that entered the world keeps of the moment it entered it. Every range that thing
// declares is read at this one number, so the numbers follow from the declaration and a save replays
// them without storing any of them.
export const isRoll = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value < 1;
