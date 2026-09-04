import type { Registry } from '../content/registry';
import { LEVELS_PER_DOUBLING, xpForLevel } from './skills';

export interface Ladder {
  minutesAtLevelOne: number;
  minutesGrowthPerLevel: number;
  abilityAtLevelOne: number;
  abilityGrowthPerLevel: number;
}

export const ONE_LINE: Ladder = {
  minutesAtLevelOne: 5,
  minutesGrowthPerLevel: 1.07,
  abilityAtLevelOne: 0,
  abilityGrowthPerLevel: 7,
};

export const BLOWS_TO_FELL_AN_EVEN_MATCH = 5;

export const DAMAGE_LINE: Ladder = {
  ...ONE_LINE,
  abilityAtLevelOne: ONE_LINE.abilityAtLevelOne / BLOWS_TO_FELL_AN_EVEN_MATCH,
  abilityGrowthPerLevel: ONE_LINE.abilityGrowthPerLevel / BLOWS_TO_FELL_AN_EVEN_MATCH,
};

const LADDERS: Readonly<Record<string, Ladder>> = {
  'fishing.fishing': ONE_LINE,
};

export const ladderFor = (id?: string): Ladder => (id === undefined ? ONE_LINE : (LADDERS[id] ?? ONE_LINE));

export const ladderForStat = (registry: Registry, statId?: string): Ladder =>
  statId !== undefined && registry.stats.get(statId)?.deals !== undefined ? DAMAGE_LINE : ladderFor(statId);

export const MINUTES_AT_LEVEL_ONE = ONE_LINE.minutesAtLevelOne;
export const MINUTES_GROWTH_PER_LEVEL = ONE_LINE.minutesGrowthPerLevel;
export const ABILITY_AT_LEVEL_ONE = ONE_LINE.abilityAtLevelOne;
export const ABILITY_GROWTH_PER_LEVEL = ONE_LINE.abilityGrowthPerLevel;

export const GROWTH_CEILING = 2 ** (1 / LEVELS_PER_DOUBLING);

export const minutesForLevel = (level: number, id?: string): number => {
  const ladder = ladderFor(id);
  return ladder.minutesAtLevelOne * ladder.minutesGrowthPerLevel ** (level - 1);
};

export function minutesToReach(level: number, id?: string): number {
  let total = 0;
  for (let each = 1; each < level; each += 1) total += minutesForLevel(each, id);
  return total;
}

const MINUTES_PER_HOUR = 60;

export const rateAtLevel = (level: number, id?: string): number => ((xpForLevel(level + 1) - xpForLevel(level)) * MINUTES_PER_HOUR) / minutesForLevel(level, id);

export const abilityOn = (ladder: Ladder, level: number): number => ladder.abilityAtLevelOne + ladder.abilityGrowthPerLevel * (level - 1);

export const abilityAtLevel = (level: number, id?: string): number => abilityOn(ladderFor(id), level);

export const abilityAtLevelIn = (registry: Registry, level: number, statId?: string): number => abilityOn(ladderForStat(registry, statId), level);
