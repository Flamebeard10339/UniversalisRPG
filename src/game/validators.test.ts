import { describe, expect, it } from 'vitest';
import { mergeValidDraftIntoBundle, validateContentBundle, validateManifest } from './validators';
import type { ContentBundle, ContributionDraft, UniverseManifest } from './types';

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

const draft = (patch: Partial<ContributionDraft>): ContributionDraft => ({
  universeId: 'test',
  updatedAt: 1,
  notes: '',
  modules: [],
  modulePacks: [],
  locations: [],
  entities: [],
  actions: [],
  skills: [],
  stats: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dropTables: [],
  dialogues: [],
  locales: {},
  removed: {
    locations: [],
    entities: [],
    actions: [],
    skills: [],
    stats: [],
    items: [],
    flags: [],
    resources: [],
    effects: [],
    interactionTypes: [],
    enemies: [],
    dropTables: [],
    dialogues: [],
    modules: [],
  },
  ...patch,
});

describe('universe manifest validation', () => {
  it('accepts omitted or explicit combat balance', () => {
    expect(validateManifest(manifest())).toBe(true);
    expect(validateManifest(manifest({
      basePlayer: { inventory: {} },
      combatBalance: { 'damage-scaler': 0.1 },
      experienceCurve: { 'starting-experience': 1000, 'level-factor': 10, exponential: 2 },
    }))).toBe(true);
  });

  it('reports invalid combat balance tuning values', () => {
    const issues = validateContentBundle(bundle({
      combatBalance: { 'damage-scaler': 0 },
    })).filter((issue) => issue.severity === 'error');

    expect(issues.map((issue) => issue.message)).toEqual([
      'validation.damageScalerPositive',
    ]);
  });

  it('reports invalid experience curve tuning values', () => {
    const issues = validateContentBundle(bundle({
      experienceCurve: { 'starting-experience': 0, 'level-factor': 10, exponential: 2 },
    })).filter((issue) => issue.severity === 'error');

    expect(issues.map((issue) => issue.message)).toContain('validation.experienceCurvePositive');
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

  it('accepts instant actions without a duration', () => {
    const issues = validateContentBundle({
      ...bundle(),
      actions: [{
        id: 'talk',
        locationId: 'start',
        instant: true,
        rewards: [],
      }],
    }).filter((issue) => issue.severity === 'error');

    expect(issues).toEqual([]);
  });

  it('accepts universe and interaction experience triggers', () => {
    const issues = validateContentBundle({
      ...bundle({
        experience: [{ event: 'health-regenerated', skillId: 'regeneration', sourceStat: 'regeneration' }],
      }),
      skills: [
        { id: 'attack', maxLevel: 100, statId: 'attack' },
        { id: 'regeneration', maxLevel: 100, statId: 'regeneration' },
      ],
      stats: [
        { id: 'attack' },
        { id: 'defense' },
        { id: 'regeneration' },
      ],
      interactionTypes: [{
        id: 'practice',
        sourceStatId: 'attack',
        targetStatId: 'defense',
        targetPlayerHealth: true,
        experience: [{ event: 'damage-dealt', skillId: 'attack' }],
      }],
    }).filter((issue) => issue.severity === 'error');

    expect(issues).toEqual([]);
  });

  it('reports invalid universe and interaction experience references', () => {
    const issues = validateContentBundle({
      ...bundle({
        experience: [{ event: 'health-regenerated', skillId: 'missing-skill', sourceStat: 'missing-stat' }],
      }),
      stats: [{ id: 'attack' }, { id: 'defense' }],
      interactionTypes: [{
        id: 'practice',
        sourceStatId: 'attack',
        targetStatId: 'defense',
        targetPlayerHealth: true,
        experience: [{ event: 'damage-dealt', skillId: 'missing-skill' }],
      }],
    }).filter((issue) => issue.severity === 'error');

    expect(issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'validation.unknownSkill',
      'validation.unknownStat',
    ]));
  });

  it('merges valid legacy contribution drafts', () => {
    const result = mergeValidDraftIntoBundle(bundle(), draft({
      locations: [{ id: 'camp', position: { x: 100, y: 0 } }],
      locales: { en: { 'location.camp.title': 'Camp', 'location.camp.description': 'A camp.' } },
    }));

    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.bundle.locations.map((location) => location.id)).toEqual(['start', 'camp']);
  });

  it('quarantines invalid legacy contribution drafts instead of returning invalid content', () => {
    const result = mergeValidDraftIntoBundle(bundle(), draft({
      locations: [{ id: 'camp', position: { x: 100, y: 0 }, entities: ['missing-guide'] }],
      locales: { en: { 'location.camp.title': 'Camp', 'location.camp.description': 'A camp.' } },
    }));

    expect(result.bundle.locations.map((location) => location.id)).toEqual(['start']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      path: 'draft.locations.camp.entities',
      message: 'validation.unknownEntity',
      params: { id: 'missing-guide' },
    }));
  });

  it('reports duplicate location entity and action references', () => {
    const issues = validateContentBundle({
      ...bundle(),
      locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true, entities: ['goblin', 'goblin'], actions: ['gather', 'gather'] }],
      entities: [{ id: 'goblin' }],
      actions: [{ id: 'gather', locationId: 'start', durationSeconds: 1, rewards: [] }],
    });

    expect(issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      path: 'locations.start.entities',
      message: 'validation.duplicateId',
      params: { id: 'goblin' },
    }));
    expect(issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      path: 'locations.start.actions',
      message: 'validation.duplicateId',
      params: { id: 'gather' },
    }));
  });
});
