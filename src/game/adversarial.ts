import type {
  ActionResolutionContext,
  EnemyDefinition,
  GameAction,
  InteractionTypeDefinition,
  UniversePlayState,
} from './types';
import {
  COMBAT_CV,
  DAMAGE_SCALE,
  effectiveCombatStats,
  expectedCombatDamage,
} from './combatBalance';
import { getSkillTotals } from './characterStats';
export { getSkillTotals } from './characterStats';

const DEFAULT_RATE = 1;
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

export const getActionSkills = (
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const interactionType = getInteractionType(action, context);
  const sourceSkillId = interactionType?.sourceSkillId;
  const targetSkillId = interactionType?.targetSkillId;

  return {
    interactionType,
    sourceSkill: context.skills.find((skill) => skill.id === sourceSkillId),
    targetSkill: context.skills.find((skill) => skill.id === targetSkillId),
  };
};

export const getActionDurationMs = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const { sourceSkill } = getActionSkills(action, context);
  const rate = sourceSkill ? getSkillTotals(state, sourceSkill).rate : DEFAULT_RATE;

  return (action.durationSeconds * 1000) / Math.max(EPSILON, rate);
};

export const getActionDps = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const enemy = getEnemy(action, context);
  const { sourceSkill } = getActionSkills(action, context);

  if (!sourceSkill || !enemy) {
    return null;
  }

  const source = getSkillTotals(state, sourceSkill);
  return expectedCombatDamage(source.effectiveTotal, enemy.defense).damage /
    (getActionDurationMs(state, action, context) / 1000);
};

export const getEnemyAttackDurationMs = (
  enemy: EnemyDefinition | null,
) => enemy && enemy.rate > 0 ? 60_000 / enemy.rate : null;

export const getEnemyAttackDps = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  const enemy = getEnemy(action, context);
  const interactionType = getInteractionType(action, context);
  const attackDurationMs = getEnemyAttackDurationMs(enemy);
  const targetSkill = context.skills.find((skill) => skill.id === interactionType?.targetSkillId);

  if (!enemy || !interactionType?.targetPlayerHealth || !attackDurationMs || !targetSkill) {
    return null;
  }

  const target = getSkillTotals(state, targetSkill);
  return expectedCombatDamage(enemy.attack, target.effectiveTotal, {
    armorPenetration: enemy.armorPenetration,
    torpidity: enemy.torpidity,
    critChance: enemy.critChance,
    critMultiplier: enemy.critMultiplier,
  }).damage / (attackDurationMs / 1000);
};

export const sampleNormal = (mean: number, standardDeviation: number, random = Math.random) => {
  const u1 = Math.max(Number.EPSILON, random());
  const u2 = random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  return mean + z0 * standardDeviation;
};

export const sampleAdversarialDamage = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  random = Math.random,
) => {
  const enemy = getEnemy(action, context);
  const { sourceSkill } = getActionSkills(action, context);

  if (!sourceSkill || !enemy) {
    return null;
  }

  const source = getSkillTotals(state, sourceSkill);
  const sigma = COMBAT_CV * source.effectiveTotal;
  const sample = sampleNormal(source.effectiveTotal, sigma, random);
  const rawDamage = Math.max(0, sample - enemy.defense);

  return {
    sample,
    rawDamage,
    damage: rawDamage * DAMAGE_SCALE,
    source,
    target: enemy.defense,
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
  const targetSkill = context.skills.find((skill) => skill.id === interactionType?.targetSkillId);

  if (!enemy || !interactionType?.targetPlayerHealth || enemy.rate <= 0 || !targetSkill) {
    return null;
  }

  const target = getSkillTotals(state, targetSkill);
  const effective = effectiveCombatStats(enemy.attack, target.effectiveTotal, {
    armorPenetration: enemy.armorPenetration,
    torpidity: enemy.torpidity,
  });
  const sigma = COMBAT_CV * effective.attack;
  const sample = sampleNormal(effective.attack, sigma, random);
  const rawDamage = Math.max(0, sample - effective.defense);
  const critChance = Math.min(1, Math.max(0, enemy.critChance / 100));
  const critical = rawDamage > 0 && random() < critChance;
  const critMultiplier = critical ? Math.max(1, enemy.critMultiplier) : 1;

  return {
    sample,
    rawDamage,
    damage: rawDamage * DAMAGE_SCALE * critMultiplier,
    critical,
    source: effective.attack,
    target,
  };
};
