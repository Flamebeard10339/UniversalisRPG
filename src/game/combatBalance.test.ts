import { describe, expect, it } from 'vitest';
import {
  calculateAverageCombatDamage,
  calculateMaxCombatDamage,
  DEFAULT_COMBAT_BALANCE,
  diagnosticCombatDamage,
  expectedCombatDamage,
  resolveCombatBalance,
  sampleCombatDamage,
} from './combatBalance';

describe('combat balance model', () => {
  it('kills in seven average hits when health, attack, and defense match defaults', () => {
    const health = 14;
    const damage = calculateAverageCombatDamage(health, health, DEFAULT_COMBAT_BALANCE);

    expect(health / damage).toBeCloseTo(7, 8);
  });

  it('scales attack deltas by combat spread', () => {
    const balance = { expectedHitsToKill: 1 / 7, combatSpread: 1 };
    const parity = calculateAverageCombatDamage(10, 10, balance);
    const doubled = calculateAverageCombatDamage(20, 10, balance);
    const halved = calculateAverageCombatDamage(5, 10, balance);

    expect(doubled).toBeCloseTo(parity * 4, 8);
    expect(halved).toBeCloseTo(parity * 0.25, 8);
  });

  it('makes max hit exactly twice average damage', () => {
    const average = calculateAverageCombatDamage(12, 8, DEFAULT_COMBAT_BALANCE);

    expect(calculateMaxCombatDamage(12, 8, DEFAULT_COMBAT_BALANCE)).toBeCloseTo(average * 2, 8);
    expect(expectedCombatDamage(12, 8, DEFAULT_COMBAT_BALANCE).maxDamage).toBeCloseTo(average * 2, 8);
  });

  it('samples uniformly from zero to max hit', () => {
    const average = calculateAverageCombatDamage(10, 10, DEFAULT_COMBAT_BALANCE);

    expect(sampleCombatDamage(10, 10, DEFAULT_COMBAT_BALANCE, {}, () => 0).damage).toBe(0);
    expect(sampleCombatDamage(10, 10, DEFAULT_COMBAT_BALANCE, {}, () => 0.5).damage).toBeCloseTo(average, 8);
    expect(sampleCombatDamage(10, 10, DEFAULT_COMBAT_BALANCE, {}, () => 1).damage).toBeCloseTo(average * 2, 8);
  });

  it('uses quarter, half, and three-quarter max hit for diagnostics', () => {
    const maxHit = calculateMaxCombatDamage(10, 10, DEFAULT_COMBAT_BALANCE);

    expect(diagnosticCombatDamage(10, 10, DEFAULT_COMBAT_BALANCE, 'worst')).toBeCloseTo(maxHit * 0.25, 8);
    expect(diagnosticCombatDamage(10, 10, DEFAULT_COMBAT_BALANCE, 'average')).toBeCloseTo(maxHit * 0.5, 8);
    expect(diagnosticCombatDamage(10, 10, DEFAULT_COMBAT_BALANCE, 'best')).toBeCloseTo(maxHit * 0.75, 8);
  });

  it('defaults invalid or missing universe balance values', () => {
    expect(resolveCombatBalance()).toEqual(DEFAULT_COMBAT_BALANCE);
    expect(resolveCombatBalance({ expectedHitsToKill: -1, combatSpread: -1 })).toEqual(DEFAULT_COMBAT_BALANCE);
  });
});
