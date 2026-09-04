import type { FightShape } from '../grammar/action';
import type { Registry } from '../content/registry';
import type { Entity } from '../content/sections/entity';
import type { Profile } from '../content/sections/profile';
import type { Tier } from '../content/sections/tier';
import { landed, perHitFor, perSecond, SURVIVAL_WINDOW_SECONDS, type LadderedStats } from './foeSolve';
import { initialState } from './save';
import { hitChance, statValue } from './stats';
import { dpsAtLevel, toughnessAtLevel } from './pace';
import type { GameState } from './state';
import { PLAYER } from './state';

export { fightShapeOf } from '../grammar/action';
export type { Contested, FightShape } from '../grammar/action';
export { activityFor, fightOf, ladderedFor, ladderedIn, solvedStatsOf, SURVIVAL_WINDOW_SECONDS, type LadderedStats } from './foeSolve';

export interface Fighter {
  entity: Entity;
  fight: FightShape;
  tier?: Tier;
  profile?: Profile;
  level?: number;
}

const references = new WeakMap<Registry, GameState>();

export function referencePlayer(registry: Registry): GameState {
  const held = references.get(registry);
  if (held) return held;
  const made = initialState(registry);
  references.set(registry, made);
  return made;
}

export interface Reading {
  secondsToFell: number;
  damageShare: number;
}

export function resistanceTo(registry: Registry, type: string | undefined, state: GameState, actorId: string): number {
  if (type === undefined) return 0;
  let share = 0;
  for (const stat of registry.stats.values()) {
    if (stat.resists === type) share += statValue(stat.id, state, registry, actorId);
  }
  return share;
}

export function readingAt(registry: Registry, state: GameState, fighter: Fighter, laddered: LadderedStats, level: number): Reading {
  const { entity, fight } = fighter;
  const foe = entity.id;
  const type = registry.stats.get(laddered.dealt)?.deals;

  const ourPool = toughnessAtLevel(level);
  const ourRateNow = statValue(fight.rate, state, registry, PLAYER);
  const ourAccuracyNow = statValue(fight.accuracy.ours, state, registry, PLAYER);
  const ourDealt = perHitFor(dpsAtLevel(level), ourRateNow, ourAccuracyNow, registry);
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
