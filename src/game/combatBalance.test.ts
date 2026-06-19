import { describe, expect, it } from 'vitest';
import {
  BASELINE_HEALTH,
  BASELINE_POWER,
  calculateEnemyDiagnostics,
  canonicalHealth,
  expectedCombatDamage,
  HITS_AT_PARITY,
} from './combatBalance';
import type { EnemyDefinition } from './types';

const enemy: EnemyDefinition = {
  id: 'test-enemy',
  interactionTypeId: 'melee-combat',
  attack: BASELINE_POWER,
  defense: BASELINE_POWER,
  health: BASELINE_HEALTH,
  rate: 60,
  regeneration: 0,
  armorPenetration: 0,
  torpidity: 0,
  critChance: 0,
  critMultiplier: 2,
  rewards: [],
};

describe('combat balance model', () => {
  it('is scale invariant for equivalent power ratios', () => {
    const low = expectedCombatDamage(100, 102).damage / 100;
    const high = expectedCombatDamage(10_000, 10_200).damage / 10_000;

    expect(high).toBeCloseTo(low, 8);
  });

  it('anchors canonical parity fights at seven actions', () => {
    const damage = expectedCombatDamage(BASELINE_POWER, BASELINE_POWER).damage;

    expect(canonicalHealth(BASELINE_POWER)).toBeCloseTo(BASELINE_HEALTH, 8);
    expect(canonicalHealth(BASELINE_POWER) / damage).toBeCloseTo(HITS_AT_PARITY, 8);
  });

  it('reports actual parity actions for designer-selected round health', () => {
    const diagnostics = calculateEnemyDiagnostics({ ...enemy, health: 120 }, {
      playerHealth: 100,
      playerRegenerationPerMinute: 0,
      playerActionSeconds: 1,
    });

    expect(diagnostics.parityActionsToKill).toBeCloseTo(8.4, 5);
  });

  it('reports immortality and unwinnable fights without clamping', () => {
    const immortal = calculateEnemyDiagnostics(enemy, {
      playerHealth: 100,
      playerRegenerationPerMinute: 10_000,
      playerActionSeconds: 1,
    });
    const unwinnable = calculateEnemyDiagnostics({ ...enemy, regeneration: 10_000 }, {
      playerHealth: 100,
      playerRegenerationPerMinute: 0,
      playerActionSeconds: 1,
    });

    expect(immortal.fightsPerDeath.some((cell) => cell.value === Number.POSITIVE_INFINITY)).toBe(true);
    expect(unwinnable.fightsPerDeath.every((cell) => cell.value === 0)).toBe(true);
  });

  it('applies analytical special-effect modifiers', () => {
    const base = expectedCombatDamage(10, 10).damage;
    const penetrated = expectedCombatDamage(10, 10, { armorPenetration: 3 }).damage;
    const torpid = expectedCombatDamage(10, 10, { torpidity: 3 }).damage;
    const critical = expectedCombatDamage(10, 10, { critChance: 50, critMultiplier: 2 }).damage;

    expect(penetrated).toBeGreaterThan(base);
    expect(torpid).toBeLessThan(base);
    expect(critical).toBeCloseTo(base * 1.5, 8);
  });
});
