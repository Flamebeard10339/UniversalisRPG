import { afterEach, describe, expect, it, vi } from 'vitest';
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

const baseResponses = () => ({
  '/content/universes/test/universe.json': {
    schemaVersion: 1,
    id: 'test',
    version: '0.1.0',
    author: 'test',
    locales: ['en'],
    files: ['locations.json', 'edges.json', 'actions.json', 'skills.json'],
  },
  '/content/universes/test/locations.json': [{ id: 'start', position: { x: 0, y: 0 }, starting: true }],
  '/content/universes/test/edges.json': [],
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
      '/content/universes/test/modules/index.json': ['good.json', 'bad.json'],
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

  it('skips malformed module indexes instead of failing the universe load', async () => {
    installFetch({
      ...baseResponses(),
      '/content/universes/test/modules/index.json': ['good.json', '../bad.json'],
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
      path: 'modules.index',
    }));
  });

  it('skips malformed module packs instead of failing the universe load', async () => {
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
});
