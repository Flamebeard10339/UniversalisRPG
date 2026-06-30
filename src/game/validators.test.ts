import { describe, expect, it } from 'vitest';
import { validateContentBundle, validateManifest } from './validators';
import type { ContentBundle, UniverseManifest } from './types';

const manifest = (patch: Partial<UniverseManifest> = {}): UniverseManifest => ({
  schemaVersion: 1,
  id: 'test',
  version: '1',
  author: 'test',
  locales: ['en'],
  files: [],
  ...patch,
});

const bundle = (manifestPatch: Partial<UniverseManifest> = {}): ContentBundle => ({
  manifest: manifest(manifestPatch),
  locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true }],
  edges: [],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
});

describe('universe manifest validation', () => {
  it('accepts omitted or explicit combat balance', () => {
    expect(validateManifest(manifest())).toBe(true);
    expect(validateManifest(manifest({
      basePlayer: { inventory: {} },
      combatBalance: { expectedHitsToKill: 1 / 7, combatSpread: 1 },
    }))).toBe(true);
  });

  it('reports invalid combat balance tuning values', () => {
    const issues = validateContentBundle(bundle({
      combatBalance: { expectedHitsToKill: 0, combatSpread: -1 },
    })).filter((issue) => issue.severity === 'error');

    expect(issues.map((issue) => issue.message)).toEqual([
      'validation.expectedHitsPositive',
      'validation.combatSpreadNonNegative',
    ]);
  });

  it('reports invalid base inventory amounts', () => {
    const issues = validateContentBundle(bundle({
      basePlayer: { inventory: { ration: -1 } },
    })).filter((issue) => issue.severity === 'error');

    expect(issues.map((issue) => issue.message)).toContain('validation.inventoryAmountNonNegative');
  });

  it('accepts action-rate resource and conditional per-second effects', () => {
    const issues = validateContentBundle({
      ...bundle(),
      actions: [{
        id: 'spar',
        locationId: 'start',
        durationSeconds: 1,
        interactionTypeId: 'practice',
        rewards: [],
      }],
      stats: [{ id: 'action-rate' }],
      resourceDefinitions: [{
        id: 'action-rate',
        sourceStat: 'action-rate',
        max: 60,
        initialValue: 'empty',
        display: 'minimal',
        onFull: [
          { kind: 'complete-action' },
          { kind: 'refill', value: 'min' },
        ],
      }, {
        id: 'enemy-action-rate',
        owner: 'enemy',
        sourceStat: 'action-rate',
        max: 60,
        initialValue: 'empty',
        display: 'minimal',
        onFull: [
          { kind: 'enemy-attack' },
          { kind: 'refill', value: 'min' },
        ],
      }, {
        id: 'enemy-health',
        owner: 'enemy',
        sourceStat: 'action-rate',
        sourceEnemyStat: 'health',
        initialValue: 'full',
        hidden: false,
      }],
      effects: [{
        id: 'action-rate-regeneration',
        resourceId: 'action-rate',
        sourceStat: 'action-rate',
        rateUnit: 'per-second',
        activeWhen: { kind: 'state-variable', variable: 'active-interaction', comparison: 'equal', value: true },
        resetResourceWhenInactive: true,
      }, {
        id: 'enemy-action-rate-regeneration',
        resourceId: 'enemy-action-rate',
        sourceStat: 'action-rate',
        sourceEnemyStat: 'rate',
        rateUnit: 'per-second',
        activeWhen: { kind: 'state-variable', variable: 'active-interaction', comparison: 'equal', value: true },
        resetResourceWhenInactive: true,
      }, {
        id: 'enemy-health-regeneration',
        resourceId: 'enemy-health',
        sourceStat: 'action-rate',
        sourceEnemyStat: 'regeneration',
        activeWhen: { kind: 'state-variable', variable: 'active-interaction', comparison: 'equal', value: true },
      }],
      interactionTypes: [{ id: 'practice', sourceStatId: 'action-rate', targetStatId: 'action-rate', targetPlayerHealth: false }],
    }).filter((issue) => issue.severity === 'error');

    expect(issues).toEqual([]);
  });
});
