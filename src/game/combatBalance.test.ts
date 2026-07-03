import { describe, expect, it } from 'vitest';
import {
  calculateAverageCombatDamage,
  calculateHitChance,
  calculateMaxCombatDamage,
  DEFAULT_COMBAT_BALANCE,
  diagnosticCombatDamage,
  expectedCombatDamage,
  resolveCombatBalance,
  sampleCombatDamage,
} from './combatBalance';

describe('combat balance model', () => {
  it('uses Elo hit chance with a spread of 100', () => {
    expect(calculateHitChance(10, 10)).toBeCloseTo(0.5, 8);
    expect(calculateHitChance(110, 10)).toBeCloseTo(10 / 11, 8);
    expect(calculateHitChance(0, 100)).toBeCloseTo(1 / 11, 8);
  });

  it('sets max hit to the scaled source stat with a minimum of one', () => {
    const balance = { 'damage-scaler': 0.1 };

    expect(calculateMaxCombatDamage(9, 10, balance)).toBe(1);
    expect(calculateMaxCombatDamage(10, 10, balance)).toBe(1);
    expect(calculateMaxCombatDamage(25, 10, balance)).toBe(2);
  });

  it('reports expected damage as hit chance times the average successful hit', () => {
    const average = calculateAverageCombatDamage(20, 20, DEFAULT_COMBAT_BALANCE);

    expect(calculateMaxCombatDamage(20, 20, DEFAULT_COMBAT_BALANCE)).toBe(2);
    expect(average).toBeCloseTo(0.75, 8);
    expect(expectedCombatDamage(20, 20, DEFAULT_COMBAT_BALANCE)).toMatchObject({
      hitChance: 0.5,
      maxDamage: 2,
      damage: average,
    });
  });

  it('samples misses or integer damage from one to max hit', () => {
    const balance = { 'damage-scaler': 0.1 };
    const hitRolls = [0, 0.99];

    expect(sampleCombatDamage(20, 20, balance, {}, () => 0.99).damage).toBe(0);
    expect(sampleCombatDamage(20, 20, balance, {}, () => hitRolls.shift() ?? 0).damage).toBe(2);
    expect(sampleCombatDamage(20, 20, balance, {}, () => 0.99).hit).toBe(false);
  });

  it('uses quarter, half, and three-quarter max hit for diagnostics', () => {
    const maxHit = calculateMaxCombatDamage(30, 30, DEFAULT_COMBAT_BALANCE);
    const hitChance = calculateHitChance(30, 30);

    expect(diagnosticCombatDamage(30, 30, DEFAULT_COMBAT_BALANCE, 'worst')).toBeCloseTo(hitChance * Math.ceil(maxHit * 0.25), 8);
    expect(diagnosticCombatDamage(30, 30, DEFAULT_COMBAT_BALANCE, 'average')).toBeCloseTo(hitChance * Math.ceil(maxHit * 0.5), 8);
    expect(diagnosticCombatDamage(30, 30, DEFAULT_COMBAT_BALANCE, 'best')).toBeCloseTo(hitChance * Math.ceil(maxHit * 0.75), 8);
  });

  it('defaults invalid or missing universe balance values', () => {
    expect(resolveCombatBalance()).toEqual(DEFAULT_COMBAT_BALANCE);
    expect(resolveCombatBalance({ 'damage-scaler': -1 })).toEqual(DEFAULT_COMBAT_BALANCE);
  });
});
