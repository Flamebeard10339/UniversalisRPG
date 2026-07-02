import { describe, expect, it } from 'vitest';
import { applyModulesToBundle, collectModuleLocalizationKeys, parseModuleDependency, validateModuleShape } from './contentModules';
import { mergeDraftModulesIntoBundle } from './validators';
import type { ContentBundle, ContentModule } from './types';

const baseBundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'test', version: '0.1.0', author: 'test', locales: ['en'], files: ['locations.json', 'edges.json', 'actions.json', 'skills.json'] },
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
  dialogues: [],
  locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test', 'location.start.title': 'Start', 'location.start.description': 'Start' } },
});

const module = (patch: Partial<ContentModule> & Pick<ContentModule, 'id'>): ContentModule => ({
  version: '1.0.0',
  universe: 'test',
  author: 'test',
  game_version: '1.0',
  ...patch,
});

describe('content modules', () => {
  it('parses dependency prefixes and versions', () => {
    expect(parseModuleDependency('? some-other-mod >= 4.2.0')).toEqual({
      prefix: '?',
      id: 'some-other-mod',
      versionOperator: '>=',
      version: '4.2.0',
    });
  });

  it('requires module ids to match filenames', () => {
    expect(validateModuleShape(module({ id: 'foo' }), 'foo.json')).toBe(true);
    expect(validateModuleShape(module({ id: 'foo' }), 'bar.json')).toBe(false);
  });

  it('loads hard dependencies before dependents', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'quest', dependencies: ['core'], data: { actions: [{ id: 'talk', locationId: 'start', durationSeconds: 1, rewards: [] }] } }),
      module({ id: 'core', data: { items: [{ id: 'letter' }] }, locale: { en: { 'item.letter.title': 'Letter', 'item.letter.description': 'Folded.' } } }),
    ]);

    expect(result.enabledModuleIds).toEqual(['core', 'quest']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['letter']);
    expect(result.bundle.actions.map((action) => action.id)).toEqual(['talk']);
  });

  it('enables recommended dependencies', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'feature', dependencies: ['+helper'], data: { items: [{ id: 'feature-item' }] } }),
      module({ id: 'helper', data: { items: [{ id: 'helper-item' }] } }),
    ], ['feature']);

    expect(result.enabledModuleIds).toEqual(['helper', 'feature']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['helper-item', 'feature-item']);
  });

  it('enforces dependency version constraints', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'feature', dependencies: ['core >= 2.0.0'], data: { items: [{ id: 'feature-item' }] } }),
      module({ id: 'core', version: '1.5.0', data: { items: [{ id: 'core-item' }] } }),
    ]);

    expect(result.enabledModuleIds).toEqual(['core']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['core-item']);
    expect(result.issues.some((issue) =>
      issue.message === 'validation.moduleDependencyVersionMismatch' &&
      issue.params?.id === 'core' &&
      issue.params?.version === '2.0.0',
    )).toBe(true);
  });

  it('only auto-enables recommended dependencies when their versions match', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'feature', dependencies: ['+helper >= 2.0.0'], data: { items: [{ id: 'feature-item' }] } }),
      module({ id: 'helper', version: '1.0.0', data: { items: [{ id: 'helper-item' }] } }),
    ], ['feature']);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.bundle.items).toEqual([]);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleMissingDependency' && issue.params?.id === 'helper')).toBe(true);
  });

  it('applies incompatibilities only when dependency version constraints match', () => {
    const compatible = applyModulesToBundle(baseBundle(), [
      module({ id: 'feature', dependencies: ['!core >= 2.0.0'], data: { items: [{ id: 'feature-item' }] } }),
      module({ id: 'core', version: '1.0.0', data: { items: [{ id: 'core-item' }] } }),
    ]);
    const incompatible = applyModulesToBundle(baseBundle(), [
      module({ id: 'feature', dependencies: ['!core >= 2.0.0'], data: { items: [{ id: 'feature-item' }] } }),
      module({ id: 'core', version: '2.0.0', data: { items: [{ id: 'core-item' }] } }),
    ]);

    expect(compatible.enabledModuleIds).toEqual(['core', 'feature']);
    expect(incompatible.enabledModuleIds).toEqual(['core']);
    expect(incompatible.issues.some((issue) => issue.message === 'validation.moduleIncompatible' && issue.params?.id === 'core')).toBe(true);
  });

  it('disables modules in hard dependency cycles with warnings', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'a', dependencies: ['b'], data: { items: [{ id: 'a-item' }] } }),
      module({ id: 'b', dependencies: ['a'], data: { items: [{ id: 'b-item' }] } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.bundle.items).toEqual([]);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleCircularDependency')).toBe(true);
  });

  it('disables every module in longer hard dependency cycles', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'a', dependencies: ['b'], data: { items: [{ id: 'a-item' }] } }),
      module({ id: 'b', dependencies: ['c'], data: { items: [{ id: 'b-item' }] } }),
      module({ id: 'c', dependencies: ['a'], data: { items: [{ id: 'c-item' }] } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.bundle.items).toEqual([]);
    expect(result.issues.filter((issue) => issue.message === 'validation.moduleCircularDependency').map((issue) => issue.params?.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('allows cycles made only of no-load-order dependencies', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'a', dependencies: ['~b'], data: { items: [{ id: 'a-item' }] } }),
      module({ id: 'b', dependencies: ['~a'], data: { items: [{ id: 'b-item' }] } }),
    ]);

    expect(result.enabledModuleIds).toEqual(['a', 'b']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['a-item', 'b-item']);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleCircularDependency')).toBe(false);
  });

  it('applies data-updates after all data sections', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'core', data: { dialogues: [{ id: 'guide', startNodeId: 'start', nodes: [{ id: 'start', options: [{ id: 'yes', labelKey: 'dialogue.yes' }] }] }] } }),
      module({ id: 'patch', dependencies: ['core'], 'data-updates': { remove: { dialogues: ['guide'] } } }),
    ]);

    expect(result.bundle.dialogues).toEqual([]);
  });

  it('retries with conflicting modules disabled when an update removes referenced content', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({
        id: 'core',
        data: { items: [{ id: 'token' }] },
        locale: { en: { 'item.token.title': 'Token', 'item.token.description': 'A token.' } },
      }),
      module({
        id: 'consumer',
        dependencies: ['core'],
        data: { actions: [{ id: 'spend-token', locationId: 'start', durationSeconds: 1, rewards: [{ kind: 'item', itemId: 'token', amount: 1 }] }] },
        locale: { en: { 'action.spend-token.title': 'Spend', 'action.spend-token.description': 'Spend.', 'action.spend-token.success': 'Done.', 'action.spend-token.failure': 'No.' } },
      }),
      module({ id: 'patch', dependencies: ['core'], 'data-updates': { remove: { items: ['token'] } } }),
    ]);

    expect(result.enabledModuleIds).toEqual(['core']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['token']);
    expect(result.bundle.actions).toEqual([]);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleConflictDisabled' && issue.params?.id === 'consumer' && issue.params?.key === 'token')).toBe(true);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleConflictDisabled' && issue.params?.id === 'patch' && issue.params?.key === 'token')).toBe(true);
    expect(result.issues.some((issue) => issue.message === 'validation.unknownItem')).toBe(false);
  });

  it('rejects modules with invalid data prototypes', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'bad-items', data: { items: [{ maxQuantity: 1 } as never] } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.bundle.items).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-items.data.items.json' &&
      issue.message === 'validation.itemsShape',
    )).toBe(true);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleDisabled' && issue.params?.id === 'bad-items')).toBe(true);
  });

  it('rejects modules with invalid data-updates prototypes', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'bad-patch', 'data-updates': { actions: [{ id: 'bad-action', locationId: 'start', durationSeconds: 'fast', rewards: [] } as never] } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.bundle.actions).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-patch.data-updates.actions.json' &&
      issue.message === 'validation.actionsShape',
    )).toBe(true);
  });

  it('rejects modules with invalid version metadata', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'bad-version', version: '1.0.65536', game_version: '1', data: { items: [{ id: 'bad-version-item' }] } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.bundle.items).toEqual([]);
    expect(result.issues.some((issue) => issue.path === 'modules.bad-version.version' && issue.message === 'validation.moduleVersionInvalid')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'modules.bad-version.game_version' && issue.message === 'validation.moduleGameVersionInvalid')).toBe(true);
  });

  it('collects and warns for module-local localization keys', () => {
    const quest = module({
      id: 'quest',
      data: {
        items: [{ id: 'quest-token' }],
        actions: [{ id: 'quest-chat', locationId: 'start', durationSeconds: 1, rewards: [], results: [{ kind: 'chat', messageKey: 'chat.quest.start' }] }],
      },
      locale: { en: { 'item.quest-token.title': 'Quest token' } },
    });
    const result = applyModulesToBundle(baseBundle(), [quest]);

    expect(collectModuleLocalizationKeys(quest)).toEqual(expect.arrayContaining([
      'item.quest-token.title',
      'item.quest-token.description',
      'action.quest-chat.title',
      'action.quest-chat.description',
      'action.quest-chat.success',
      'action.quest-chat.failure',
      'chat.quest.start',
    ]));
    expect(result.issues.some((issue) =>
      issue.severity === 'warning' &&
      issue.path === 'modules.quest.locale.en.item.quest-token.description' &&
      issue.message === 'validation.missingLocalization',
    )).toBe(true);
  });

  it('can merge drafted modules before module resolution', () => {
    const bundleWithDraft = mergeDraftModulesIntoBundle(baseBundle(), {
      universeId: 'test',
      updatedAt: 1,
      notes: '',
      modules: [module({ id: 'draft-module', data: { items: [{ id: 'draft-item' }] } })],
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
      removed: { locations: [], edges: [], actions: [], skills: [], stats: [], items: [], flags: [], resources: [], effects: [], interactionTypes: [], enemies: [], dialogues: [], modules: [] },
    });

    const result = applyModulesToBundle(bundleWithDraft, bundleWithDraft.modules ?? [], ['draft-module']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['draft-item']);
  });

  it('can merge drafted module packs into the contribution preview', () => {
    const bundleWithDraft = mergeDraftModulesIntoBundle(baseBundle(), {
      universeId: 'test',
      updatedAt: 1,
      notes: '',
      modules: [module({ id: 'draft-module', data: { items: [{ id: 'draft-item' }] } })],
      modulePacks: [{ id: 'draft-pack', modules: ['draft-module'], packs: [{ id: 'nested-pack', modules: ['draft-module'] }] }],
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
      removed: { locations: [], edges: [], actions: [], skills: [], stats: [], items: [], flags: [], resources: [], effects: [], interactionTypes: [], enemies: [], dialogues: [], modules: [] },
    });

    expect(bundleWithDraft.modulePacks).toEqual([{ id: 'draft-pack', modules: ['draft-module'], packs: [{ id: 'nested-pack', modules: ['draft-module'] }] }]);
  });

  it('warns when module packs reference unknown modules or duplicate pack ids', () => {
    const bundle = {
      ...baseBundle(),
      modulePacks: [
        { id: 'starter', modules: ['known', 'missing'], packs: [{ id: 'starter', modules: ['known'] }] },
      ],
    };
    const result = applyModulesToBundle(bundle, [module({ id: 'known', data: { items: [{ id: 'known-item' }] } })]);

    expect(result.enabledModuleIds).toEqual(['known']);
    expect(result.issues.some((issue) =>
      issue.message === 'validation.modulePackUnknownModule' &&
      issue.path === 'modulePacks.starter.modules.missing' &&
      issue.params?.id === 'missing' &&
      issue.params?.pack === 'starter',
    )).toBe(true);
    expect(result.issues.some((issue) =>
      issue.message === 'validation.modulePackDuplicate' &&
      issue.path === 'modulePacks.starter' &&
      issue.params?.id === 'starter',
    )).toBe(true);
  });

  it('preserves module load issues from the content bundle', () => {
    const result = applyModulesToBundle({
      ...baseBundle(),
      moduleIssues: [{ severity: 'error', path: 'modules.bad', message: 'validation.moduleShapeInvalid', params: { id: 'bad' } }],
    }, [module({ id: 'good', data: { items: [{ id: 'good-item' }] } })]);

    expect(result.enabledModuleIds).toEqual(['good']);
    expect(result.bundle.moduleIssues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleShapeInvalid',
      path: 'modules.bad',
      params: { id: 'bad' },
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleShapeInvalid',
      path: 'modules.bad',
      params: { id: 'bad' },
    }));
  });
});
