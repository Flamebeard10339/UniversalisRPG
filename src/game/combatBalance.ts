import type { CombatBalanceDefinition, UniverseManifest } from './types';

export const DEFAULT_COMBAT_BALANCE: CombatBalanceDefinition = {
  expectedHitsToKill: 1 / 7,
  combatSpread: 1,
};

export type CombatModifiers = {
  armorPenetration?: number;
  torpidity?: number;
  critChance?: number;
  critMultiplier?: number;
};

export type CombatExpectation = {
  attack: number;
  defense: number;
  averageDamage: number;
  maxDamage: number;
  damage: number;
};

export type CombatSample = CombatExpectation & {
  roll: number;
};

export type DiagnosticHitCase = 'worst' | 'average' | 'best';

const DEFENSE_FLOOR = 1;

export const resolveCombatBalance = (
  balance?: Partial<CombatBalanceDefinition>,
): CombatBalanceDefinition => ({
  expectedHitsToKill: Number.isFinite(balance?.expectedHitsToKill) && Number(balance?.expectedHitsToKill) > 0
    ? Number(balance?.expectedHitsToKill)
    : DEFAULT_COMBAT_BALANCE.expectedHitsToKill,
  combatSpread: Number.isFinite(balance?.combatSpread) && Number(balance?.combatSpread) >= 0
    ? Number(balance?.combatSpread)
    : DEFAULT_COMBAT_BALANCE.combatSpread,
});

export const resolveManifestCombatBalance = (
  manifest?: Pick<UniverseManifest, 'combatBalance'>,
) => resolveCombatBalance(manifest?.combatBalance);

export const effectiveCombatStats = (
  attackerPower: number,
  defenderPower: number,
  modifiers: CombatModifiers = {},
) => ({
  attack: Math.max(0, attackerPower - Math.max(0, modifiers.torpidity ?? 0)),
  defense: Math.max(DEFENSE_FLOOR, defenderPower - Math.max(0, modifiers.armorPenetration ?? 0)),
});

export const critExpectationFactor = (modifiers: CombatModifiers = {}) => {
  const critChance = Math.min(1, Math.max(0, (modifiers.critChance ?? 0) / 100));
  const critMultiplier = Math.max(1, modifiers.critMultiplier ?? 1);
  return 1 + critChance * (critMultiplier - 1);
};

export const calculateAverageCombatDamage = (
  attackerPower: number,
  defenderPower: number,
  balanceInput?: Partial<CombatBalanceDefinition>,
  modifiers: CombatModifiers = {},
) => {
  const balance = resolveCombatBalance(balanceInput);
  const { attack, defense } = effectiveCombatStats(attackerPower, defenderPower, modifiers);

  if (attack <= 0) {
    return 0;
  }

  const ratio = attack / defense;
  return balance.expectedHitsToKill
    * Math.pow(ratio, balance.combatSpread)
    * attack
    * critExpectationFactor(modifiers);
};

export const calculateMaxCombatDamage = (
  attackerPower: number,
  defenderPower: number,
  balanceInput?: Partial<CombatBalanceDefinition>,
  modifiers: CombatModifiers = {},
) => calculateAverageCombatDamage(attackerPower, defenderPower, balanceInput, modifiers) * 2;

export const expectedCombatDamage = (
  attackerPower: number,
  defenderPower: number,
  balanceInput?: Partial<CombatBalanceDefinition>,
  modifiers: CombatModifiers = {},
): CombatExpectation => {
  const { attack, defense } = effectiveCombatStats(attackerPower, defenderPower, modifiers);
  const averageDamage = calculateAverageCombatDamage(attackerPower, defenderPower, balanceInput, modifiers);

  return {
    attack,
    defense,
    averageDamage,
    maxDamage: averageDamage * 2,
    damage: averageDamage,
  };
};

export const sampleCombatDamage = (
  attackerPower: number,
  defenderPower: number,
  balanceInput?: Partial<CombatBalanceDefinition>,
  modifiers: CombatModifiers = {},
  random = Math.random,
): CombatSample => {
  const expectation = expectedCombatDamage(attackerPower, defenderPower, balanceInput, modifiers);
  const roll = Math.min(1, Math.max(0, random()));

  return {
    ...expectation,
    roll,
    damage: expectation.maxDamage * roll,
  };
};

export const diagnosticHitRoll = (hitCase: DiagnosticHitCase) => {
  if (hitCase === 'worst') return 0.25;
  if (hitCase === 'best') return 0.75;
  return 0.5;
};

export const diagnosticCombatDamage = (
  attackerPower: number,
  defenderPower: number,
  balanceInput: Partial<CombatBalanceDefinition> | undefined,
  hitCase: DiagnosticHitCase,
  modifiers: CombatModifiers = {},
) => {
  const expectation = expectedCombatDamage(attackerPower, defenderPower, balanceInput, modifiers);
  return expectation.maxDamage * diagnosticHitRoll(hitCase);
};
