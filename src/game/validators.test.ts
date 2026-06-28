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
    expect(validateManifest(manifest({ combatBalance: { expectedHitsToKill: 1 / 7, combatSpread: 1 } }))).toBe(true);
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
});
