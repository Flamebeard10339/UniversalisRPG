import type { CombatBalanceDefinition, UniverseManifest } from './types';

export const DEFAULT_COMBAT_BALANCE: CombatBalanceDefinition = {
  'damage-scaler': 0.1,
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
  hitChance: number;
  maxDamage: number;
  damage: number;
};

export type CombatSample = CombatExpectation & {
  damageRoll: number;
  hit: boolean;
  roll: number;
};

export type DiagnosticHitCase = 'worst' | 'average' | 'best';

const DEFENSE_FLOOR = 1;

export const resolveCombatBalance = (
  balance?: Partial<CombatBalanceDefinition>,
): CombatBalanceDefinition => ({
  'damage-scaler': Number.isFinite(balance?.['damage-scaler']) && Number(balance?.['damage-scaler']) > 0
    ? Number(balance?.['damage-scaler'])
    : DEFAULT_COMBAT_BALANCE['damage-scaler'],
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

export const calculateHitChance = (
  attackerPower: number,
  defenderPower: number,
  modifiers: CombatModifiers = {},
) => {
  const { attack, defense } = effectiveCombatStats(attackerPower, defenderPower, modifiers);
  return 1 / (1 + Math.pow(10, (defense - attack) / 100));
};

const calculateAverageUniformHitDamage = (maxDamage: number) => (1 + maxDamage) / 2;

export const calculateAverageCombatDamage = (
  attackerPower: number,
  defenderPower: number,
  balanceInput?: Partial<CombatBalanceDefinition>,
  modifiers: CombatModifiers = {},
) => {
  const balance = resolveCombatBalance(balanceInput);
  const { attack, defense } = effectiveCombatStats(attackerPower, defenderPower, modifiers);
  const maxDamage = calculateMaxCombatDamage(attackerPower, defenderPower, balance, modifiers);
  const hitChance = calculateHitChance(attack, defense);

  return hitChance * calculateAverageUniformHitDamage(maxDamage) * critExpectationFactor(modifiers);
};

export const calculateMaxCombatDamage = (
  attackerPower: number,
  defenderPower: number,
  balanceInput?: Partial<CombatBalanceDefinition>,
  modifiers: CombatModifiers = {},
) => {
  const balance = resolveCombatBalance(balanceInput);
  const { attack } = effectiveCombatStats(attackerPower, defenderPower, modifiers);
  return Math.max(1, Math.floor(attack * balance['damage-scaler']));
};

export const expectedCombatDamage = (
  attackerPower: number,
  defenderPower: number,
  balanceInput?: Partial<CombatBalanceDefinition>,
  modifiers: CombatModifiers = {},
): CombatExpectation => {
  const { attack, defense } = effectiveCombatStats(attackerPower, defenderPower, modifiers);
  const hitChance = calculateHitChance(attackerPower, defenderPower, modifiers);
  const maxDamage = calculateMaxCombatDamage(attackerPower, defenderPower, balanceInput, modifiers);
  const averageDamage = calculateAverageCombatDamage(attackerPower, defenderPower, balanceInput, modifiers);

  return {
    attack,
    defense,
    hitChance,
    averageDamage,
    maxDamage,
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
  const hit = roll < expectation.hitChance;
  const damageRoll = hit ? Math.min(1, Math.max(0, random())) : 0;
  const damage = hit
    ? Math.max(1, Math.ceil(damageRoll * expectation.maxDamage))
    : 0;

  return {
    ...expectation,
    damageRoll,
    hit,
    roll,
    damage,
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
  return expectation.hitChance
    * Math.max(1, Math.ceil(expectation.maxDamage * diagnosticHitRoll(hitCase)))
    * critExpectationFactor(modifiers);
};
