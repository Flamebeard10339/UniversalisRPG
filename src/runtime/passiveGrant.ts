import type { Registry } from '../content/registry';
import type { Passive } from '../content/sections/passive';
import { point } from '../grammar/range';
import type { TagClause } from '../grammar/tagClause';
import { ladderForStat } from './pace';

export function roundedFor(registry: Registry, statId: string, worth: number): number {
  const step = registry.stats.get(statId)?.roundsTo;
  if (step === undefined || step <= 0) return worth;
  const nearest = Math.round(worth / step) * step;
  return nearest === 0 && worth > 0 ? step : nearest;
}

export function grantOf(registry: Registry, passive: Passive): number | undefined {
  const { grants, budget } = passive;
  if (grants === undefined || budget === undefined) return undefined;
  const ladder = ladderForStat(registry, grants);
  if (ladder === undefined) return undefined;
  return roundedFor(registry, grants, ladder.addedGrowthPerLevel / budget);
}

export function passiveTags(registry: Registry, passive: Passive): readonly TagClause[] {
  const worth = grantOf(registry, passive);
  return worth === undefined ? passive.tags : [...passive.tags, { kind: 'stat-bonus', statId: passive.grants!, percent: false, amount: point(worth) }];
}

export const passiveTagsOf = (registry: Registry, passiveId: string): readonly TagClause[] => {
  const passive = registry.passives.get(passiveId);
  return passive === undefined ? [] : passiveTags(registry, passive);
};
