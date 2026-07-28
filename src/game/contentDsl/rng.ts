// Anything carrying the deterministic draw cursor. GameState is the only one
// today; taking the field rather than the state keeps the draw sequence with no
// opinion about what else lives alongside it.
//
// The cursor lives in state rather than being passed down as a parameter so
// draws are consumed in attempt order however a caller splits a resolve() span
// — the associativity invariant on resolve() rests on that.
export interface RngCursor {
  rng: number;
}

// A full-period LCG over 32 bits (glibc's constants), returning a value in
// [0, 1).
//
// Math.imul, not `*`. A 2^31 state times a ~2^30 multiplier reaches 2^61, well
// past Number.MAX_SAFE_INTEGER, so a plain multiply rounds the low bits away
// BEFORE a modulus can extract them — which is a different and much smaller map
// than the constants describe. Measured, that map had a period of 10,466 states
// out of 2^31; a repeating fight at the tutorial rat's cadence saturated it in
// about eleven in-game hours and then replayed every hit, miss and damage roll
// identically forever, carrying the repetition into any save taken inside it.
const MULTIPLIER = 1103515245;
const INCREMENT = 12345;
const MODULUS = 4294967296; // 2^32, which is what `>>> 0` truncates to

// The increment is odd and the multiplier is 1 mod 4, which by Hull–Dobell makes
// the period the full 2^32 from ANY seed — so this one is arbitrary and needs no
// property of its own.
export const DEFAULT_RNG_SEED = 20260718;

export function nextRandom(cursor: RngCursor): number {
  cursor.rng = (Math.imul(cursor.rng, MULTIPLIER) + INCREMENT) >>> 0;
  return cursor.rng / MODULUS;
}
