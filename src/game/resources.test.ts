import { describe, expect, it } from 'vitest';
import { createInitialPlayState } from './timers';
import { getNextResourceBoundaryAt, projectResourcePool } from './resources';
import { getCharacterStatValue } from './characterStats';
import type { ContentBundle } from './types';

const bundle: ContentBundle = {
  manifest: {
    schemaVersion: 1,
    id: 'test',
    version: '0.1.0',
    author: 'test',
    locales: ['en'],
    files: [],
  },
  locations: [{ id: 'room', position: { x: 0, y: 0 }, starting: true }],
  edges: [],
  actions: [{ id: 'walk', locationId: 'room', durationSeconds: 120, rewards: [] }],
  skills: [],
  stats: [{ id: 'air-capacity', base: 100 }, { id: 'air-loss', base: -60 }],
  items: [],
  flags: [],
  resourceDefinitions: [{ id: 'air', sourceStat: 'air-capacity', initialValue: 'full' }],
  effects: [{ id: 'air-loss', resourceId: 'air', sourceStat: 'air-loss' }],
  interactionTypes: [],
  enemies: [],
  locales: { en: {} },
};

const runningState = () => {
  const state = createInitialPlayState('test', 'room');
  return {
    ...state,
    equipmentSkillBonuses: { 'air-capacity': { added: 93 } },
    lastTickAt: 1_000,
    resourcePools: { air: { current: 100, min: 0, max: 100 } },
    activeAction: {
      actionId: 'walk',
      startedAt: 1_000,
      completesAt: 121_000,
      targetHealth: null,
      enemyAttackStartedAt: null,
      enemyAttackCompletesAt: null,
    },
  };
};

describe('resource projection', () => {
  it('calculates explicit stats from base, added, increased, and an associated skill level', () => {
    const state = { ...createInitialPlayState('test', 'room'), skillXp: { endurance: 90 } };
    const stats = [{ id: 'air-capacity', base: 100, added: 10, increased: 0.5, skillId: 'endurance' }];

    expect(getCharacterStatValue(state, stats, 'air-capacity')).toBe(171);
    expect(getCharacterStatValue({ ...state, statOverrides: { 'air-capacity': 42 } }, stats, 'air-capacity')).toBe(42);
  });

  it('projects resources from base player stats when stat definitions only declare ids', () => {
    const state = createInitialPlayState('test', 'room');
    const baseStatBundle = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        basePlayer: {
          stats: {
            'air-capacity': 100,
          },
        },
      },
      stats: [{ id: 'air-capacity' }, { id: 'air-loss' }],
    };

    const projected = projectResourcePool(baseStatBundle, state, baseStatBundle.resourceDefinitions[0], 1_000);

    expect(projected).toEqual({ current: 100, min: 0, max: 100 });
  });

  it('refills full resources when recovering a stale zero-capacity pool', () => {
    const baseStatBundle = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        basePlayer: {
          stats: {
            'air-capacity': 100,
          },
        },
      },
      stats: [{ id: 'air-capacity' }, { id: 'air-loss' }],
    };
    const state = {
      ...createInitialPlayState('test', 'room'),
      resourcePools: {
        air: { current: 0, min: 0, max: 0 },
      },
    };

    const projected = projectResourcePool(baseStatBundle, state, baseStatBundle.resourceDefinitions[0], 1_000);

    expect(projected).toEqual({ current: 100, min: 0, max: 100 });
  });

  it('projects a constant foreground effect without mutating persisted state', () => {
    const state = runningState();
    const projected = projectResourcePool(bundle, state, bundle.resourceDefinitions[0], 31_000);
    expect(projected.current).toBe(70);
    expect(state.resourcePools.air.current).toBe(100);
  });

  it('schedules the exact empty boundary before action completion', () => {
    const state = runningState();
    expect(getNextResourceBoundaryAt(bundle, state)).toBe(101_000);
    state.resourcePools.air.current = 30;
    expect(getNextResourceBoundaryAt(bundle, state)).toBe(31_000);
  });
});
