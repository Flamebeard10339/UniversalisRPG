import { describe, expect, it } from 'vitest';
import { changedModuleJsonFiles, editableModuleJsonFiles, moduleIndexJson } from './contributionFiles';
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
  it('builds module index and module files from base plus draft changes', () => {
    expect(moduleIndexJson(bundle(), draft())).toEqual(['base-module.json', 'draft-module.json']);
    expect(changedModuleJsonFiles(bundle(), draft()).map((file) => file.path)).toEqual([
      'modules/index.json',
      'modules/draft-module.json',
    ]);
    expect(editableModuleJsonFiles(bundle(), draft()).map((file) => file.path)).toEqual([
      'modules/index.json',
      'modules/base-module.json',
      'modules/draft-module.json',
    ]);
  });
});
