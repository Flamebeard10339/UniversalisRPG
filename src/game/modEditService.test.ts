import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyModulesToBundle } from './contentModules';
import { createModEditService, localContributionsModId } from './modEditService';
import { createDraftModStore } from './modStore';
import type { ContentBundle, ContentModule, ContributionDraft } from './types';

const bundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'test', version: '1.0.0', author: 'tester', locales: ['en'], files: [] },
  locations: [{ id: 'start', position: { x: 0, y: 0 }, entities: ['guide'] }],
  entities: [{ id: 'guide' }],
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
  locales: {
    en: {
      'universe.test.title': 'Test',
      'universe.test.description': 'Test',
      'location.start.title': 'Start',
      'location.start.description': 'Start',
      'entity.guide.title': 'Guide',
    },
  },
});

const draft = (): ContributionDraft => ({
  universeId: 'test',
  updatedAt: 1,
  notes: '',
  modules: [],
  modulePacks: [],
  locations: [],
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
});

const module = (patch: Partial<ContentModule> & Pick<ContentModule, 'id'>): ContentModule => ({
  version: '1.0.0',
  universe: 'test',
  author: 'tester',
  game_version: '1.0',
  ...patch,
});

const readPublicJson = <T,>(...parts: string[]) =>
  JSON.parse(readFileSync(join(process.cwd(), 'public', 'content', 'universes', ...parts), 'utf8').replace(/^\uFEFF/, '')) as T;

describe('ModEditService', () => {
  it('writes addressed RFC 6902 edits only through local-contributions data-updates', () => {
    let nextDraft = draft();
    const service = createModEditService({
      resolvedBundle: bundle(),
      store: createDraftModStore(nextDraft, (patch) => {
        nextDraft = { ...nextDraft, ...patch };
      }),
    });

    const ops = service.diffEdit(
      { id: 'start', position: { x: 0, y: 0 }, entities: ['guide'] },
      { id: 'start', position: { x: 10, y: 0 }, entities: [] },
    );

    service.saveEdit('base-core', 'locations', 'start', ops);

    expect(nextDraft.modules).toHaveLength(1);
    expect(nextDraft.modules[0].id).toBe(localContributionsModId);
    expect(nextDraft.modules[0].dependencies).toEqual(['+base-core']);
    expect(nextDraft.modules[0]['data-updates']).toEqual({
      patches: [{
        targetModId: 'base-core',
        objectType: 'locations',
        objectId: 'start',
        ops: [
          { op: 'replace', path: '/position/x', value: 10 },
          { op: 'remove', path: '/entities/0' },
        ],
      }],
    });
  });

  it('preserves incremental edits to the same existing object as ordered patches', () => {
    let nextDraft = draft();
    const store = createDraftModStore(nextDraft, (patch) => {
      nextDraft = { ...nextDraft, ...patch };
    });
    const service = createModEditService({ resolvedBundle: bundle(), store });

    service.saveEdit('base-core', 'locations', 'start', [{ op: 'replace', path: '/position/x', value: 10 }]);
    service.saveEdit('base-core', 'locations', 'start', [{ op: 'replace', path: '/position/y', value: 20 }]);

    expect(nextDraft.modules[0]['data-updates']).toEqual({
      patches: [
        {
          targetModId: 'base-core',
          objectType: 'locations',
          objectId: 'start',
          ops: [{ op: 'replace', path: '/position/x', value: 10 }],
        },
        {
          targetModId: 'base-core',
          objectType: 'locations',
          objectId: 'start',
          ops: [{ op: 'replace', path: '/position/y', value: 20 }],
        },
      ],
    });
  });

  it('diffs string id arrays as explicit element removals and additions', () => {
    const service = createModEditService({
      resolvedBundle: bundle(),
      store: createDraftModStore(draft(), () => undefined),
    });

    expect(service.diffEdit(
      { id: 'start', actions: ['a', 'b', 'c'] },
      { id: 'start', actions: ['b', 'c', 'd'] },
    )).toEqual([
      { op: 'remove', path: '/actions/0' },
      { op: 'add', path: '/actions/-', value: 'd' },
    ]);
  });

  it('removes references from location action lists when deleting an action through local-contributions', () => {
    const rawBundle = {
      ...bundle(),
      locations: [],
      actions: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    };
    const core = module({
      id: 'base-core',
      data: {
        locations: [{
          id: 'emberwood',
          position: { x: 200, y: 80 },
          starting: true,
          actions: ['travel-emberwood-to-crossroads', 'forage-embers'],
        }],
        actions: [
          {
            id: 'travel-emberwood-to-crossroads',
            locationId: 'emberwood',
            role: 'travel',
            durationSeconds: 2,
            rewards: [],
            results: [{ kind: 'relocate', locationId: 'emberwood' }],
          },
          {
            id: 'forage-embers',
            locationId: 'emberwood',
            durationSeconds: 5,
            rewards: [],
          },
        ],
      },
      locale: {
        en: {
          'location.emberwood.title': 'Emberwood',
          'location.emberwood.description': 'Emberwood.',
          'location.emberwood.exhausted': 'Nothing more here.',
          'action.travel-emberwood-to-crossroads.title': 'Travel',
          'action.travel-emberwood-to-crossroads.description': 'Travel.',
          'action.travel-emberwood-to-crossroads.success': 'Arrived.',
          'action.travel-emberwood-to-crossroads.failure': 'Lost.',
          'action.forage-embers.title': 'Forage',
          'action.forage-embers.description': 'Forage.',
          'action.forage-embers.success': 'Found.',
          'action.forage-embers.failure': 'Nothing.',
        },
      },
    });
    const resolved = applyModulesToBundle({ ...rawBundle, modules: [core] }, [core], ['base-core']).bundle;
    let nextDraft = draft();
    const service = createModEditService({
      resolvedBundle: resolved,
      store: createDraftModStore(nextDraft, (patch) => {
        nextDraft = { ...nextDraft, ...patch };
      }),
    });

    service.saveEdit('base-core', 'actions', 'travel-emberwood-to-crossroads', [{ op: 'remove', path: '' }]);

    const local = nextDraft.modules.find((candidate) => candidate.id === localContributionsModId);
    expect(local?.['data-updates']).toEqual({
      patches: [
        {
          targetModId: 'base-core',
          objectType: 'actions',
          objectId: 'travel-emberwood-to-crossroads',
          ops: [{ op: 'remove', path: '' }],
        },
        {
          targetModId: 'base-core',
          objectType: 'locations',
          objectId: 'emberwood',
          ops: [{ op: 'remove', path: '/actions/0' }],
        },
      ],
    });

    const result = applyModulesToBundle(
      { ...rawBundle, modules: [core, local!] },
      [core, local!],
      [localContributionsModId],
    );

    expect(result.enabledModuleIds).toEqual(['base-core', localContributionsModId]);
    expect(result.bundle.actions.map((action) => action.id)).toEqual(['forage-embers']);
    expect(result.bundle.locations.find((location) => location.id === 'emberwood')?.actions).toEqual(['forage-embers']);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleConflictDisabled')).toBe(false);
    expect(result.issues.some((issue) => issue.message === 'validation.unknownAction')).toBe(false);
  });

  it('validates later edits to objects created by earlier local-contributions patches', () => {
    const core = module({ id: 'base-core', data: {} });
    const local = module({
      id: localContributionsModId,
      dependencies: ['+base-core'],
      'data-updates': {
        patches: [
          {
            targetModId: 'base-core',
            objectType: 'stats',
            objectId: 'new-stat',
            ops: [{ op: 'add', path: '', value: { id: 'new-stat', base: 0 } }],
          },
          {
            targetModId: 'base-core',
            objectType: 'stats',
            objectId: 'new-stat',
            ops: [{ op: 'replace', path: '/base', value: 5 }],
          },
        ],
      },
    });

    const rawBundle = bundle();
    const result = applyModulesToBundle({
      ...rawBundle,
      locations: rawBundle.locations.map((location) => ({ ...location, starting: true })),
      stats: [],
      modules: [core, local],
    }, [core, local], [localContributionsModId]);

    expect(result.enabledModuleIds).toEqual(['base-core', localContributionsModId]);
    expect(result.bundle.stats).toContainEqual({ id: 'new-stat', base: 5 });
    expect(result.issues.some((issue) => issue.message === 'validation.moduleUpdateTargetMissing')).toBe(false);
  });

  it('applies local-contributions patches and disables only that mod when invalid', () => {
    const rawBundle = {
      ...bundle(),
      locations: [],
      entities: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    };
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true, entities: ['guide'] }],
        entities: [{ id: 'guide' }],
        items: [{ id: 'core-item' }],
      },
      locale: {
        en: {
          'location.start.title': 'Start',
          'location.start.description': 'Start',
          'entity.guide.title': 'Guide',
          'item.core-item.title': 'Core item',
          'item.core-item.description': 'Core.',
        },
      },
    });
    const local = module({
      id: localContributionsModId,
      dependencies: ['+base-core'],
      'data-updates': {
        patches: [{
          targetModId: 'base-core',
          objectType: 'locations',
          objectId: 'start',
          ops: [{ op: 'replace', path: '/entities', value: ['missing-entity'] }],
        }],
      },
    });

    const result = applyModulesToBundle({ ...rawBundle, modules: [core, local] }, [core, local], ['base-core', localContributionsModId]);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations[0].entities).toEqual(['guide']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['core-item']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: `modules.${localContributionsModId}`,
    }));
  });

  it('does not blame base-core when local-contributions replaces a location action with an invalid action', () => {
    const rawBundle = {
      ...bundle(),
      manifest: { ...bundle().manifest, id: 'base' },
      locations: [],
      entities: [],
      locales: { en: { 'universe.base.title': 'Base', 'universe.base.description': 'Base' } },
    };
    const core = module({
      id: 'base-core',
      universe: 'base',
      data: {
        locations: [{
          id: 'crossroads',
          position: { x: 0, y: 80 },
          starting: true,
          actions: ['travel-crossroads-to-emberwood'],
        }],
        actions: [{
          id: 'travel-crossroads-to-emberwood',
          role: 'travel',
          durationSeconds: 2,
          rewards: [],
          results: [{ kind: 'relocate', locationId: 'crossroads' }],
        }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'Crossroads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'action.travel-crossroads-to-emberwood.title': 'Travel',
          'action.travel-crossroads-to-emberwood.description': 'Travel.',
          'action.travel-crossroads-to-emberwood.success': 'Arrived.',
          'action.travel-crossroads-to-emberwood.failure': 'Lost.',
        },
      },
    });
    const local = module({
      id: localContributionsModId,
      universe: 'base',
      dependencies: ['+base-core'],
      'data-updates': {
        patches: [{
          targetModId: 'base-core',
          objectType: 'locations',
          objectId: 'crossroads',
          ops: [
            { op: 'remove', path: '/actions/0' },
            { op: 'add', path: '/actions/-', value: 'entity.ork.examine' },
          ],
        }],
      },
    });

    const result = applyModulesToBundle(
      { ...rawBundle, modules: [core, local] },
      [core, local],
      [localContributionsModId],
    );

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations[0].actions).toEqual(['travel-crossroads-to-emberwood']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: `modules.${localContributionsModId}`,
      params: expect.objectContaining({ id: localContributionsModId }),
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      (issue.message === 'validation.moduleConflictDisabled' || issue.message === 'validation.moduleDisabled')
    )).toBe(false);
    expect(result.issues.some((issue) =>
      issue.path === `modules.${localContributionsModId}.dependencies` &&
      issue.message === 'validation.moduleMissingDependency'
    )).toBe(false);
  });

  it('keeps real base-core enabled for the reported local-contributions action replacement patch', () => {
    const manifest = readPublicJson<ContentBundle['manifest']>('base', 'universe.json');
    const core = readPublicJson<ContentModule>('base', 'modules', 'base-core.json');
    const locale = readPublicJson<Record<string, string>>('base', 'locales', 'en.json');
    const local = module({
      id: localContributionsModId,
      universe: 'base',
      author: 'UniversalisRPG',
      dependencies: ['+base-core'],
      'data-updates': {
        patches: [{
          targetModId: 'base-core',
          objectType: 'resources',
          objectId: 'health',
          ops: [
            { op: 'add', path: '/onEmpty/0/preserve/inventoryIds', value: ['missing-item'] },
          ],
        }],
      },
    });
    // base-core itself has no locations (it's shared engine plumbing for
    // whatever content module provides the actual starting location) — give
    // it a minimal synthetic starting location so this stays a check of
    // this patch against base-core in isolation.
    const starter = module({
      id: 'diag-starter',
      universe: 'base',
      author: 'test',
      dependencies: ['+base-core'],
      data: { locations: [{ id: 'diag-start', position: { x: 0, y: 0 }, starting: true, tags: [], entities: [], actions: [] }] },
      locale: { en: { 'location.diag-start.title': 'Start', 'location.diag-start.description': 'Start.', 'location.diag-start.exhausted': 'Quiet.' } },
    });
    const rawBundle: ContentBundle = {
      manifest,
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
      collectionLogs: [],
      dialogues: [],
      locales: { en: locale },
      modules: [core, local, starter],
    };

    const result = applyModulesToBundle(rawBundle, [core, local, starter], [localContributionsModId, 'diag-starter']);

    expect(result.enabledModuleIds).toEqual(expect.arrayContaining(['base-core', 'diag-starter']));
    expect(result.enabledModuleIds).not.toContain(localContributionsModId);
    const healthResource = result.bundle.resourceDefinitions?.find((resource) => resource.id === 'health');
    expect(healthResource?.onEmpty?.[0]).not.toHaveProperty('preserve.inventoryIds');
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: `modules.${localContributionsModId}`,
    }));
    expect(result.issues.some((issue) => issue.path === 'modules.base-core' && issue.message === 'validation.moduleDisabled')).toBe(false);
    expect(result.issues.some((issue) => issue.path === `modules.${localContributionsModId}.dependencies` && issue.message === 'validation.moduleMissingDependency')).toBe(false);
  });
});
