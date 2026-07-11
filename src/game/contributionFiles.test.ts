import { describe, expect, it } from 'vitest';
import { mergedContributionModules } from './contributionFiles';
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
  it('merges base modules with draft additions', () => {
    expect(mergedContributionModules(bundle(), draft()).map((module) => module.id)).toEqual(['base-module', 'draft-module', 'removed-module']);
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

    // removed.modules only excludes the draft's *own* replacement from the
    // merge — it doesn't remove a module that's part of the base bundle, so
    // base-module and removed-module (both from bundle().modules) still
    // show up, just with base-module's original (base) content rather than
    // the draft's attempted 9.9.9 replacement.
    const merged = mergedContributionModules(bundle(), contributionDraft);
    expect(merged.map((module) => module.id)).toEqual(['base-module', 'draft-module', 'removed-module']);
    expect(merged.find((module) => module.id === 'base-module')).toMatchObject({ version: '1.0.0', author: 'test' });
  });

  it('lets a drafted module replace a packaged module by id (editing core/shipped content)', () => {
    const contributionDraft = {
      ...draft(),
      modules: [
        ...draft().modules,
        { id: 'base-module', version: '9.9.9', universe: 'test', author: 'draft', game_version: '1.0' },
      ],
    };

    expect(mergedContributionModules(bundle(), contributionDraft).map((module) => module.id)).toEqual(['base-module', 'draft-module', 'removed-module']);
    expect(mergedContributionModules(bundle(), contributionDraft).find((module) => module.id === 'base-module')).toMatchObject({
      version: '9.9.9',
      author: 'draft',
    });
  });
});
