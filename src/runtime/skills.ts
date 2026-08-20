const FIRST_LEVEL_COST = 1000;
const LEVELS_PER_DOUBLING = 10;
const RATIO = 2 ** (1 / LEVELS_PER_DOUBLING);

export const xpForLevel = (level: number): number => (level <= 1 ? 0 : Math.ceil((FIRST_LEVEL_COST * (RATIO ** (level - 1) - 1)) / (RATIO - 1)));

export function skillLevel(xp: number): number {
  const total = Math.max(0, xp);
  let level = Math.floor(1 + LEVELS_PER_DOUBLING * Math.log2(1 + (total * (RATIO - 1)) / FIRST_LEVEL_COST)) + 1;
  while (level > 1 && xpForLevel(level) > total) level -= 1;
  return level;
}
