import { describe, expect, it } from 'vitest';
import { changedContributionJsonFiles, changedModuleJsonFiles, editableModuleJsonFiles, moduleManifestIds } from './contributionFiles';
import type { ContentBundle, ContributionDraft } from './types';

const bundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'test', version: '1.0.0', author: 'test', locales: ['en'], files: [] },
  locations: [],
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
  dialogues: [],
  locales: {},
  removed: { locations: [], edges: [], actions: [], skills: [], stats: [], items: [], flags: [], resources: [], effects: [], interactionTypes: [], enemies: [], dialogues: [], modules: ['removed-module'] },
});

describe('contribution module files', () => {
  it('builds manifest module ids and module files from base plus draft changes', () => {
    expect(moduleManifestIds(bundle(), draft())).toEqual(['base-module', 'draft-module']);
    expect(changedModuleJsonFiles(bundle(), draft()).map((file) => file.path)).toEqual([
      'universe.json',
      'modules/draft-module.json',
    ]);
    expect(changedModuleJsonFiles(bundle(), draft())[0]?.json).toMatchObject({
      id: 'test',
      modules: ['base-module', 'draft-module'],
    });
    expect(editableModuleJsonFiles(bundle(), draft()).map((file) => file.path)).toEqual([
      'universe.json',
      'modules/base-module.json',
      'modules/draft-module.json',
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
      'module-packs.json',
    ]);
  });
});
