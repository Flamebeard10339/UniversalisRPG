import type { Registry } from '../../src/content/registry';
import { PROFILE_PAIRS, type Profile } from '../../src/content/sections/profile';
import type { Tier } from '../../src/content/sections/tier';
import { opposes } from '../../src/runtime/encounter';
import { fightOf, ladderedFor, readingAt, type Fighter, type LadderedStats, type Reading } from '../../src/runtime/foeTier';
import { FACTORS, weighedFor } from '../../src/runtime/foeSolve';
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
  const laddered = ladderedFor(registry, fight);
  if (laddered === undefined) return [];
  const foe = fighter.entity.id;
  const weighed = weighedFor(registry, fight, laddered, fighter.level, (statId) => statValue(statId, state, registry, PLAYER));
  return FACTORS.flatMap((factor) => {
    const said = profile[factor];
    if (said === undefined || typeof said !== 'number') return [];
    const { stat, against } = weighed[factor];
    return [{ factor, said, read: RATIO(statValue(stat, state, registry, foe), against) }];
  });
}

export const unwrittenFactors = (profile: Profile): string[] => [...SOLVED].filter((factor) => profile[factor as keyof Profile] === undefined);

export const OUT_BY = 2;

export const shapeDisagrees = (shape: readonly Shape[]): Shape[] =>
  shape.filter((each) => Number.isFinite(each.read) && (each.read > each.said * OUT_BY || each.read * OUT_BY < each.said));
