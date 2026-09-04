import type { Action } from '../../src/grammar/action';
import { isFight } from '../../src/grammar/action';
import type { Registry } from '../../src/content/registry';
import type { Entity } from '../../src/content/sections/entity';
import type { Tier } from '../../src/content/sections/tier';
import { opposes } from '../../src/runtime/encounter';
import { hitChance, statValue } from '../../src/runtime/stats';
import { minDamage } from '../../src/runtime/tuning';
import type { GameState } from '../../src/runtime/state';
import { PLAYER } from '../../src/runtime/state';
import { abilityAtLevelIn } from './pace';
import type { Activity } from './tiers';

export const SURVIVAL_WINDOW_SECONDS = 60;

const SECONDS_PER_MINUTE = 60;

export interface Contested {
  ours: string;
  theirs: string;
}

export interface FightShape {
  rate: string;
  accuracy: Contested;
  damage: Contested;
  pool: string;
}

const sidedId = (held: unknown): string | undefined => (typeof held === 'object' && held !== null && 'id' in held ? String((held as { id: unknown }).id) : undefined);

export function fightShapeOf(action: Action): FightShape | undefined {
  if (!isFight(action) || action.accuracy === undefined || action.damage === undefined) return undefined;
  const rate = typeof action.rate === 'object' ? sidedId(action.rate) : undefined;
  const [hitOurs, hitTheirs] = [sidedId(action.accuracy.left), sidedId(action.accuracy.right)];
  const [hurtOurs, hurtTheirs] = [sidedId(action.damage.left), sidedId(action.damage.right)];
  const pool = sidedId(action.depletes);
  if (!rate || !hitOurs || !hitTheirs || !hurtOurs || !hurtTheirs || !pool) return undefined;
  return { rate, accuracy: { ours: hitOurs, theirs: hitTheirs }, damage: { ours: hurtOurs, theirs: hurtTheirs }, pool };
}

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
}

export function fightersIn(registry: Registry): Fighter[] {
  const found: Fighter[] = [];
  for (const entity of registry.entities.values()) {
    const fight = fightOf(registry, entity);
    if (!fight || !opposes(registry, entity.id, PLAYER)) continue;
    found.push({ entity, fight, tier: entity.tier === undefined ? undefined : registry.tiers.get(entity.tier) });
  }
  return found;
}

export interface LadderedStats {
  dealt: string;
  pooled: string;
}

export function ladderedStatsFor(registry: Registry, activity: Activity, fight: FightShape): LadderedStats | undefined {
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

export interface Reading {
  secondsToFell: number;
  damageShare: number;
}

const perSecond = (rate: number): number => rate / SECONDS_PER_MINUTE;

function resistanceTo(registry: Registry, type: string, state: GameState, actorId: string): number {
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
  const type = registry.stats.get(laddered.dealt)!.deals!;

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
