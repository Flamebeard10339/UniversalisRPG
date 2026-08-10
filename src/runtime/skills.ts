// The cost of a level doubles every ten of them, without a step: the curve is
// geometric in the level, so its inverse is one logarithm rather than a table.
const FIRST_LEVEL_COST = 1000;
const LEVELS_PER_DOUBLING = 10;
const RATIO = 2 ** (1 / LEVELS_PER_DOUBLING);

// Whole xp, so that a level is decided by integer comparison and never by how a
// float happened to round.
export const xpForLevel = (level: number): number => (level <= 1 ? 0 : Math.ceil((FIRST_LEVEL_COST * (RATIO ** (level - 1) - 1)) / (RATIO - 1)));

// The logarithm is a guess, not the answer: it inverts the real-valued curve,
// and rounding decides which side of a threshold it lands on. Deliberately
// overshooting it by one turns that into a correction that always runs and only
// ever walks down, so the level handed back is one an integer comparison chose.
export function skillLevel(xp: number): number {
  const total = Math.max(0, xp);
  let level = Math.floor(1 + LEVELS_PER_DOUBLING * Math.log2(1 + (total * (RATIO - 1)) / FIRST_LEVEL_COST)) + 1;
  while (level > 1 && xpForLevel(level) > total) level -= 1;
  return level;
}
