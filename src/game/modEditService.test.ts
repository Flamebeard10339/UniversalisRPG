import { describe, expect, it } from 'vitest';
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
});
