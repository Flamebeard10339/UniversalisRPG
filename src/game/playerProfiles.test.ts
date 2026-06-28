import { describe, expect, it } from 'vitest';
import {
  calculateProfileEnemyDiagnostic,
  DEBUG_PLAYER_PROFILES,
  getProfileStatSummary,
  getProfileStatValue,
} from './playerProfiles';
import type { ContentBundle, EnemyDefinition } from './types';

const bundle: ContentBundle = {
  manifest: {
    schemaVersion: 1,
    id: 'test',
    version: '1',
    author: 'test',
    locales: ['en'],
    files: [],
    combatBalance: { expectedHitsToKill: 1 / 7, combatSpread: 1 },
  },
  locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true }],
  edges: [],
  actions: [],
  skills: [
    { id: 'attack', maxLevel: 100 },
    { id: 'defense', maxLevel: 100 },
    { id: 'woodcutting', maxLevel: 100 },
    { id: 'regeneration', maxLevel: 100 },
  ],
  stats: [
    { id: 'attack', base: 6, skillId: 'attack' },
    { id: 'defense', base: 6, skillId: 'defense' },
    { id: 'woodcutting', base: 0, skillId: 'woodcutting' },
    { id: 'health', base: 100 },
    { id: 'regeneration', skillId: 'regeneration' },
  ],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [{ id: 'melee-combat', sourceStatId: 'attack', targetStatId: 'defense', targetPlayerHealth: true }],
  enemies: [],
  locales: {},
};

const enemy: EnemyDefinition = {
  id: 'test-enemy',
  interactionTypeId: 'melee-combat',
  attack: 10,
  defense: 10,
  health: 100,
  rate: 30,
  regeneration: 0,
  armorPenetration: 0,
  torpidity: 0,
  critChance: 0,
  critMultiplier: 1,
  rewards: [],
};

describe('debug player profiles', () => {
  it('calculates equipment profile stats through the stat system', () => {
    const sword = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'trained-10-sword')!;
    const shield = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'trained-10-shield')!;

    expect(getProfileStatValue(bundle, sword, 'attack')).toBeCloseTo(24.15, 5);
    expect(getProfileStatValue(bundle, sword, 'defense')).toBe(16);
    expect(getProfileStatValue(bundle, shield, 'attack')).toBe(16);
    expect(getProfileStatValue(bundle, shield, 'defense')).toBeCloseTo(24.15, 5);
  });

  it('summarizes profile stats sorted by effective total', () => {
    const sword = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'trained-10-sword')!;

    expect(getProfileStatSummary(bundle, sword)).toMatch(/^Health 100, Attack 24.1, Defense 16/);
  });

  it('computes balance rows from profile stats and universe combat balance', () => {
    const justSpawned = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'just-spawned')!;
    const trainedSword = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'trained-10-sword')!;
    const weak = calculateProfileEnemyDiagnostic(bundle, enemy, justSpawned);
    const strong = calculateProfileEnemyDiagnostic(bundle, enemy, trainedSword);

    expect(strong.actionsToKill.average).toBeLessThan(weak.actionsToKill.average);
    expect(strong.fightsPerDeath.average).toBeGreaterThan(weak.fightsPerDeath.average);
  });
});
