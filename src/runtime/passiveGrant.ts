import type { Registry } from '../content/registry';
import type { Passive } from '../content/sections/passive';
import type { BaselineGrant } from '../grammar/baselineGrant';
import { point } from '../grammar/range';
import { listMembers } from '../grammar/section';
import type { TagClause } from '../grammar/tagClause';
import { ladderForStat } from './pace';

export function roundedFor(registry: Registry, statId: string, worth: number): number {
  const step = registry.stats.get(statId)?.roundsTo;
  if (step === undefined || step <= 0) return worth;
  const nearest = Math.round(worth / step) * step;
  return nearest === 0 && worth !== 0 ? Math.sign(worth) * step : nearest;
}

export function worthOf(registry: Registry, grant: BaselineGrant): number | undefined {
  const ladder = ladderForStat(registry, grant.statId);
  if (ladder === undefined) return undefined;
  if (grant.axis === 'increased') return grant.times * ladder.increasedGrowthPerLevel;
  return roundedFor(registry, grant.statId, grant.times * ladder.addedGrowthPerLevel);
}

const clauseFor = (registry: Registry, grant: BaselineGrant): TagClause | undefined => {
  const worth = worthOf(registry, grant);
  if (worth === undefined) return undefined;
  return grant.axis === 'increased' ? { kind: 'stat-bonus', statId: grant.statId, percent: true, amount: worth } : { kind: 'stat-bonus', statId: grant.statId, percent: false, amount: point(worth) };
};

export function grantsOf(passive: Passive): readonly BaselineGrant[] {
  return listMembers<BaselineGrant>(passive.grants);
}

export function passiveTags(registry: Registry, passive: Passive): readonly TagClause[] {
  const minted = grantsOf(passive).flatMap((grant) => {
    const clause = clauseFor(registry, grant);
    return clause === undefined ? [] : [clause];
  });
  return minted.length === 0 ? passive.tags : [...passive.tags, ...minted];
}

export const passiveTagsOf = (registry: Registry, passiveId: string): readonly TagClause[] => {
  const passive = registry.passives.get(passiveId);
  return passive === undefined ? [] : passiveTags(registry, passive);
};
