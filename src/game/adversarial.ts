import type {
  ActionResolutionContext,
  EnemyDefinition,
  GameAction,
  InteractionTypeDefinition,
  UniversePlayState,
} from './types';
import {
  expectedCombatDamage,
  resolveManifestCombatBalance,
  sampleCombatDamage,
} from './combatBalance';
import { getEnemyStat } from './enemies';
import { getCharacterStatValue, getSkillTotals } from './characterStats';
export { getSkillTotals } from './characterStats';

const DEFAULT_RATE = 1;
const DEFAULT_ACTIONS_PER_MINUTE = 25;
export const ACTION_RATE_STAT_ID = 'action-rate';
const EPSILON = 0.000001;

export const expectedDamage = (attackerPower: number, defenderPower: number) =>
  expectedCombatDamage(attackerPower, defenderPower).damage;

export const actionDps = (
  attackerPower: number,
  defenderPower: number,
  actionTimeSeconds: number,
) => expectedDamage(attackerPower, defenderPower) / Math.max(EPSILON, actionTimeSeconds);

export const getEnemy = (
  action: GameAction,
  context: ActionResolutionContext,
): EnemyDefinition | null =>
  action.enemyId ? context.enemies.find((enemy) => enemy.id === action.enemyId) ?? null : null;

export const getInteractionType = (
  action: GameAction,
  context: ActionResolutionContext,
): InteractionTypeDefinition | null =>
  (getEnemy(action, context)?.interactionTypeId ?? action.interactionTypeId)
    ? context.interactionTypes.find((interactionType) => interactionType.id === (getEnemy(action, context)?.interactionTypeId ?? action.interactionTypeId)) ?? null
    : null;

export const isContinuousAction = (
  action: GameAction,
  context: ActionResolutionContext,
) => Boolean(getEnemy(action, context));

export const getActionStats = (
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const interactionType = getInteractionType(action, context);
  const sourceStat = context.stats?.find((stat) => stat.id === interactionType?.sourceStatId);
  const targetStat = context.stats?.find((stat) => stat.id === interactionType?.targetStatId);

  return {
    interactionType,
    sourceStat,
    targetStat,
    sourceSkill: context.skills.find((skill) => skill.statId === sourceStat?.id),
  };
};

export const getActionDurationMs = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  if (getEnemy(action, context)) {
    const actionsPerMinute = getCharacterStatValue(state, context.stats ?? [], ACTION_RATE_STAT_ID, context.skills) || DEFAULT_ACTIONS_PER_MINUTE;
    return 60_000 / Math.max(EPSILON, actionsPerMinute);
  }

  const { sourceSkill } = getActionStats(action, context);
  const rate = sourceSkill ? getSkillTotals(state, sourceSkill).rate : DEFAULT_RATE;

  return (action.durationSeconds * 1000) / Math.max(EPSILON, rate);
};

export const getActionDps = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const enemy = getEnemy(action, context);
  const { sourceStat } = getActionStats(action, context);

  if (!sourceStat || !enemy) {
    return null;
  }

  const source = getCharacterStatValue(state, context.stats ?? [], sourceStat.id, context.skills);
  return expectedCombatDamage(source, getEnemyStat(enemy, 'defense'), resolveManifestCombatBalance(context.manifest)).damage /
    (getActionDurationMs(state, action, context) / 1000);
};

export const getEnemyAttackDps = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const enemy = getEnemy(action, context);
  const interactionType = getInteractionType(action, context);
  const attacksPerMinute = enemy ? getEnemyStat(enemy, 'rate') : 0;
  const targetStat = context.stats?.find((stat) => stat.id === interactionType?.targetStatId);

  if (!enemy || !interactionType?.targetPlayerHealth || attacksPerMinute <= 0 || !targetStat) {
    return null;
  }

  const target = getCharacterStatValue(state, context.stats ?? [], targetStat.id, context.skills);
  return expectedCombatDamage(getEnemyStat(enemy, 'attack'), target, resolveManifestCombatBalance(context.manifest), {
    armorPenetration: getEnemyStat(enemy, 'armorPenetration'),
    torpidity: getEnemyStat(enemy, 'torpidity'),
    critChance: getEnemyStat(enemy, 'critChance'),
    critMultiplier: getEnemyStat(enemy, 'critMultiplier'),
  }).damage * (attacksPerMinute / 60);
};

export const sampleAdversarialDamage = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  random = Math.random,
) => {
  const enemy = getEnemy(action, context);
  const { sourceStat } = getActionStats(action, context);

  if (!sourceStat || !enemy) {
    return null;
  }

  const source = getCharacterStatValue(state, context.stats ?? [], sourceStat.id, context.skills);
  const target = getEnemyStat(enemy, 'defense');
  const sample = sampleCombatDamage(source, target, resolveManifestCombatBalance(context.manifest), {}, random);

  return {
    sample: sample.roll,
    rawDamage: sample.damage,
    damage: sample.damage,
    source,
    target,
  };
};

export const sampleEnemyAttackDamage = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  random = Math.random,
) => {
  const enemy = getEnemy(action, context);
  const interactionType = getInteractionType(action, context);
  const targetStat = context.stats?.find((stat) => stat.id === interactionType?.targetStatId);

  if (!enemy || !interactionType?.targetPlayerHealth || getEnemyStat(enemy, 'rate') <= 0 || !targetStat) {
    return null;
  }

  const target = getCharacterStatValue(state, context.stats ?? [], targetStat.id, context.skills);
  const sample = sampleCombatDamage(getEnemyStat(enemy, 'attack'), target, resolveManifestCombatBalance(context.manifest), {
    armorPenetration: getEnemyStat(enemy, 'armorPenetration'),
    torpidity: getEnemyStat(enemy, 'torpidity'),
  }, random);
  const critChance = Math.min(1, Math.max(0, getEnemyStat(enemy, 'critChance') / 100));
  const critical = sample.damage > 0 && random() < critChance;
  const critMultiplier = critical ? Math.max(1, getEnemyStat(enemy, 'critMultiplier')) : 1;

  return {
    sample: sample.roll,
    rawDamage: sample.damage,
    damage: sample.damage * critMultiplier,
    critical,
    source: sample.attack,
    target,
  };
};
