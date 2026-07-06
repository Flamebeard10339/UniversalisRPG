import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyModulesToBundle } from './contentModules';
import { loadUniverse } from './loader';

const jsonResponse = (json: unknown, status = 200) =>
  new Response(JSON.stringify(json), {
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    headers: { 'content-type': 'application/json' },
  });

const installFetch = (responses: Record<string, unknown>) => {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (!(path in responses)) {
      return jsonResponse({}, 404);
    }
    return jsonResponse(responses[path]);
  }));
};

const installPublicContentFetch = () => {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    try {
      const jsonText = readFileSync(join(process.cwd(), 'public', path.replace(/^\//, '')), 'utf8').replace(/^\uFEFF/, '');
      const json = JSON.parse(jsonText) as unknown;
      return jsonResponse(json);
    } catch {
      return jsonResponse({}, 404);
    }
  }));
};

const baseResponses = () => ({
  '/content/universes/test/universe.json': {
    schemaVersion: 1,
    id: 'test',
    version: '0.1.0',
    author: 'test',
    locales: ['en'],
    files: ['locations.json', 'actions.json', 'skills.json'],
  },
  '/content/universes/test/locations.json': [{ id: 'start', position: { x: 0, y: 0 }, starting: true }],
  '/content/universes/test/actions.json': [],
  '/content/universes/test/skills.json': [],
  '/content/universes/test/locales/en.json': {
    'universe.test.title': 'Test',
    'universe.test.description': 'Test',
    'location.start.title': 'Start',
    'location.start.description': 'Start',
  },
});

describe('loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips malformed module files instead of failing the universe load', async () => {
    installFetch({
      ...baseResponses(),
      '/content/universes/test/universe.json': {
        ...baseResponses()['/content/universes/test/universe.json'],
        modules: ['good', 'bad'],
      },
      '/content/universes/test/modules/good.json': {
        id: 'good',
        version: '1.0.0',
        universe: 'test',
        author: 'test',
        game_version: '1.0',
        data: { items: [{ id: 'good-item' }] },
      },
      '/content/universes/test/modules/bad.json': {
        id: 'wrong-id',
        version: '1.0.0',
        universe: 'test',
        author: 'test',
        game_version: '1.0',
      },
    });

    const bundle = await loadUniverse('test');

    expect(bundle.modules?.map((module) => module.id)).toEqual(['good']);
    expect(bundle.moduleIssues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleShapeInvalid',
      path: 'modules.bad',
      params: { id: 'bad' },
    }));
  });

  it('skips malformed manifest module lists instead of failing the universe load', async () => {
    installFetch({
      ...baseResponses(),
      '/content/universes/test/universe.json': {
        ...baseResponses()['/content/universes/test/universe.json'],
        modules: ['good', '../bad'],
      },
      '/content/universes/test/modules/good.json': {
        id: 'good',
        version: '1.0.0',
        universe: 'test',
        author: 'test',
        game_version: '1.0',
      },
    });

    const bundle = await loadUniverse('test');

    expect(bundle.modules).toEqual([]);
    expect(bundle.moduleIssues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleIndexInvalid',
      path: 'universe.json.modules',
    }));
  });

  it('does not load legacy module indexes when manifest modules are not defined', async () => {
    installFetch({
      ...baseResponses(),
      '/content/universes/test/modules/index.json': ['good.json'],
      '/content/universes/test/modules/good.json': {
        id: 'good',
        version: '1.0.0',
        universe: 'test',
        author: 'test',
        game_version: '1.0',
      },
    });

    const bundle = await loadUniverse('test');

    expect(bundle.modules).toEqual([]);
    expect(fetch).not.toHaveBeenCalledWith('/content/universes/test/modules/index.json');
  });

  it('loads universes whose gameplay content is supplied entirely by modules', async () => {
    installFetch({
      ...baseResponses(),
      '/content/universes/test/universe.json': {
        schemaVersion: 1,
        id: 'test',
        version: '0.1.0',
        author: 'test',
        locales: ['en'],
        files: ['locales/en.json'],
        modules: ['core'],
      },
      '/content/universes/test/modules/core.json': {
        id: 'core',
        version: '1.0.0',
        universe: 'test',
        author: 'test',
        game_version: '1.0',
        data: [
          { type: 'location', id: 'start', position: { x: 0, y: 0 }, starting: true },
          { type: 'skill', id: 'lore', maxLevel: 100 },
        ],
      },
    });

    const bundle = await loadUniverse('test');

    expect(bundle.locations).toEqual([]);
    expect(bundle.skills).toEqual([]);
    expect(bundle.modules?.map((module) => module.id)).toEqual(['core']);
  });

  it('skips malformed module packs instead of failing the universe load', async () => {
    installFetch({
      ...baseResponses(),
      '/content/universes/test/universe.json': {
        ...baseResponses()['/content/universes/test/universe.json'],
        modules: ['good'],
      },
      '/content/universes/test/modules/good.json': {
        id: 'good',
        version: '1.0.0',
        universe: 'test',
        author: 'test',
        game_version: '1.0',
      },
      '/content/universes/test/module-packs.json': [{ id: 'starter', modules: ['good'], packs: [{ modules: ['good'] }] }],
    });

    const bundle = await loadUniverse('test');

    expect(bundle.modules?.map((module) => module.id)).toEqual(['good']);
    expect(bundle.modulePacks).toEqual([]);
    expect(bundle.moduleIssues).toContainEqual(expect.objectContaining({
      message: 'validation.modulePacksInvalid',
      path: 'modulePacks',
    }));
  });

  it('loads base-core as a valid enabled module without warnings', async () => {
    installPublicContentFetch();

    const bundle = await loadUniverse('base');
    const baseCore = bundle.modules?.find((module) => module.id === 'base-core');

    expect(baseCore).toBeDefined();

    const result = applyModulesToBundle(bundle, [baseCore!], ['base-core']);
    const baseCoreIssues = result.issues.filter((issue) => issue.path.startsWith('modules.base-core'));

    expect(result.enabledModuleIds).toContain('base-core');
    expect(baseCoreIssues).toEqual([]);
  });

  it('keeps packaged base modules enabled when a local module adds a location with an unknown entity', async () => {
    installPublicContentFetch();

    const bundle = await loadUniverse('base');
    const localContribution = {
      id: 'local-contribution',
      version: '1.0.0',
      universe: 'base',
      author: 'test',
      game_version: '1.0',
      data: [
        { type: 'location', id: 'bad-camp', position: { x: 640, y: 80 }, entities: ['missing-guide'] },
      ],
      locale: {
        en: {
          'location.bad-camp.title': 'Bad camp',
          'location.bad-camp.description': 'Invalid on purpose.',
          'location.bad-camp.exhausted': 'Nothing more here.',
        },
      },
    };
    const modules = [...(bundle.modules ?? []), localContribution];

    const result = applyModulesToBundle(bundle, modules, modules.map((module) => module.id));

    expect(result.enabledModuleIds).toContain('base-core');
    expect(result.enabledModuleIds).toContain('wayside-supplies');
    expect(result.enabledModuleIds).not.toContain('local-contribution');
    expect(result.bundle.locations.some((location) => location.id === 'tutorial-guide-house')).toBe(true);
    expect(result.bundle.locations.some((location) => location.id === 'bad-camp')).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      message: 'validation.moduleConflictDisabled',
      path: 'modules.local-contribution',
      params: { id: 'local-contribution', key: 'missing-guide' },
    }));
    expect(result.issues.some((issue) =>
      issue.path === 'modules.base-core' &&
      (issue.message === 'validation.moduleConflictDisabled' || issue.message === 'validation.moduleDisabled'),
    )).toBe(false);
  });

  it('does not warn for inherited packaged location localization in a local overlay', async () => {
    installPublicContentFetch();

    const bundle = await loadUniverse('base');
    const localContribution = {
      id: 'local-contribution',
      version: '1.0.0',
      universe: 'base',
      author: 'test',
      game_version: '1.0',
      'data-updates': [
        {
          type: 'location',
          id: 'tutorial-guide-house',
          position: { x: 10 },
          entities: ['miki'],
        },
      ],
    };
    const modules = [...(bundle.modules ?? []), localContribution];

    const result = applyModulesToBundle(bundle, modules, modules.map((module) => module.id));
    const localContributionIssues = result.issues.filter((issue) => issue.path.startsWith('modules.local-contribution'));

    expect(result.enabledModuleIds).toContain('local-contribution');
    expect(result.bundle.locations.find((location) => location.id === 'tutorial-guide-house')?.position).toEqual({ x: 10, y: 0 });
    expect(localContributionIssues.some((issue) =>
      issue.path.startsWith('modules.local-contribution.locale.en.location.tutorial-guide-house'),
    )).toBe(false);
  });
});
