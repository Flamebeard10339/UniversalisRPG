import { fightShapeOf, type FightShape } from '../grammar/action';
import { midpoint, point, type Range } from '../grammar/range';
import { activitiesIn, type Activity } from '../content/activities';
import type { Registry } from '../content/registry';
import type { Entity } from '../content/sections/entity';
import { profile, type Profile } from '../content/sections/profile';
import { actorEntity } from './actionLookup';
import { abilityOn, dpsLadder, toughnessLadder, type Ladder } from './pace';
import { PLAYER } from './state';
import { hitChance, minDamage } from './tuning';

export const SURVIVAL_WINDOW_SECONDS = 60;
export const SECONDS_PER_MINUTE = 60;

export const perSecond = (rate: number): number => rate / SECONDS_PER_MINUTE;

export function fightOf(registry: Registry, entity: Entity): FightShape | undefined {
  for (const named of entity.uses) {
    const action = registry.actions.get(named);
    const shape = action && fightShapeOf(action);
    if (shape) return shape;
  }
  return undefined;
}

export interface LadderedStats {
  dealt: string;
  pooled: string;
  pool: Ladder;
  dps: Ladder;
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
  if (dealt === undefined || pooled === undefined) return undefined;
  const pool = toughnessLadder(registry);
  const dps = dpsLadder(registry, dealt);
  if (pool === undefined || dps === undefined || pool.id !== pooled) return undefined;
  return { dealt, pooled, pool, dps };
}

export const activityFor = (registry: Registry, fight: FightShape): Activity | undefined => activitiesIn(registry).find((activity) => ladderedIn(registry, activity, fight) !== undefined);

export function ladderedFor(registry: Registry, fight: FightShape): LadderedStats | undefined {
  const activity = activityFor(registry, fight);
  return activity === undefined ? undefined : ladderedIn(registry, activity, fight);
}

export type Factor = Exclude<keyof Profile, 'id'>;

export const FACTORS: readonly Factor[] = Object.keys(profile.schema!.fields) as Factor[];

export interface Weighed {
  stat: string;
  against: number;
}

export function weighedFor(registry: Registry, fight: FightShape, laddered: LadderedStats, level: number | undefined, ours: (statId: string) => number): Record<Factor, Weighed> {
  const ourRate = ours(fight.rate);
  const ourAccuracy = ours(fight.accuracy.ours);
  const ourPool = level === undefined ? ours(laddered.pooled) : abilityOn(laddered.pool, level);
  const ourDealt = level === undefined ? ours(fight.damage.ours) : perHitFor(abilityOn(laddered.dps, level), ourRate, ourAccuracy, registry);
  return {
    rate: { stat: fight.rate, against: ourRate },
    damage: { stat: fight.damage.ours, against: ourDealt },
    accuracy: { stat: fight.accuracy.ours, against: ourAccuracy },
    evasion: { stat: fight.accuracy.theirs, against: ourAccuracy },
    reduction: { stat: fight.damage.theirs, against: ourDealt },
    pool: { stat: laddered.pooled, against: ourPool },
  };
}

export function landed(dealt: number, resistance: number, reduction: number, registry: Registry): number {
  const through = dealt * (1 - resistance / 100);
  return Math.max(Math.min(minDamage(registry), Math.max(through, 0)), through - reduction);
}

export const swingsPerSecond = (rate: number, accuracy: number, registry: Registry): number => perSecond(rate) * hitChance(accuracy, accuracy, registry);

export function perHitFor(dps: number, rate: number, accuracy: number, registry: Registry): number {
  const evenly = swingsPerSecond(rate, accuracy, registry);
  return evenly <= 0 ? 0 : dps / evenly;
}

export const dpsFor = (perHit: number, rate: number, accuracy: number, registry: Registry): number => perHit * swingsPerSecond(rate, accuracy, registry);

const dealtFor = (hit: number, resistance: number, reduction: number): number => (resistance >= 100 ? Infinity : (hit + reduction) / (1 - resistance / 100));

function declaredOn(registry: Registry, sheet: Entity | undefined, statId: string): number {
  const held = sheet?.stats[statId] ?? registry.stats.get(statId)?.base;
  return held === undefined ? 0 : midpoint(held);
}

function resistanceDeclaredOn(registry: Registry, sheet: Entity | undefined, type: string | undefined): number {
  if (type === undefined) return 0;
  let share = 0;
  for (const stat of registry.stats.values()) {
    if (stat.resists === type) share += declaredOn(registry, sheet, stat.id);
  }
  return share;
}

const derived = new WeakMap<Registry, Map<string, Readonly<Record<string, Range>> | null>>();

export function solvedStatsOf(registry: Registry, entity: Entity): Readonly<Record<string, Range>> | null {
  const cache = derived.get(registry) ?? new Map<string, Readonly<Record<string, Range>> | null>();
  derived.set(registry, cache);
  const held = cache.get(entity.id);
  if (held !== undefined) return held;
  const solved = solve(registry, entity);
  cache.set(entity.id, solved);
  return solved;
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

  const us = actorEntity(registry, PLAYER);
  const type = registry.stats.get(laddered.dealt)?.deals;
  const weighed = weighedFor(registry, fight, laddered, level, (statId) => declaredOn(registry, us, statId));
  const ourPool = weighed.pool.against;
  const ourRate = weighed.rate.against;
  const ourAccuracy = weighed.accuracy.against;
  const ourDealt = weighed.damage.against;
  const ourEvasion = declaredOn(registry, us, fight.accuracy.theirs);
  const ourReduction = declaredOn(registry, us, fight.damage.theirs);
  const ourResistance = resistanceDeclaredOn(registry, us, type);
  const theirResistance = resistanceDeclaredOn(registry, entity, type);

  const written = (statId: string): number | undefined => {
    const held = entity.stats[statId];
    return held === undefined ? undefined : midpoint(held);
  };
  const shaped = (factor: Factor): number | undefined => {
    const { stat, against } = weighed[factor];
    const said = profile[factor];
    return written(stat) ?? (said === undefined ? undefined : against * said);
  };

  const theirAccuracy = shaped('accuracy')!;
  const theirEvasion = shaped('evasion')!;

  const theyLand = hitChance(theirAccuracy, ourEvasion, registry);
  const askedDps = (tier.damageShare * ourPool) / SURVIVAL_WINDOW_SECONDS;
  const saidRate = shaped('rate');
  const saidDealt = shaped('damage');
  const theirDealt = saidDealt ?? dealtFor(askedDps / (perSecond(saidRate!) * theyLand), ourResistance, ourReduction);
  const perSwing = landed(theirDealt, ourResistance, ourReduction, registry);
  const rate = saidRate ?? (perSwing * theyLand <= 0 ? Infinity : (askedDps / (perSwing * theyLand)) * SECONDS_PER_MINUTE);

  const weLand = hitChance(ourAccuracy, theirEvasion, registry);
  const ourSwings = perSecond(ourRate) * weLand;
  const saidPool = shaped('pool');
  const saidReduction = shaped('reduction');
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
