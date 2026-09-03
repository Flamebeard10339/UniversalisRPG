import { LEVELS_PER_DOUBLING, xpForLevel } from '../../src/runtime/skills';

export const MINUTES_AT_LEVEL_ONE = 5;
export const MINUTES_GROWTH_PER_LEVEL = 1.07;

export const GROWTH_CEILING = 2 ** (1 / LEVELS_PER_DOUBLING);

export const minutesForLevel = (level: number): number => MINUTES_AT_LEVEL_ONE * MINUTES_GROWTH_PER_LEVEL ** (level - 1);

export function minutesToReach(level: number): number {
  let total = 0;
  for (let each = 1; each < level; each += 1) total += minutesForLevel(each);
  return total;
}

const MINUTES_PER_HOUR = 60;

export const rateAtLevel = (level: number): number => ((xpForLevel(level + 1) - xpForLevel(level)) * MINUTES_PER_HOUR) / minutesForLevel(level);

export const ABILITY_AT_LEVEL_ONE = 0;
export const ABILITY_GROWTH_PER_LEVEL = 7;

export const abilityAtLevel = (level: number): number => ABILITY_AT_LEVEL_ONE + ABILITY_GROWTH_PER_LEVEL * (level - 1);
