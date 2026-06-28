import type { EnemyDefinition } from '../types';
import { getEnemyStat } from '../enemies';

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const COMBAT_CV = 0.3;
/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const HITS_AT_PARITY = 7;
/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const BASELINE_POWER = 7;
/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const BASELINE_HEALTH = 100;
/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const DIAGNOSTIC_RATIOS = [0.6, 0.8, 1, 1.2, 1.5] as const;

const EPSILON = 1e-9;
const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);
const normalPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

const erf = (value: number) => {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
};

const normalCdf = (x: number) => 0.5 * (1 + erf(x / Math.sqrt(2)));

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const DAMAGE_SCALE = BASELINE_HEALTH / (
  HITS_AT_PARITY * (COMBAT_CV * BASELINE_POWER / SQRT_TWO_PI)
);

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export type CombatModifiers = {
  armorPenetration?: number;
  torpidity?: number;
  critChance?: number;
  critMultiplier?: number;
};

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export type CombatExpectation = {
  attack: number;
  defense: number;
  sigma: number;
  hitChance: number;
  rawDamage: number;
  damage: number;
};

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const effectiveCombatStats = (
  attackerPower: number,
  defenderPower: number,
  modifiers: CombatModifiers = {},
) => ({
  attack: Math.max(EPSILON, attackerPower - Math.max(0, modifiers.torpidity ?? 0)),
  defense: Math.max(0, defenderPower - Math.max(0, modifiers.armorPenetration ?? 0)),
});

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const expectedCombatDamage = (
  attackerPower: number,
  defenderPower: number,
  modifiers: CombatModifiers = {},
): CombatExpectation => {
  const { attack, defense } = effectiveCombatStats(attackerPower, defenderPower, modifiers);
  const sigma = Math.max(EPSILON, COMBAT_CV * attack);
  const delta = attack - defense;
  const z = delta / sigma;
  const rawDamage = delta * normalCdf(z) + sigma * normalPdf(z);
  const critChance = Math.min(1, Math.max(0, (modifiers.critChance ?? 0) / 100));
  const critMultiplier = Math.max(1, modifiers.critMultiplier ?? 1);
  const critFactor = 1 + critChance * (critMultiplier - 1);

  return {
    attack,
    defense,
    sigma,
    hitChance: normalCdf(z),
    rawDamage,
    damage: rawDamage * DAMAGE_SCALE * critFactor,
  };
};

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const canonicalHealth = (power: number) =>
  HITS_AT_PARITY * expectedCombatDamage(power, power).damage;

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export type EnemyDiagnosticReference = {
  playerHealth: number;
  playerRegenerationPerMinute: number;
  playerActionSeconds: number;
};

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export type EnemyDiagnostics = {
  canonicalHealth: number;
  parityActionsToKill: number;
  actionsToKill: Array<{ ratio: number; actions: number }>;
  fightsPerDeath: Array<{ attackRatio: number; defenseRatio: number; value: number }>;
};

const durationOrInfinity = (health: number, netDps: number) =>
  netDps <= EPSILON ? Number.POSITIVE_INFINITY : health / netDps;

/** @deprecated Retained for audit/reference only. Active combat uses src/game/combatBalance.ts. */
export const calculateEnemyDiagnostics = (
  enemy: EnemyDefinition,
  reference: EnemyDiagnosticReference,
): EnemyDiagnostics => {
  const enemyRegenerationPerSecond = Math.max(0, getEnemyStat(enemy, 'regeneration')) / 60;
  const playerRegenerationPerSecond = Math.max(0, reference.playerRegenerationPerMinute) / 60;
  const playerActionSeconds = Math.max(EPSILON, reference.playerActionSeconds);
  const enemyActionSeconds = getEnemyStat(enemy, 'rate') > 0 ? 60 / getEnemyStat(enemy, 'rate') : Number.POSITIVE_INFINITY;
  const enemyDefense = getEnemyStat(enemy, 'defense');
  const parityDamage = expectedCombatDamage(enemyDefense, enemyDefense).damage;

  const actionsToKill = DIAGNOSTIC_RATIOS.map((ratio) => {
    const damage = expectedCombatDamage(enemyDefense * ratio, enemyDefense).damage;
    const netDps = damage / playerActionSeconds - enemyRegenerationPerSecond;
    const timeToKill = durationOrInfinity(getEnemyStat(enemy, 'health'), netDps);

    return {
      ratio,
      actions: Number.isFinite(timeToKill) ? timeToKill / playerActionSeconds : Number.POSITIVE_INFINITY,
    };
  });

  const fightsPerDeath = DIAGNOSTIC_RATIOS.flatMap((attackRatio) =>
    DIAGNOSTIC_RATIOS.map((defenseRatio) => {
      const outgoingDamage = expectedCombatDamage(enemyDefense * attackRatio, enemyDefense).damage;
      const enemyAttack = getEnemyStat(enemy, 'attack');
      const incomingDamage = expectedCombatDamage(enemyAttack, enemyAttack * defenseRatio, {
        armorPenetration: getEnemyStat(enemy, 'armorPenetration'),
        torpidity: getEnemyStat(enemy, 'torpidity'),
        critChance: getEnemyStat(enemy, 'critChance'),
        critMultiplier: getEnemyStat(enemy, 'critMultiplier'),
      }).damage;
      const netDpsDealt = outgoingDamage / playerActionSeconds - enemyRegenerationPerSecond;
      const netDpsReceived = Number.isFinite(enemyActionSeconds)
        ? incomingDamage / enemyActionSeconds - playerRegenerationPerSecond
        : -playerRegenerationPerSecond;
      const timeToKill = durationOrInfinity(getEnemyStat(enemy, 'health'), netDpsDealt);
      const timeToDie = durationOrInfinity(reference.playerHealth, netDpsReceived);
      const value = !Number.isFinite(timeToKill)
        ? 0
        : !Number.isFinite(timeToDie)
          ? Number.POSITIVE_INFINITY
          : timeToDie / timeToKill;

      return { attackRatio, defenseRatio, value };
    }),
  );

  return {
    canonicalHealth: canonicalHealth(enemyDefense),
    parityActionsToKill: parityDamage <= EPSILON ? Number.POSITIVE_INFINITY : getEnemyStat(enemy, 'health') / parityDamage,
    actionsToKill,
    fightsPerDeath,
  };
};
