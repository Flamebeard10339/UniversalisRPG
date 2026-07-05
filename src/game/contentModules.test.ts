import { describe, expect, it } from 'vitest';
import { applyModulesToBundle, collectModuleLocalizationKeys, parseModuleDependency, validateModuleShape } from './contentModules';
import { mergeDraftModulesIntoBundle } from './validators';
import type { ContentBundle, ContentModule } from './types';

const baseBundle = (): ContentBundle => ({
  manifest: { schemaVersion: 1, id: 'test', version: '0.1.0', author: 'test', locales: ['en'], files: ['locations.json', 'actions.json', 'skills.json'] },
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

  it('rejects malformed in-memory modules without throwing', () => {
    const result = applyModulesToBundle(baseBundle(), [
      { id: 'bad-shape', universe: 'test', data: { items: [{ id: 'bad-item' }] } },
      module({ id: 'good', data: { items: [{ id: 'good-item' }] } }),
    ] as never);

    expect(result.enabledModuleIds).toEqual(['good']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['good-item']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleShapeInvalid',
      path: 'modules.bad-shape',
      params: { id: 'bad-shape' },
    }));
  });

  it('rejects duplicate in-memory module ids before resolution', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'dupe', data: { items: [{ id: 'first-item' }] } }),
      module({ id: 'dupe', data: { items: [{ id: 'second-item' }] } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.bundle.items).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleDuplicate',
      path: 'modules.dupe',
      params: { id: 'dupe' },
    }));
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

  it('loads enabled optional dependencies before dependents without requiring them', () => {
    const withOptional = applyModulesToBundle(baseBundle(), [
      module({ id: 'feature', dependencies: ['?helper'], data: { items: [{ id: 'feature-item' }] } }),
      module({ id: 'helper', data: { items: [{ id: 'helper-item' }] } }),
    ]);
    const withoutOptional = applyModulesToBundle(baseBundle(), [
      module({ id: 'feature', dependencies: ['?helper'], data: { items: [{ id: 'feature-item' }] } }),
    ]);

    expect(withOptional.enabledModuleIds).toEqual(['helper', 'feature']);
    expect(withOptional.bundle.items.map((item) => item.id)).toEqual(['helper-item', 'feature-item']);
    expect(withoutOptional.enabledModuleIds).toEqual(['feature']);
    expect(withoutOptional.bundle.items.map((item) => item.id)).toEqual(['feature-item']);
    expect(withoutOptional.issues.some((issue) => issue.message === 'validation.moduleMissingDependency')).toBe(false);
  });

  it('does not apply optional dependency load order when the optional version does not match', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'feature', dependencies: ['?helper >= 2.0.0'], data: { items: [{ id: 'feature-item' }] } }),
      module({ id: 'helper', version: '1.0.0', data: { items: [{ id: 'helper-item' }] } }),
    ]);

    expect(result.enabledModuleIds).toEqual(['feature', 'helper']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['feature-item', 'helper-item']);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleDependencyVersionMismatch')).toBe(false);
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

  it('does not load no-load-order dependencies before dependents', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'feature', dependencies: ['~helper'], data: { items: [{ id: 'feature-item' }] } }),
      module({ id: 'helper', data: { items: [{ id: 'helper-item' }] } }),
    ]);

    expect(result.enabledModuleIds).toEqual(['feature', 'helper']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['feature-item', 'helper-item']);
  });

  it('applies data-updates after all data sections', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'core', data: { dialogues: [{ id: 'guide', startNodeId: 'start', nodes: [{ id: 'start', options: [{ id: 'yes', labelKey: 'dialogue.yes' }] }] }] } }),
      module({ id: 'patch', dependencies: ['core'], 'data-updates': { remove: { dialogues: ['guide'] } } }),
    ]);

    expect(result.bundle.dialogues).toEqual([]);
  });

  it('treats data-updates to existing prototypes as overlays that inherit localization', () => {
    const bundle = {
      ...baseBundle(),
      locations: [{ id: 'start', position: { x: 0, y: 80 }, starting: true, tags: ['settlement'], entities: ['goblin', 'ork'] }],
      entities: [{ id: 'goblin' }, { id: 'ork' }],
      locales: {
        en: {
          ...baseBundle().locales.en,
          'location.start.exhausted': 'Nothing more here.',
          'entity.goblin.title': 'Goblin',
          'entity.goblin.description': 'Small trouble.',
          'entity.ork.title': 'Ork',
          'entity.ork.description': 'Large trouble.',
        },
      },
    };
    const result = applyModulesToBundle(bundle, [
      module({
        id: 'local-contribution',
        'data-updates': [
          { type: 'location', id: 'start', position: { x: 10 }, entities: ['goblin'] },
        ] as never,
      }),
    ]);

    expect(result.enabledModuleIds).toEqual(['local-contribution']);
    expect(result.bundle.locations[0]).toEqual({
      id: 'start',
      position: { x: 10, y: 80 },
      starting: true,
      tags: ['settlement'],
      entities: ['goblin'],
    });
    expect(result.issues.some((issue) =>
      issue.path.startsWith('modules.local-contribution.locale.en.location.start') ||
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('validates overlays against prototypes introduced by core modules', () => {
    const rawBundle = {
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    };
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true, tags: ['settlement'], entities: ['goblin', 'ork'] }],
        entities: [{ id: 'goblin' }, { id: 'ork' }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'entity.goblin.title': 'Goblin',
          'entity.goblin.description': 'Small trouble.',
          'entity.ork.title': 'Ork',
          'entity.ork.description': 'Large trouble.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'location', id: 'crossroads', position: { x: 10 }, entities: ['goblin'] },
      ] as never,
    });

    const result = applyModulesToBundle(rawBundle, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core', 'local-contribution']);
    expect(result.bundle.locations[0]).toEqual({
      id: 'crossroads',
      position: { x: 10, y: 80 },
      starting: true,
      tags: ['settlement'],
      entities: ['goblin'],
    });
    expect(result.issues.some((issue) =>
      issue.path.startsWith('modules.local-contribution.locale.en.location.crossroads') ||
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('does not require duplicate data rows to relocalize inherited prototypes', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      data: [
        { type: 'location', id: 'crossroads', position: { x: 10, y: 80 } },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.duplicateId',
      path: 'modules.local-contribution.data.locations.crossroads',
      params: { id: 'crossroads' },
    }));
    expect(result.issues.some((issue) =>
      issue.path.startsWith('modules.local-contribution.locale.en.location.crossroads'),
    )).toBe(false);
  });

  it('disables a local data-update that targets a missing location instead of creating it', () => {
    const core = module({
      id: 'base-core',
      data: { locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }] },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'location', id: 'croosroads', position: { x: 10 } },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations.map((location) => location.id)).toEqual(['crossroads']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleUpdateTargetMissing',
      path: 'modules.local-contribution.data-updates.locations.croosroads',
      params: { id: 'croosroads' },
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleDisabled',
      path: 'modules.local-contribution',
    }));
  });

  it('allows a module data-update to patch a prototype introduced by module data', () => {
    const contribution = module({
      id: 'local-contribution',
      data: [
        { type: 'location', id: 'camp', position: { x: 100, y: 80 } },
      ] as never,
      'data-updates': [
        { type: 'location', id: 'camp', tags: ['rest'] },
      ] as never,
      locale: {
        en: {
          'location.camp.title': 'Camp',
          'location.camp.description': 'A place to rest.',
          'location.camp.exhausted': 'Nothing more here.',
        },
      },
    });

    const result = applyModulesToBundle(baseBundle(), [contribution], ['local-contribution']);

    expect(result.enabledModuleIds).toEqual(['local-contribution']);
    expect(result.bundle.locations.find((location) => location.id === 'camp')).toEqual({
      id: 'camp',
      position: { x: 100, y: 80 },
      tags: ['rest'],
    });
    expect(result.issues.some((issue) => issue.message === 'validation.moduleUpdateTargetMissing')).toBe(false);
  });

  it('does not create a data-update target when the module providing that target is not enabled', () => {
    const creator = module({
      id: 'creator',
      data: [
        { type: 'location', id: 'camp', position: { x: 100, y: 80 } },
      ] as never,
      locale: {
        en: {
          'location.camp.title': 'Camp',
          'location.camp.description': 'A place to rest.',
          'location.camp.exhausted': 'Nothing more here.',
        },
      },
    });
    const patch = module({
      id: 'patch',
      'data-updates': [
        { type: 'location', id: 'camp', tags: ['rest'] },
      ] as never,
    });

    const result = applyModulesToBundle(baseBundle(), [creator, patch], ['patch']);

    expect(result.enabledModuleIds).toEqual(['patch']);
    expect(result.bundle.locations.map((location) => location.id)).toEqual(['start']);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleUpdateTargetMissing')).toBe(false);
  });

  it('disables only the local overlay that adds an unknown entity to a core location', () => {
    const rawBundle = {
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    };
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true, entities: ['goblin'] }],
        entities: [{ id: 'goblin' }],
        actions: [{ id: 'speak-to-tutorial-guide', locationId: 'crossroads', durationSeconds: 1, rewards: [], results: [{ kind: 'chat', messageKey: 'chat.tutorial-guide' }] }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'entity.goblin.title': 'Goblin',
          'entity.goblin.description': 'Small trouble.',
          'action.speak-to-tutorial-guide.title': 'Speak',
          'action.speak-to-tutorial-guide.description': 'Speak.',
          'action.speak-to-tutorial-guide.success': 'Done.',
          'action.speak-to-tutorial-guide.failure': 'No.',
          'chat.tutorial-guide': 'Hello.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'location', id: 'crossroads', entities: ['goblin', 'tutorial-guide'] },
      ] as never,
    });

    const result = applyModulesToBundle(rawBundle, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations[0]?.entities).toEqual(['goblin']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'tutorial-guide' },
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('does not protect a local module just because its id ends with core', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true, entities: ['goblin'] }],
        entities: [{ id: 'goblin' }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'entity.goblin.title': 'Goblin',
          'entity.goblin.description': 'Small trouble.',
        },
      },
    });
    const contribution = module({
      id: 'fake-core',
      'data-updates': [
        { type: 'location', id: 'crossroads', entities: ['goblin', 'tutorial-guide'] },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'fake-core']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations[0]?.entities).toEqual(['goblin']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.fake-core',
      params: { id: 'fake-core', key: 'tutorial-guide' },
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('disables only the local module that adds a new location with an unknown entity', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }],
        entities: [{ id: 'goblin' }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'entity.goblin.title': 'Goblin',
          'entity.goblin.description': 'Small trouble.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      data: [
        { type: 'location', id: 'bad-camp', position: { x: 100, y: 80 }, entities: ['tutorial-guide'] },
      ] as never,
      locale: {
        en: {
          'location.bad-camp.title': 'Bad camp',
          'location.bad-camp.description': 'Invalid on purpose.',
          'location.bad-camp.exhausted': 'Nothing more here.',
        },
      },
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations.map((location) => location.id)).toEqual(['crossroads']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'tutorial-guide' },
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('quarantines one invalid local location module without disabling other local modules', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }],
        entities: [{ id: 'goblin' }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'entity.goblin.title': 'Goblin',
          'entity.goblin.description': 'Small trouble.',
        },
      },
    });
    const badContribution = module({
      id: 'bad-contribution',
      data: [
        { type: 'location', id: 'bad-camp', position: { x: 100, y: 80 }, entities: ['tutorial-guide'] },
      ] as never,
      locale: {
        en: {
          'location.bad-camp.title': 'Bad camp',
          'location.bad-camp.description': 'Invalid on purpose.',
          'location.bad-camp.exhausted': 'Nothing more here.',
        },
      },
    });
    const goodContribution = module({
      id: 'good-contribution',
      data: [
        { type: 'location', id: 'good-camp', position: { x: 200, y: 80 }, entities: ['goblin'] },
      ] as never,
      locale: {
        en: {
          'location.good-camp.title': 'Good camp',
          'location.good-camp.description': 'Valid local content.',
          'location.good-camp.exhausted': 'Nothing more here.',
        },
      },
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, badContribution, goodContribution], ['base-core', 'bad-contribution', 'good-contribution']);

    expect(result.enabledModuleIds).toEqual(expect.arrayContaining(['base-core', 'good-contribution']));
    expect(result.enabledModuleIds).not.toContain('bad-contribution');
    expect(result.bundle.locations.map((location) => location.id)).toEqual(expect.arrayContaining(['crossroads', 'good-camp']));
    expect(result.bundle.locations.map((location) => location.id)).not.toContain('bad-camp');
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.bad-contribution',
      params: { id: 'bad-contribution', key: 'tutorial-guide' },
    }));
    expect(result.issues.some((issue) =>
      (issue.path === 'modules.base-core' || issue.path === 'modules.good-contribution') &&
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('quarantines one invalid local overlay without disabling a valid local overlay of the same core location', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true, entities: ['goblin'] }],
        entities: [{ id: 'goblin' }, { id: 'ork' }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'entity.goblin.title': 'Goblin',
          'entity.goblin.description': 'Small trouble.',
          'entity.ork.title': 'Ork',
          'entity.ork.description': 'Large trouble.',
        },
      },
    });
    const badOverlay = module({
      id: 'bad-overlay',
      'data-updates': [
        { type: 'location', id: 'crossroads', entities: ['goblin', 'tutorial-guide'] },
      ] as never,
    });
    const goodOverlay = module({
      id: 'good-overlay',
      'data-updates': [
        { type: 'location', id: 'crossroads', entities: ['goblin', 'ork'] },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, badOverlay, goodOverlay], ['base-core', 'bad-overlay', 'good-overlay']);

    expect(result.enabledModuleIds).toEqual(expect.arrayContaining(['base-core', 'good-overlay']));
    expect(result.enabledModuleIds).not.toContain('bad-overlay');
    expect(result.bundle.locations.find((location) => location.id === 'crossroads')?.entities).toEqual(['goblin', 'ork']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.bad-overlay',
      params: { id: 'bad-overlay', key: 'tutorial-guide' },
    }));
    expect(result.issues.some((issue) =>
      (issue.path === 'modules.base-core' || issue.path === 'modules.good-overlay') &&
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('disables a local overlay that duplicates location entity references', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true, entities: ['goblin'] }],
        entities: [{ id: 'goblin' }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'entity.goblin.title': 'Goblin',
          'entity.goblin.description': 'Small trouble.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'location', id: 'crossroads', entities: ['goblin', 'goblin'] },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations.find((location) => location.id === 'crossroads')?.entities).toEqual(['goblin']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'goblin' },
    }));
  });

  it('disables only the local overlay that adds an unknown action to a core location', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true, actions: ['gather-rumors'] }],
        actions: [{ id: 'gather-rumors', locationId: 'crossroads', durationSeconds: 1, rewards: [] }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'action.gather-rumors.title': 'Gather Rumors',
          'action.gather-rumors.description': 'Listen.',
          'action.gather-rumors.success': 'Done.',
          'action.gather-rumors.failure': 'No.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'location', id: 'crossroads', actions: ['gather-rumors', 'fake-action'] },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations[0]?.actions).toEqual(['gather-rumors']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'fake-action' },
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('disables a local module that duplicates a core location id', () => {
    const core = module({
      id: 'base-core',
      data: { locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }] },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      data: [
        { type: 'location', id: 'crossroads', position: { x: 100, y: 80 } },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations).toEqual([{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.duplicateId',
      path: 'modules.local-contribution.data.locations.crossroads',
      params: { id: 'crossroads' },
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution' },
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('rejects a local module that adds a malformed empty-id location without disabling core', () => {
    const core = module({
      id: 'base-core',
      data: { locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }] },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      data: [
        { type: 'location', id: '', position: { x: 100, y: 80 } },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations.map((location) => location.id)).toEqual(['crossroads']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.locationsShape',
      path: 'modules.local-contribution.data.locations.json',
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleDisabled',
      path: 'modules.local-contribution',
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleDisabled',
    )).toBe(false);
  });

  it('disables a local module that adds duplicate new location ids without hiding the duplicate during merge', () => {
    const core = module({
      id: 'base-core',
      data: { locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }] },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      data: [
        { type: 'location', id: 'new-location', position: { x: 100, y: 80 } },
        { type: 'location', id: 'new-location', position: { x: 160, y: 80 } },
      ] as never,
      locale: {
        en: {
          'location.new-location.title': 'New location',
          'location.new-location.description': 'Duplicate on purpose.',
          'location.new-location.exhausted': 'Nothing more here.',
        },
      },
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations.map((location) => location.id)).toEqual(['crossroads']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.duplicateId',
      path: 'modules.local-contribution.data.locations.new-location',
      params: { id: 'new-location' },
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleDisabled',
      path: 'modules.local-contribution',
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleDisabled',
    )).toBe(false);
  });

  it('disables a local module that adds duplicate new resources without hiding the duplicate during merge', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }],
        stats: [{ id: 'power' }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'stat.power.title': 'Power',
          'stat.power.description': 'Power.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      data: [
        { type: 'resource', id: 'stamina', sourceStat: 'power' },
        { type: 'resource', id: 'stamina', sourceStat: 'power' },
      ] as never,
      locale: {
        en: {
          'resource.stamina.title': 'Stamina',
        },
      },
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.resourceDefinitions).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.duplicateId',
      path: 'modules.local-contribution.data.resources.stamina',
      params: { id: 'stamina' },
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleDisabled',
      path: 'modules.local-contribution',
    }));
  });

  it('disables only the local overlay that makes a core location shape invalid', () => {
    const core = module({
      id: 'base-core',
      data: { locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }] },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'location', id: 'crossroads', position: { x: 'far' } },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations).toEqual([{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.locationsShape',
      path: 'modules.local-contribution.data-updates.locations.json',
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution' },
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleDisabled',
    )).toBe(false);
  });

  it('disables a local module with duplicate location update rows instead of silently merging them', () => {
    const core = module({
      id: 'base-core',
      data: { locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true, tags: ['settlement'] }] },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'location', id: 'crossroads', position: { x: 10 } },
        { type: 'location', id: 'crossroads', tags: ['camp'] },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations).toEqual([{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true, tags: ['settlement'] }]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.duplicateId',
      path: 'modules.local-contribution.data-updates.locations.crossroads',
      params: { id: 'crossroads' },
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleDisabled',
      path: 'modules.local-contribution',
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleDisabled',
    )).toBe(false);
  });

  it('disables a local module with duplicate resource update aliases instead of silently merging them', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }],
        stats: [{ id: 'power' }],
        resourceDefinitions: [{ id: 'stamina', sourceStat: 'power', max: 10 }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'stat.power.title': 'Power',
          'stat.power.description': 'Power.',
          'resource.stamina.title': 'Stamina',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': {
        resources: [{ id: 'stamina', max: 20 }],
        resourceDefinitions: [{ id: 'stamina', display: 'minimal' }],
      } as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.resourceDefinitions).toEqual([{ id: 'stamina', sourceStat: 'power', max: 10 }]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.duplicateId',
      path: 'modules.local-contribution.data-updates.resources.stamina',
      params: { id: 'stamina' },
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleDisabled',
      path: 'modules.local-contribution',
    }));
  });

  it('disables only the local overlay that breaks an entity action link', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true, entities: ['goblin'] }],
        entities: [{ id: 'goblin', actionIds: ['fight-goblin'] }],
        actions: [{ id: 'fight-goblin', durationSeconds: 1, rewards: [] }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'entity.goblin.title': 'Goblin',
          'entity.goblin.description': 'Small trouble.',
          'action.fight-goblin.title': 'Fight',
          'action.fight-goblin.description': 'Fight.',
          'action.fight-goblin.success': 'Done.',
          'action.fight-goblin.failure': 'No.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'entity', id: 'goblin', actionIds: ['fight-goblin', 'fake-action'] },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.entities?.find((entity) => entity.id === 'goblin')?.actionIds).toEqual(['fight-goblin']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'fake-action' },
    }));
  });

  it('disables only the local overlay that moves an action to an unknown location', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }],
        actions: [{ id: 'gather-rumors', locationId: 'crossroads', durationSeconds: 1, rewards: [] }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'action.gather-rumors.title': 'Gather Rumors',
          'action.gather-rumors.description': 'Listen.',
          'action.gather-rumors.success': 'Done.',
          'action.gather-rumors.failure': 'No.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'action', id: 'gather-rumors', locationId: 'missing-location' },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.actions.find((action) => action.id === 'gather-rumors')?.locationId).toBe('crossroads');
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'missing-location' },
    }));
  });

  it('disables only the local overlay that changes an action relocation result to an unknown location', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [
          { id: 'crossroads', position: { x: 0, y: 80 }, starting: true },
          { id: 'emberwood', position: { x: 160, y: 80 } },
        ],
        actions: [{ id: 'travel-to-emberwood', role: 'travel', locationId: 'crossroads', durationSeconds: 1, rewards: [], results: [{ kind: 'relocate', locationId: 'emberwood' }] }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'location.emberwood.title': 'Emberwood',
          'location.emberwood.description': 'A nearby wood.',
          'location.emberwood.exhausted': 'Nothing more here.',
          'action.travel-to-emberwood.title': 'Travel',
          'action.travel-to-emberwood.description': 'Go there.',
          'action.travel-to-emberwood.success': 'Done.',
          'action.travel-to-emberwood.failure': 'No.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'action', id: 'travel-to-emberwood', results: [{ kind: 'relocate', locationId: 'missing-location' }] },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.actions.find((action) => action.id === 'travel-to-emberwood')?.results).toEqual([{ kind: 'relocate', locationId: 'emberwood' }]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'missing-location' },
    }));
  });

  it('disables only the local overlay that changes a location state result to an unknown location', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [
          { id: 'crossroads', position: { x: 0, y: 80 }, starting: true },
          { id: 'emberwood', position: { x: 160, y: 80 } },
        ],
        actions: [{ id: 'return-to-emberwood', locationId: 'crossroads', durationSeconds: 1, rewards: [], results: [{ kind: 'state-variable', variable: 'location', value: 'emberwood' }] }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'location.emberwood.title': 'Emberwood',
          'location.emberwood.description': 'A nearby wood.',
          'location.emberwood.exhausted': 'Nothing more here.',
          'action.return-to-emberwood.title': 'Return',
          'action.return-to-emberwood.description': 'Go there.',
          'action.return-to-emberwood.success': 'Done.',
          'action.return-to-emberwood.failure': 'No.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'action', id: 'return-to-emberwood', results: [{ kind: 'state-variable', variable: 'location', value: 'missing-location' }] },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.actions.find((action) => action.id === 'return-to-emberwood')?.results).toEqual([{ kind: 'state-variable', variable: 'location', value: 'emberwood' }]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'missing-location' },
    }));
  });

  it('disables only the local update that removes a location used by core travel', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [
          { id: 'crossroads', position: { x: 0, y: 80 }, starting: true },
          { id: 'emberwood', position: { x: 160, y: 80 } },
        ],
        actions: [{ id: 'travel-to-emberwood', role: 'travel', locationId: 'crossroads', durationSeconds: 1, rewards: [], results: [{ kind: 'relocate', locationId: 'emberwood' }] }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'location.emberwood.title': 'Emberwood',
          'location.emberwood.description': 'A nearby wood.',
          'location.emberwood.exhausted': 'Nothing more here.',
          'action.travel-to-emberwood.title': 'Travel',
          'action.travel-to-emberwood.description': 'Go there.',
          'action.travel-to-emberwood.success': 'Done.',
          'action.travel-to-emberwood.failure': 'No.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': { remove: { locations: ['emberwood'] } },
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations.map((location) => location.id)).toEqual(['crossroads', 'emberwood']);
    expect(result.bundle.actions.find((action) => action.id === 'travel-to-emberwood')?.results).toEqual([{ kind: 'relocate', locationId: 'emberwood' }]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'emberwood' },
    }));
  });

  it('disables only the local overlay that changes a resource behavior to an unknown location', () => {
    const core = module({
      id: 'base-core',
      data: {
        locations: [
          { id: 'crossroads', position: { x: 0, y: 80 }, starting: true },
          { id: 'camp', position: { x: 160, y: 80 } },
        ],
        stats: [{ id: 'power' }],
        resourceDefinitions: [{ id: 'stamina', sourceStat: 'power', onEmpty: [{ kind: 'relocate', locationId: 'camp' }] }],
      },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
          'location.camp.title': 'Camp',
          'location.camp.description': 'A place to rest.',
          'location.camp.exhausted': 'Nothing more here.',
          'stat.power.title': 'Power',
          'stat.power.description': 'Power.',
          'resource.stamina.title': 'Stamina',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': [
        { type: 'resource', id: 'stamina', onEmpty: [{ kind: 'relocate', locationId: 'missing-location' }] },
      ] as never,
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.resourceDefinitions.find((resource) => resource.id === 'stamina')?.onEmpty).toEqual([{ kind: 'relocate', locationId: 'camp' }]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'missing-location' },
    }));
  });

  it('disables local data that adds an orphaned action with no location or entity reference', () => {
    const core = module({
      id: 'base-core',
      data: { locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }] },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      data: [
        { type: 'action', id: 'orphan-action', durationSeconds: 1, rewards: [] },
      ] as never,
      locale: {
        en: {
          'action.orphan-action.title': 'Orphan',
          'action.orphan-action.description': 'No location.',
          'action.orphan-action.success': 'Done.',
          'action.orphan-action.failure': 'No.',
        },
      },
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.actions).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'orphan-action' },
    }));
    expect(result.issues.some((issue) => issue.message === 'validation.actionLocationOrEntityRequired')).toBe(false);
  });

  it('disables only the local update that removes the only starting location from core', () => {
    const core = module({
      id: 'base-core',
      data: { locations: [{ id: 'crossroads', position: { x: 0, y: 80 }, starting: true }] },
      locale: {
        en: {
          'location.crossroads.title': 'Crossroads',
          'location.crossroads.description': 'A meeting of roads.',
          'location.crossroads.exhausted': 'Nothing more here.',
        },
      },
    });
    const contribution = module({
      id: 'local-contribution',
      'data-updates': { remove: { locations: ['crossroads'] } },
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      locations: [],
      locales: { en: { 'universe.test.title': 'Test', 'universe.test.description': 'Test' } },
    }, [core, contribution], ['base-core', 'local-contribution']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations.map((location) => location.id)).toEqual(['crossroads']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'crossroads' },
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      issue.message === 'validation.moduleConflictDisabled',
    )).toBe(false);
  });

  it('removes individual dialogue options during data-updates', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({
        id: 'core',
        data: {
          dialogues: [{
            id: 'guide',
            startNodeId: 'start',
            nodes: [{
              id: 'start',
              textKey: 'dialogue.guide.start',
              options: [
                { id: 'accept', labelKey: 'dialogue.guide.accept' },
                { id: 'decline', labelKey: 'dialogue.guide.decline' },
              ],
            }],
          }],
        },
      }),
      module({ id: 'patch', dependencies: ['core'], 'data-updates': { remove: { dialogueOptions: { 'guide.start': ['decline'] } } } }),
    ]);

    expect(result.bundle.dialogues?.[0]?.nodes[0]?.options?.map((option) => option.id)).toEqual(['accept']);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('applies typed data-update removal rows', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({
        id: 'core',
        data: [
          { type: 'item', id: 'token' },
          { type: 'item', id: 'kept' },
        ],
        locale: {
          en: {
            'item.token.title': 'Token',
            'item.token.description': 'A token.',
            'item.kept.title': 'Kept',
            'item.kept.description': 'Kept.',
          },
        },
      }),
      module({
        id: 'patch',
        dependencies: ['core'],
        'data-updates': [
          { type: 'remove', target: 'items', id: 'token' },
        ],
      }),
    ]);

    expect(result.enabledModuleIds).toEqual(['core', 'patch']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['kept']);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('applies typed dialogue option removal rows', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({
        id: 'core',
        data: [{
          type: 'dialogue',
          id: 'guide',
          startNodeId: 'start',
          nodes: [{
            id: 'start',
            textKey: 'dialogue.guide.start',
            options: [
              { id: 'accept', labelKey: 'dialogue.guide.accept' },
              { id: 'decline', labelKey: 'dialogue.guide.decline' },
            ],
          }],
        }],
      }),
      module({
        id: 'patch',
        dependencies: ['core'],
        'data-updates': [
          { type: 'remove', target: 'dialogueOptions', path: 'guide.start', id: 'decline' },
        ],
      }),
    ]);

    expect(result.bundle.dialogues?.[0]?.nodes[0]?.options?.map((option) => option.id)).toEqual(['accept']);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('merges resources from both supported module data aliases', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({
        id: 'resource-pack',
        data: {
          stats: [{ id: 'power' }],
          resourceDefinitions: [{ id: 'stamina', sourceStat: 'power' }],
          resources: [{ id: 'focus', sourceStat: 'power' }],
        },
      }),
    ]);

    expect(result.enabledModuleIds).toEqual(['resource-pack']);
    expect(result.bundle.resourceDefinitions.map((resource) => resource.id)).toEqual(['stamina', 'focus']);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('patches existing resources from both supported module data-updates aliases', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({
        id: 'core',
        data: {
          stats: [{ id: 'power' }],
          resourceDefinitions: [
            { id: 'stamina', sourceStat: 'power' },
            { id: 'focus', sourceStat: 'power' },
          ],
        },
        locale: {
          en: {
            'stat.power.title': 'Power',
            'stat.power.description': 'Power.',
            'resource.stamina.title': 'Stamina',
            'resource.focus.title': 'Focus',
          },
        },
      }),
      module({
        id: 'resource-patch',
        dependencies: ['core'],
        'data-updates': {
          resourceDefinitions: [{ id: 'stamina', max: 20 }],
          resources: [{ id: 'focus', max: 10 }],
        },
      } as never),
    ]);

    expect(result.enabledModuleIds).toEqual(['core', 'resource-patch']);
    expect(result.bundle.resourceDefinitions.map((resource) => [resource.id, resource.max])).toEqual([['stamina', 20], ['focus', 10]]);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('applies typed data rows through the same module lifecycle', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({
        id: 'typed-pack',
        data: [
          { type: 'stat', id: 'power' },
          { type: 'resource', id: 'focus', sourceStat: 'power' },
          { type: 'item', id: 'typed-token' },
        ],
        locale: {
          en: {
            'stat.power.title': 'Power',
            'stat.power.description': 'Power.',
            'resource.focus.title': 'Focus',
            'item.typed-token.title': 'Typed token',
            'item.typed-token.description': 'Typed.',
          },
        },
      }),
    ]);

    expect(result.enabledModuleIds).toEqual(['typed-pack']);
    expect(result.bundle.stats.map((stat) => stat.id)).toEqual(['power']);
    expect(result.bundle.resourceDefinitions.map((resource) => resource.id)).toEqual(['focus']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['typed-token']);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('rejects invalid typed data row prototypes', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({
        id: 'bad-typed-pack',
        data: [
          { type: 'action', id: 'bad-action', locationId: 'start', durationSeconds: 'fast', rewards: [] },
        ] as never,
      }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-typed-pack.data.actions.json' &&
      issue.message === 'validation.actionsShape',
    )).toBe(true);
  });

  it('rejects unknown typed data row types', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({
        id: 'bad-row-type',
        data: [
          { type: 'spell', id: 'spark' },
        ] as never,
      }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-row-type.data.0.type' &&
      issue.message === 'validation.moduleDataTypeInvalid' &&
      issue.params?.id === 'spell',
    )).toBe(true);
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

    expect(result.enabledModuleIds).toEqual(['core', 'consumer']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['token']);
    expect(result.bundle.actions.map((action) => action.id)).toEqual(['spend-token']);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleConflictDisabled' && issue.params?.id === 'consumer' && issue.params?.key === 'token')).toBe(false);
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
    const bundle = {
      ...baseBundle(),
      actions: [{ id: 'existing-action', locationId: 'start', durationSeconds: 1, rewards: [] }],
    };
    const result = applyModulesToBundle(bundle, [
      module({ id: 'bad-patch', 'data-updates': { actions: [{ id: 'existing-action', durationSeconds: 'fast' } as never] } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.bundle.actions).toEqual(bundle.actions);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-patch.data-updates.actions.json' &&
      issue.message === 'validation.actionsShape',
    )).toBe(true);
  });

  it('rejects modules with invalid data-updates removal lists', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'bad-remove', 'data-updates': { remove: { items: ['kept', 1] } as never } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-remove.data-updates.remove.items' &&
      issue.message === 'validation.moduleRemoveInvalid',
    )).toBe(true);
    expect(result.issues.some((issue) => issue.message === 'validation.moduleDisabled' && issue.params?.id === 'bad-remove')).toBe(true);
  });

  it('rejects malformed data-updates dialogue option removals', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'bad-remove', 'data-updates': { remove: { dialogueOptions: { 'guide.start': ['accept', 1] } } as never } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-remove.data-updates.remove.dialogueOptions' &&
      issue.message === 'validation.moduleRemoveInvalid',
    )).toBe(true);
  });

  it('rejects malformed typed data-update removal rows', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'bad-remove', 'data-updates': [{ type: 'remove', target: 'dialogueOptions', id: 'accept' }] as never }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-remove.data-updates.0.remove' &&
      issue.message === 'validation.moduleRemoveInvalid' &&
      issue.params?.id === 'dialogueOptions',
    )).toBe(true);
  });

  it('rejects typed removal rows in module data', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'bad-remove', data: [{ type: 'remove', target: 'items', id: 'token' }] as never }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-remove.data.0.type' &&
      issue.message === 'validation.moduleDataTypeInvalid' &&
      issue.params?.id === 'remove',
    )).toBe(true);
  });

  it('rejects modules with invalid data-updates locale dictionaries', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'bad-locale', 'data-updates': { locale: { en: { 'item.foo.title': 1 } as never } } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-locale.data-updates.locale.en.locales.item.foo.title' &&
      issue.message === 'validation.localeShape',
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

  it('collects localization keys from both resource aliases', () => {
    const resourceModule = module({
      id: 'resource-pack',
      data: {
        resourceDefinitions: [{ id: 'stamina', sourceStat: 'power' }],
        resources: [{ id: 'focus', sourceStat: 'power' }],
      },
    });

    expect(collectModuleLocalizationKeys(resourceModule)).toEqual(expect.arrayContaining([
      'resource.stamina.title',
      'resource.focus.title',
    ]));
  });

  it('warns for missing module localization in the selected locale', () => {
    const bundle = {
      ...baseBundle(),
      manifest: { ...baseBundle().manifest, locales: ['en', 'es'] },
      locales: { ...baseBundle().locales, es: {} },
    };
    const quest = module({
      id: 'quest',
      data: { items: [{ id: 'quest-token' }] },
      locale: { en: { 'item.quest-token.title': 'Quest token', 'item.quest-token.description': 'A token.' } },
    });

    const result = applyModulesToBundle(bundle, [quest], undefined, 'es');

    expect(result.issues.some((issue) =>
      issue.severity === 'warning' &&
      issue.path === 'modules.quest.locale.es.item.quest-token.title' &&
      issue.message === 'validation.missingLocalization',
    )).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'modules.quest.locale.en.item.quest-token.title')).toBe(false);
  });

  it('counts data-updates locale entries toward selected-locale module coverage', () => {
    const bundle = {
      ...baseBundle(),
      manifest: { ...baseBundle().manifest, locales: ['en', 'es'] },
      locales: { ...baseBundle().locales, es: {} },
    };
    const quest = module({
      id: 'quest',
      data: { items: [{ id: 'quest-token' }] },
      'data-updates': {
        locale: {
          es: {
            'item.quest-token.title': 'Ficha',
            'item.quest-token.description': 'Una ficha.',
          },
        },
      },
    });

    const result = applyModulesToBundle(bundle, [quest], undefined, 'es');

    expect(result.issues.some((issue) =>
      issue.path.startsWith('modules.quest.locale.es.item.quest-token') &&
      issue.message === 'validation.missingLocalization',
    )).toBe(false);
  });

  it('rejects modules with invalid module locale dictionaries', () => {
    const result = applyModulesToBundle(baseBundle(), [
      module({ id: 'bad-module-locale', locale: { en: { 'item.foo.title': 1 } as never } }),
    ]);

    expect(result.enabledModuleIds).toEqual([]);
    expect(result.issues.some((issue) =>
      issue.severity === 'error' &&
      issue.path === 'modules.bad-module-locale.locale.en.locales.item.foo.title' &&
      issue.message === 'validation.localeShape',
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
      removed: { locations: [], actions: [], skills: [], stats: [], items: [], flags: [], resources: [], effects: [], interactionTypes: [], enemies: [], dropTables: [], dialogues: [], modules: [] },
    });

    const result = applyModulesToBundle(bundleWithDraft, bundleWithDraft.modules ?? [], ['draft-module']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['draft-item']);
  });

  it('does not let drafted modules replace or remove packaged core modules', () => {
    const core = module({
      id: 'base-core',
      data: { items: [{ id: 'core-item' }] },
      locale: { en: { 'item.core-item.title': 'Core item', 'item.core-item.description': 'From core.' } },
    });
    const bundleWithDraft = mergeDraftModulesIntoBundle({
      ...baseBundle(),
      modules: [core],
    }, {
      universeId: 'test',
      updatedAt: 1,
      notes: '',
      modules: [
        module({
          id: 'base-core',
          data: { items: [{ id: 'draft-replacement' }] },
          locale: { en: { 'item.draft-replacement.title': 'Draft', 'item.draft-replacement.description': 'Wrong.' } },
        }),
        module({
          id: 'local-patch',
          dependencies: ['base-core'],
          data: { items: [{ id: 'local-item' }] },
          locale: { en: { 'item.local-item.title': 'Local item', 'item.local-item.description': 'From local.' } },
        }),
        module({
          id: 'fake-core',
          data: { items: [{ id: 'fake-core-item' }] },
          locale: { en: { 'item.fake-core-item.title': 'Fake core item', 'item.fake-core-item.description': 'Still local.' } },
        }),
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
      removed: { locations: [], actions: [], skills: [], stats: [], items: [], flags: [], resources: [], effects: [], interactionTypes: [], enemies: [], dropTables: [], dialogues: [], modules: ['base-core'] },
    });

    expect(bundleWithDraft.modules?.map((candidate) => candidate.id)).toEqual(['base-core', 'local-patch', 'fake-core']);

    const result = applyModulesToBundle(bundleWithDraft, bundleWithDraft.modules ?? [], ['base-core', 'local-patch', 'fake-core']);
    expect(result.enabledModuleIds).toEqual(expect.arrayContaining(['base-core', 'local-patch', 'fake-core']));
    expect(result.enabledModuleIds).toHaveLength(3);
    expect(result.bundle.items.map((item) => item.id)).toEqual(expect.arrayContaining(['core-item', 'local-item', 'fake-core-item']));
  });

  it('disables a broken overlay while preserving the core module', () => {
    const core = module({
      id: 'base-core',
      data: { items: [{ id: 'core-item' }] },
      locale: { en: { 'item.core-item.title': 'Core item', 'item.core-item.description': 'From core.' } },
    });
    const brokenOverlay = module({
      id: 'broken-overlay',
      dependencies: ['base-core'],
      'data-updates': { remove: { locations: ['start'] } },
    });

    const result = applyModulesToBundle({
      ...baseBundle(),
      modules: [core, brokenOverlay],
    }, [core, brokenOverlay], ['base-core', 'broken-overlay']);

    expect(result.enabledModuleIds).toEqual(['base-core']);
    expect(result.bundle.locations.map((location) => location.id)).toEqual(['start']);
    expect(result.bundle.items.map((item) => item.id)).toEqual(['core-item']);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.broken-overlay',
    }));
  });

  it('can merge drafted module packs into the contribution preview', () => {
    const bundleWithDraft = mergeDraftModulesIntoBundle(baseBundle(), {
      universeId: 'test',
      updatedAt: 1,
      notes: '',
      modules: [module({ id: 'draft-module', data: { items: [{ id: 'draft-item' }] } })],
      modulePacks: [{ id: 'draft-pack', modules: ['draft-module'], packs: [{ id: 'nested-pack', modules: ['draft-module'] }] }],
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
      removed: { locations: [], actions: [], skills: [], stats: [], items: [], flags: [], resources: [], effects: [], interactionTypes: [], enemies: [], dropTables: [], dialogues: [], modules: [] },
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

  it('warns instead of throwing when module packs have malformed draft data', () => {
    const bundle = {
      ...baseBundle(),
      modulePacks: [
        { id: 'starter', modules: ['known', 1] },
        { modules: ['known'] },
      ] as never,
    };
    const result = applyModulesToBundle(bundle, [module({ id: 'known', data: { items: [{ id: 'known-item' }] } })]);

    expect(result.enabledModuleIds).toEqual(['known']);
    expect(result.issues.filter((issue) => issue.message === 'validation.modulePacksInvalid')).toHaveLength(2);
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
