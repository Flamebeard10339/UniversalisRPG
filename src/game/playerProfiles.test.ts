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
    combatBalance: { 'damage-scaler': 0.1 },
  },
  locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true }],
  edges: [],
  actions: [],
  skills: [
    { id: 'attack', maxLevel: 100, statId: 'attack' },
    { id: 'defense', maxLevel: 100, statId: 'defense' },
    { id: 'woodcutting', maxLevel: 100, statId: 'woodcutting' },
    { id: 'regeneration', maxLevel: 100, statId: 'regeneration' },
  ],
  stats: [
    { id: 'attack', base: 6 },
    { id: 'defense', base: 6 },
    { id: 'woodcutting', base: 0 },
    { id: 'action-rate', base: 25 },
    { id: 'health', base: 100 },
    { id: 'regeneration' },
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
  stats: {
    attack: 10,
    defense: 10,
    rate: 30,
  },
  rewards: [],
};

describe('debug player profiles', () => {
  it('calculates equipment profile stats through the stat system', () => {
    const sword = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'trained-10-sword')!;
    const shield = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'trained-10-shield')!;

    expect(getProfileStatValue(bundle, sword, 'attack')).toBeCloseTo(26.25, 5);
    expect(getProfileStatValue(bundle, sword, 'defense')).toBeCloseTo(17.6, 5);
    expect(getProfileStatValue(bundle, shield, 'attack')).toBeCloseTo(17.6, 5);
    expect(getProfileStatValue(bundle, shield, 'defense')).toBeCloseTo(26.25, 5);
  });

  it('summarizes profile stats sorted by effective total', () => {
    const sword = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'trained-10-sword')!;

    expect(getProfileStatSummary(bundle, sword)).toMatch(/^Health 100, Attack 26.3, Action Rate 25, Defense 17.6/);
  });

  it('computes balance rows from profile stats and universe combat balance', () => {
    const justSpawned = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'just-spawned')!;
    const trainedSword = DEBUG_PLAYER_PROFILES.find((profile) => profile.id === 'trained-10-sword')!;
    const weak = calculateProfileEnemyDiagnostic(bundle, enemy, justSpawned);
    const strong = calculateProfileEnemyDiagnostic(bundle, enemy, trainedSword);

    expect(strong.actionsToKill.average).toBeLessThan(weak.actionsToKill.average);
    expect(strong.fightsPerDeath.average).toBeGreaterThan(weak.fightsPerDeath.average);
    expect(strong.dps).toBeGreaterThan(weak.dps);
    expect(strong.maxHit).toBe(2);
    expect(strong.dpsTaken).toBeGreaterThan(0);
    expect(strong.levelPair).toContain('Attack/Defense');
  });
});
