import { describe, expect, it } from 'vitest';
import { applyModulesToBundle } from './contentModules';
import type { ContentBundle, ContentModule } from './types';
import baseLocale from '../../public/content/universes/base/locales/en.json';
import baseCore from '../../public/content/universes/base/modules/base-core.json';
import waysideSupplies from '../../public/content/universes/base/modules/wayside-supplies.json';
import reset from '../../public/content/universes/base/modules/tutorial-island-reset.json';
import foundation from '../../public/content/universes/base/modules/tutorial-island-foundation.json';
import guideHouse from '../../public/content/universes/base/modules/tutorial-island-guide-house.json';
import survival from '../../public/content/universes/base/modules/tutorial-island-survival.json';
import bank from '../../public/content/universes/base/modules/tutorial-island-bank.json';
import mining from '../../public/content/universes/base/modules/tutorial-island-mining.json';
import combat from '../../public/content/universes/base/modules/tutorial-island-combat.json';

const modules = [
  baseCore,
  waysideSupplies,
  reset,
  foundation,
  guideHouse,
  survival,
  bank,
  mining,
  combat,
] as ContentModule[];

const bundle = (): ContentBundle => ({
  manifest: {
    schemaVersion: 1,
    id: 'base',
    version: '0.1.0',
    author: 'UniversalisRPG',
    locales: ['en'],
    files: ['locales/en.json'],
  },
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
  locales: { en: baseLocale },
  modules,
  modulePacks: [{ id: 'starter', modules: modules.map((module) => module.id) }],
});

describe('tutorial island content', () => {
  it('resolves every tutorial module without errors and replaces the old world', () => {
    const result = applyModulesToBundle(bundle(), modules, modules.map((module) => module.id));
    const errors = result.issues.filter((issue) => issue.severity === 'error');

    expect(errors).toEqual([]);
    expect(result.enabledModuleIds).toEqual(modules.map((module) => module.id));
    expect(result.bundle.locations.find((location) => location.starting)?.id).toBe('tutorial-guide-house');
    expect(result.bundle.locations.map((location) => location.id)).not.toContain('crossroads');
    expect(result.bundle.locations.every((location) => (location.entities ?? []).length <= 5)).toBe(true);
    expect(result.bundle.entities?.map((entity) => entity.id)).toEqual(expect.arrayContaining([
      'miki',
      'shoals',
      'front-door',
      'gommi',
      'bank-teller',
      'denzel',
      'orloth',
      'portal',
    ]));
  });
});
