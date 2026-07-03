import { describe, expect, it } from 'vitest';
import { applyModulesToBundle } from './contentModules';
import { migrateMonolithicBundleToCoreModule } from './moduleMigration';
import type { ContentBundle } from './types';
import { validateContentBundle } from './validators';

const oldBundle = (): ContentBundle => ({
  manifest: {
    schemaVersion: 1,
    id: 'test',
    version: '1.0.0',
    author: 'test',
    locales: ['en'],
    files: ['locations.json', 'actions.json', 'skills.json', 'items.json', 'locales/en.json'],
    displayProfiles: [{ id: 'default', titleKey: 'displayProfile.default.title' }],
  },
  locations: [{ id: 'start', position: { x: 0, y: 0 }, starting: true }],
  actions: [{ id: 'gather', locationId: 'start', durationSeconds: 1, rewards: [] }],
  skills: [],
  stats: [],
  items: [{ id: 'token' }],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
  dialogues: [],
  locales: {
    en: {
      'universe.test.title': 'Test',
      'universe.test.description': 'Test.',
      'displayProfile.default.title': 'Default',
      'location.start.title': 'Start',
      'location.start.description': 'Start.',
      'action.gather.title': 'Gather',
      'action.gather.description': 'Gather.',
      'action.gather.success': 'Done.',
      'action.gather.failure': 'No.',
      'item.token.title': 'Token',
      'item.token.description': 'A token.',
    },
  },
});

describe('module migration', () => {
  it('moves monolithic content and locale dictionaries into a core module', () => {
    const migrated = migrateMonolithicBundleToCoreModule(oldBundle());

    expect(migrated.manifest.files).toEqual(['locales/en.json']);
    expect(migrated.manifest.modules).toEqual(['test-core']);
    expect(migrated.manifest.displayProfiles).toBeUndefined();
    expect(migrated.locations).toEqual([]);
    expect(migrated.actions).toEqual([]);
    expect(migrated.items).toEqual([]);
    expect(migrated.locales).toEqual({ en: {} });
    expect(migrated.modules?.[0]).toMatchObject({
      id: 'test-core',
      universe: 'test',
      author: 'test',
      locale: oldBundle().locales,
    });
    expect(migrated.modules?.[0]?.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'displayProfile', id: 'default' }),
      expect.objectContaining({ type: 'location', id: 'start' }),
      expect.objectContaining({ type: 'action', id: 'gather' }),
      expect.objectContaining({ type: 'item', id: 'token' }),
    ]));
  });

  it('keeps existing modules and chooses a unique generated core module id', () => {
    const bundle = {
      ...oldBundle(),
      modules: [{ id: 'test-core', version: '1.0.0', universe: 'test', author: 'test', game_version: '1.0' }],
    };
    const migrated = migrateMonolithicBundleToCoreModule(bundle);

    expect(migrated.manifest.modules).toEqual(['test-core-2', 'test-core']);
    expect(migrated.modules?.map((module) => module.id)).toEqual(['test-core-2', 'test-core']);
  });

  it('produces a bundle that validates after module application', () => {
    const migrated = migrateMonolithicBundleToCoreModule(oldBundle());
    const moduleResolution = applyModulesToBundle(migrated, migrated.modules ?? []);
    const errors = [...moduleResolution.issues, ...validateContentBundle(moduleResolution.bundle)].filter((issue) => issue.severity === 'error');

    expect(moduleResolution.bundle.locations.map((location) => location.id)).toEqual(['start']);
    expect(moduleResolution.bundle.actions.map((action) => action.id)).toEqual(['gather']);
    expect(moduleResolution.bundle.items.map((item) => item.id)).toEqual(['token']);
    expect(errors).toEqual([]);
  });
});
