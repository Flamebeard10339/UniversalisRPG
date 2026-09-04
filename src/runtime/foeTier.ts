import { fightShapeOf, type FightShape } from '../grammar/action';
import { midpoint, point, type Range } from '../grammar/range';
import { activitiesIn, type Activity } from '../content/activities';
import type { Registry } from '../content/registry';
import type { Entity } from '../content/sections/entity';
import type { Profile } from '../content/sections/profile';
import type { Tier } from '../content/sections/tier';
import { hitChance, statValue } from './stats';
import { minDamage } from './tuning';
import { abilityAtLevelIn } from './pace';
import { initialState } from './save';
import type { GameState } from './state';
import { PLAYER } from './state';

export { fightShapeOf };
export type { Contested, FightShape } from '../grammar/action';

export const SURVIVAL_WINDOW_SECONDS = 60;

const SECONDS_PER_MINUTE = 60;

export function fightOf(registry: Registry, entity: Entity): FightShape | undefined {
  for (const named of entity.uses) {
    const action = registry.actions.get(named);
    const shape = action && fightShapeOf(action);
    if (shape) return shape;
  }
  return undefined;
}

export interface Fighter {
  entity: Entity;
  fight: FightShape;
  tier?: Tier;
  profile?: Profile;
  level?: number;
}

export interface LadderedStats {
  dealt: string;
  pooled: string;
}

export function ladderedIn(registry: Registry, activity: Activity, fight: FightShape): LadderedStats | undefined {
  const poolMax = registry.resources.get(fight.pool)?.max;
  let dealt: string | undefined;
  let pooled: string | undefined;
  for (const skillId of activity.skills) {
    const stat = registry.skills.get(skillId)?.stat;
    if (stat === undefined) continue;
    if (registry.stats.get(stat)?.deals !== undefined) dealt = stat;
    if (stat === poolMax) pooled = stat;
  }
  return dealt === undefined || pooled === undefined ? undefined : { dealt, pooled };
}

export const activityFor = (registry: Registry, fight: FightShape): Activity | undefined => activitiesIn(registry).find((activity) => ladderedIn(registry, activity, fight) !== undefined);

export function ladderedFor(registry: Registry, fight: FightShape): LadderedStats | undefined {
  const activity = activityFor(registry, fight);
  return activity === undefined ? undefined : ladderedIn(registry, activity, fight);
}

export interface Reading {
  secondsToFell: number;
  damageShare: number;
}

const perSecond = (rate: number): number => rate / SECONDS_PER_MINUTE;

export function resistanceTo(registry: Registry, type: string | undefined, state: GameState, actorId: string): number {
  if (type === undefined) return 0;
  let share = 0;
  for (const stat of registry.stats.values()) {
    if (stat.resists === type) share += statValue(stat.id, state, registry, actorId);
  }
  return share;
}

function landed(dealt: number, resistance: number, reduction: number, registry: Registry): number {
  const through = dealt * (1 - resistance / 100);
  return Math.max(Math.min(minDamage(registry), Math.max(through, 0)), through - reduction);
}

export function readingAt(registry: Registry, state: GameState, fighter: Fighter, laddered: LadderedStats, level: number): Reading {
  const { entity, fight } = fighter;
  const foe = entity.id;
  const type = registry.stats.get(laddered.dealt)?.deals;

  const ourDealt = abilityAtLevelIn(registry, level, laddered.dealt);
  const ourPool = abilityAtLevelIn(registry, level, laddered.pooled);
  const ourRate = statValue(fight.rate, state, registry, PLAYER);
  const ourAccuracy = statValue(fight.accuracy.ours, state, registry, PLAYER);
  const ourEvasion = statValue(fight.accuracy.theirs, state, registry, PLAYER);
  const ourReduction = statValue(fight.damage.theirs, state, registry, PLAYER);

  const ourHit = landed(ourDealt, resistanceTo(registry, type, state, foe), statValue(fight.damage.theirs, state, registry, foe), registry);
  const ourDps = ourHit * perSecond(ourRate) * hitChance(ourAccuracy, statValue(fight.accuracy.theirs, state, registry, foe), registry);

  const theirDealt = statValue(fight.damage.ours, state, registry, foe);
  const theirHit = landed(theirDealt, resistanceTo(registry, type, state, PLAYER), ourReduction, registry);
  const theirDps = theirHit * perSecond(statValue(fight.rate, state, registry, foe)) * hitChance(statValue(fight.accuracy.ours, state, registry, foe), ourEvasion, registry);

  const theirPool = statValue(registry.resources.get(fight.pool)!.max, state, registry, foe);
  const survivable = ourPool / SURVIVAL_WINDOW_SECONDS;

  return {
    secondsToFell: ourDps <= 0 ? Infinity : theirPool / ourDps,
    damageShare: survivable <= 0 ? Infinity : theirDps / survivable,
  };
}

const references = new WeakMap<Registry, GameState>();

export function referencePlayer(registry: Registry): GameState {
  const held = references.get(registry);
  if (held) return held;
  const made = initialState(registry);
  references.set(registry, made);
  return made;
}

const dealtFor = (hit: number, resistance: number, reduction: number): number => (resistance >= 100 ? Infinity : (hit + reduction) / (1 - resistance / 100));

const derived = new WeakMap<Registry, Map<string, Readonly<Record<string, Range>> | null>>();
const deriving = new Set<string>();

export function solvedStatsOf(registry: Registry, entity: Entity): Readonly<Record<string, Range>> | null {
  const cache = derived.get(registry) ?? new Map<string, Readonly<Record<string, Range>> | null>();
  derived.set(registry, cache);
  const held = cache.get(entity.id);
  if (held !== undefined) return held;
  if (deriving.has(entity.id)) return null;
  deriving.add(entity.id);
  try {
    const solved = solve(registry, entity);
    cache.set(entity.id, solved);
    return solved;
  } finally {
    deriving.delete(entity.id);
  }
}

function solve(registry: Registry, entity: Entity): Readonly<Record<string, Range>> | null {
  const { tier: tierId, profile: profileId, level } = entity;
  if (tierId === undefined || profileId === undefined || level === undefined) return null;
  const tier = registry.tiers.get(tierId);
  const profile = registry.profiles.get(profileId);
  const fight = fightOf(registry, entity);
  if (tier === undefined || profile === undefined || fight === undefined) return null;
  const laddered = ladderedFor(registry, fight);
  if (laddered === undefined) return null;

  const state = referencePlayer(registry);
  const type = registry.stats.get(laddered.dealt)?.deals;
  const ourDealt = abilityAtLevelIn(registry, level, laddered.dealt);
  const ourPool = abilityAtLevelIn(registry, level, laddered.pooled);
  const ourRate = statValue(fight.rate, state, registry, PLAYER);
  const ourAccuracy = statValue(fight.accuracy.ours, state, registry, PLAYER);
  const ourEvasion = statValue(fight.accuracy.theirs, state, registry, PLAYER);
  const ourReduction = statValue(fight.damage.theirs, state, registry, PLAYER);
  const ourResistance = resistanceTo(registry, type, state, PLAYER);
  const theirResistance = resistanceTo(registry, type, state, entity.id);

  const written = (statId: string): number | undefined => {
    const held = entity.stats[statId];
    return held === undefined ? undefined : midpoint(held);
  };
  const shaped = (statId: string, factor: number | undefined, ours: number): number | undefined => written(statId) ?? (factor === undefined ? undefined : ours * factor);

  const theirAccuracy = shaped(fight.accuracy.ours, profile.accuracy, ourAccuracy)!;
  const theirEvasion = shaped(fight.accuracy.theirs, profile.evasion, ourEvasion)!;

  const theyLand = hitChance(theirAccuracy, ourEvasion, registry);
  const askedDps = (tier.damageShare * ourPool) / SURVIVAL_WINDOW_SECONDS;
  const saidRate = shaped(fight.rate, profile.rate, ourRate);
  const saidDealt = shaped(fight.damage.ours, profile.damage, ourDealt);
  const theirDealt = saidDealt ?? dealtFor(askedDps / (perSecond(saidRate!) * theyLand), ourResistance, ourReduction);
  const perSwing = landed(theirDealt, ourResistance, ourReduction, registry);
  const rate = saidRate ?? (perSwing * theyLand <= 0 ? Infinity : (askedDps / (perSwing * theyLand)) * SECONDS_PER_MINUTE);

  const weLand = hitChance(ourAccuracy, theirEvasion, registry);
  const ourSwings = perSecond(ourRate) * weLand;
  const saidPool = shaped(laddered.pooled, profile.pool, ourPool);
  const saidReduction = shaped(fight.damage.theirs, profile.reduction, ourReduction);
  const theirReduction = saidReduction ?? ourDealt * (1 - theirResistance / 100) - saidPool! / (tier.secondsToFell * ourSwings);
  const ourHit = landed(ourDealt, theirResistance, theirReduction, registry);
  const pool = saidPool ?? tier.secondsToFell * ourHit * ourSwings;

  return {
    ...standing({ [fight.accuracy.ours]: theirAccuracy, [fight.accuracy.theirs]: theirEvasion, [fight.rate]: rate, [fight.damage.ours]: theirDealt, [laddered.pooled]: pool }),
    ...(Number.isFinite(theirReduction) ? { [fight.damage.theirs]: point(theirReduction) } : {}),
  };
}

const standing = (solved: Record<string, number>): Readonly<Record<string, Range>> =>
  Object.fromEntries(Object.entries(solved).flatMap(([statId, value]) => (Number.isFinite(value) ? [[statId, point(Math.max(0, value))] as const] : [])));
