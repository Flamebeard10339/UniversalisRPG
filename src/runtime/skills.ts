export const FIRST_LEVEL_COST = 100;
export const LEVELS_PER_DOUBLING = 7;
const RATIO = 2 ** (1 / LEVELS_PER_DOUBLING);

export const xpForLevel = (level: number): number => (level <= 1 ? 0 : Math.ceil((FIRST_LEVEL_COST * (RATIO ** (level - 1) - 1)) / (RATIO - 1)));

export function skillLevel(xp: number): number {
  const total = Math.max(0, xp);
  let level = Math.floor(1 + LEVELS_PER_DOUBLING * Math.log2(1 + (total * (RATIO - 1)) / FIRST_LEVEL_COST)) + 1;
  while (level > 1 && xpForLevel(level) > total) level -= 1;
  return level;
}

// Read off what has been earned rather than off what the world declares, because a skill with nothing in
// it reads as the first level and the first level is the floor: a skill added next month is covered
// without being named, and a run that has earned nothing still stands at the level everyone starts on.
export const highestSkillLevel = (xp: Readonly<Record<string, number>>): number => Math.max(skillLevel(0), ...Object.values(xp).map(skillLevel));
