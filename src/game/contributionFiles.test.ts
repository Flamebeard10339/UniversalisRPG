import { describe, expect, it } from 'vitest';
import { changedContributionJsonFiles, changedModuleJsonFiles, editableModuleJsonFiles, moduleManifestIds } from './contributionFiles';
import type { ContentBundle, ContributionDraft } from './types';

const bundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'test', version: '1.0.0', author: 'test', locales: ['en'], files: [] },
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
  locales: { en: {} },
  modules: [
    { id: 'base-module', version: '1.0.0', universe: 'test', author: 'test', game_version: '1.0' },
    { id: 'removed-module', version: '1.0.0', universe: 'test', author: 'test', game_version: '1.0' },
  ],
});

const draft = (): ContributionDraft => ({
  universeId: 'test',
  updatedAt: 1,
  notes: '',
  modules: [
    { id: 'draft-module', version: '1.0.0', universe: 'test', author: 'test', game_version: '1.0' },
  ],
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
  removed: { locations: [], actions: [], skills: [], stats: [], items: [], flags: [], resources: [], effects: [], interactionTypes: [], enemies: [], dropTables: [], dialogues: [], modules: ['removed-module'] },
});

describe('contribution module files', () => {
  it('builds manifest module ids and module files from base plus draft changes', () => {
    expect(moduleManifestIds(bundle(), draft())).toEqual(['base-module', 'draft-module', 'removed-module']);
    expect(changedModuleJsonFiles(bundle(), draft()).map((file) => file.path)).toEqual([
      'universe.json',
      'modules/draft-module.json',
    ]);
    expect(changedModuleJsonFiles(bundle(), draft())[0]?.json).toMatchObject({
      id: 'test',
      modules: ['base-module', 'draft-module', 'removed-module'],
    });
    expect(editableModuleJsonFiles(bundle(), draft()).map((file) => file.path)).toEqual([
      'universe.json',
      'modules/base-module.json',
      'modules/draft-module.json',
      'modules/removed-module.json',
    ]);
  });

  it('packages contribution submissions as module files and module packs only', () => {
    const contributionDraft = {
      ...draft(),
      modulePacks: [{ id: 'starter', modules: ['draft-module'] }],
      actions: [{ id: 'legacy-action', locationId: 'start', durationSeconds: 1, rewards: [] }],
      locales: { en: { 'legacy.key': 'Legacy' } },
    };

    expect(changedContributionJsonFiles(bundle(), contributionDraft).map((file) => file.path)).toEqual([
      'universe.json',
      'modules/draft-module.json',
      'actions.json',
      'module-packs.json',
      'locales.json',
    ]);
  });

  it('includes empty top-level content files when the draft only records removals', () => {
    const contributionDraft = {
      ...draft(),
      removed: {
        ...draft().removed,
        locations: ['old-location'],
        entities: ['old-entity'],
        actions: ['old-action'],
      },
    };

    expect(changedContributionJsonFiles(bundle(), contributionDraft).map((file) => file.path)).toEqual([
      'universe.json',
      'modules/draft-module.json',
      'locations.json',
      'entities.json',
      'actions.json',
    ]);
    expect(changedContributionJsonFiles(bundle(), contributionDraft)).toEqual([
      { path: 'universe.json', json: { ...bundle().manifest, modules: ['base-module', 'draft-module', 'removed-module'] } },
      { path: 'modules/draft-module.json', json: { id: 'draft-module', version: '1.0.0', universe: 'test', author: 'test', game_version: '1.0' } },
      { path: 'locations.json', json: [] },
      { path: 'entities.json', json: [] },
      { path: 'actions.json', json: [] },
    ]);
  });

  it('a removed draft module id wins over a same-id draft replacement (removal takes precedence)', () => {
    // Not a "packaged/core modules can't be edited" restriction — that was
    // intentionally lifted, see the next test. This is the narrower case of
    // a draft that lists the same module id in both `modules` (replacement)
    // and `removed.modules` (deletion); removal wins.
    const contributionDraft = {
      ...draft(),
      modules: [
        ...draft().modules,
        { id: 'base-module', version: '9.9.9', universe: 'test', author: 'draft', game_version: '1.0' },
      ],
      removed: { ...draft().removed, modules: ['base-module', 'removed-module'] },
    };

    expect(moduleManifestIds(bundle(), contributionDraft)).toEqual(['base-module', 'draft-module', 'removed-module']);
    expect(changedModuleJsonFiles(bundle(), contributionDraft).map((file) => file.path)).toEqual([
      'universe.json',
      'modules/draft-module.json',
    ]);
  });

  it('lets a drafted module replace a packaged module by id (editing core/shipped content)', () => {
    const contributionDraft = {
      ...draft(),
      modules: [
        ...draft().modules,
        { id: 'base-module', version: '9.9.9', universe: 'test', author: 'draft', game_version: '1.0' },
      ],
    };

    expect(moduleManifestIds(bundle(), contributionDraft)).toEqual(['base-module', 'draft-module', 'removed-module']);
    expect(changedModuleJsonFiles(bundle(), contributionDraft).map((file) => file.path)).toEqual([
      'universe.json',
      'modules/draft-module.json',
      'modules/base-module.json',
    ]);
    expect(changedModuleJsonFiles(bundle(), contributionDraft).find((file) => file.path === 'modules/base-module.json')?.json).toMatchObject({
      version: '9.9.9',
      author: 'draft',
    });
  });
});
