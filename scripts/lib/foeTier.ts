import type { Registry } from '../../src/content/registry';
import { PROFILE_PAIRS, type Profile } from '../../src/content/sections/profile';
import type { Tier } from '../../src/content/sections/tier';
import { opposes } from '../../src/runtime/encounter';
import { fightOf, ladderedFor, readingAt, type Fighter, type LadderedStats, type Reading } from '../../src/runtime/foeTier';
import { abilityAtLevelIn } from '../../src/runtime/pace';
import { statValue } from '../../src/runtime/stats';
import type { GameState } from '../../src/runtime/state';
import { PLAYER } from '../../src/runtime/state';

export function fightersIn(registry: Registry): Fighter[] {
  const found: Fighter[] = [];
  for (const entity of registry.entities.values()) {
    const fight = fightOf(registry, entity);
    if (!fight || !opposes(registry, entity.id, PLAYER)) continue;
    found.push({
      entity,
      fight,
      tier: entity.tier === undefined ? undefined : registry.tiers.get(entity.tier),
      profile: entity.profile === undefined ? undefined : registry.profiles.get(entity.profile),
      level: entity.level,
    });
  }
  return found;
}

export interface FairAt {
  toughness?: number;
  damage?: number;
}

const CROSSED = (was: number, now: number, asked: number): boolean => (was - asked) * (now - asked) <= 0;

export function fairAt(registry: Registry, state: GameState, fighter: Fighter, laddered: LadderedStats, tier: Tier, top: number): FairAt {
  const found: FairAt = {};
  let last: Reading | undefined;
  for (let level = 1; level <= top; level += 1) {
    const now = readingAt(registry, state, fighter, laddered, level);
    if (last) {
      if (found.toughness === undefined && CROSSED(last.secondsToFell, now.secondsToFell, tier.secondsToFell)) found.toughness = level;
      if (found.damage === undefined && CROSSED(last.damageShare, now.damageShare, tier.damageShare)) found.damage = level;
    }
    last = now;
  }
  return found;
}

export interface Shape {
  factor: string;
  said: number;
  read: number;
}

const RATIO = (ours: number, theirs: number): number => (theirs === 0 ? Infinity : ours / theirs);

const SOLVED = new Set<string>(PROFILE_PAIRS.flat());

export function shapeOf(registry: Registry, state: GameState, fighter: Fighter): Shape[] {
  const { fight, profile } = fighter;
  if (!profile) return [];
  const foe = fighter.entity.id;
  const laddered = ladderedFor(registry, fight);
  const ours = (statId: string, climbs: string | undefined): number =>
    (climbs !== undefined && fighter.level !== undefined ? abilityAtLevelIn(registry, fighter.level, climbs) : undefined) ?? statValue(statId, state, registry, PLAYER);
  const factors: readonly { factor: keyof Profile & string; stat: string | undefined; climbs?: string }[] = [
    { factor: 'rate', stat: fight.rate },
    { factor: 'damage', stat: fight.damage.ours, climbs: laddered?.dealt },
    { factor: 'accuracy', stat: fight.accuracy.ours },
    { factor: 'evasion', stat: fight.accuracy.theirs },
    { factor: 'reduction', stat: fight.damage.theirs },
    { factor: 'pool', stat: laddered?.pooled, climbs: laddered?.pooled },
  ];
  return factors.flatMap(({ factor, stat, climbs }) => {
    const said = profile[factor];
    if (said === undefined || stat === undefined || typeof said !== 'number') return [];
    return [{ factor, said, read: RATIO(statValue(stat, state, registry, foe), ours(stat, climbs)) }];
  });
}

export const unwrittenFactors = (profile: Profile): string[] => [...SOLVED].filter((factor) => profile[factor as keyof Profile] === undefined);

export const OUT_BY = 2;

export const shapeDisagrees = (shape: readonly Shape[]): Shape[] =>
  shape.filter((each) => Number.isFinite(each.read) && (each.read > each.said * OUT_BY || each.read * OUT_BY < each.said));
