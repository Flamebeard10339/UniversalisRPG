import type { Registry } from '../content/registry';
import type { Ladder } from '../content/sections/ladder';
import { LEVELS_PER_DOUBLING, xpForLevel } from './skills';

export type { Ladder };

export const toughnessLadder = (registry: Registry): Ladder | undefined => [...registry.ladders.values()].find((each) => each.secondsToFellAnEvenMatch !== undefined);

export const ladderFor = (registry: Registry, statId?: string): Ladder | undefined => (statId === undefined ? undefined : registry.ladders.get(statId));

export const climbsDps = (registry: Registry, statId?: string): boolean => statId !== undefined && registry.stats.get(statId)?.deals !== undefined;

export function dpsLadder(registry: Registry): Ladder | undefined {
  const pool = toughnessLadder(registry);
  const seconds = pool?.secondsToFellAnEvenMatch;
  if (pool === undefined || seconds === undefined || seconds === 0) return undefined;
  return { ...pool, addedAtLevelOne: pool.addedAtLevelOne / seconds, addedGrowthPerLevel: pool.addedGrowthPerLevel / seconds };
}

export const ladderForStat = (registry: Registry, statId?: string): Ladder | undefined => (climbsDps(registry, statId) ? dpsLadder(registry) : ladderFor(registry, statId));

export const ladderForSkill = (registry: Registry, skillId: string): Ladder | undefined => ladderForStat(registry, registry.skills.get(skillId)?.stat);

export const GROWTH_CEILING = 2 ** (1 / LEVELS_PER_DOUBLING);

export const addedOn = (ladder: Ladder, level: number): number => ladder.addedAtLevelOne + ladder.addedGrowthPerLevel * (level - 1);

export const increasedOn = (ladder: Ladder, level: number): number => ladder.increasedAtLevelOne + ladder.increasedGrowthPerLevel * (level - 1);

export const abilityOn = (ladder: Ladder, level: number): number => addedOn(ladder, level) * (1 + increasedOn(ladder, level) / 100);

export const minutesOn = (ladder: Ladder, level: number): number => ladder.minutesAtLevelOne * ladder.minutesGrowthPerLevel ** (level - 1);

export function minutesToReachOn(ladder: Ladder, level: number): number {
  let total = 0;
  for (let each = 1; each < level; each += 1) total += minutesOn(ladder, each);
  return total;
}

const MINUTES_PER_HOUR = 60;

export const rateOn = (ladder: Ladder, level: number): number => ((xpForLevel(level + 1) - xpForLevel(level)) * MINUTES_PER_HOUR) / minutesOn(ladder, level);

export const abilityAtLevelIn = (registry: Registry, level: number, statId?: string): number | undefined => {
  const ladder = ladderForStat(registry, statId);
  return ladder === undefined ? undefined : abilityOn(ladder, level);
};

export const toughnessAtLevel = (registry: Registry, level: number): number | undefined => {
  const ladder = toughnessLadder(registry);
  return ladder === undefined ? undefined : abilityOn(ladder, level);
};

export const dpsAtLevel = (registry: Registry, level: number): number | undefined => {
  const ladder = dpsLadder(registry);
  return ladder === undefined ? undefined : abilityOn(ladder, level);
};

export const secondsToFellAnEvenMatch = (registry: Registry): number | undefined => toughnessLadder(registry)?.secondsToFellAnEvenMatch;
