import type {
  ContentBundle,
  EnemyDefinition,
  EffectDefinition,
  GameAction,
  InteractionTypeDefinition,
  ItemDefinition,
  LocalUniverseLibrary,
  LocaleDictionary,
  LocationNode,
  ResourceDefinition,
  SkillDefinition,
  TravelEdgeDefinition,
  UniverseManifest,
} from './types';
import { validateContentShape, validateManifest } from './validators';
import { load, save } from '../lib/storage';

const BASE_CONTENT_PATH = '/content/universes';
const LOCAL_UNIVERSES_KEY = 'universalis:local-universes';

const loadJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Unable to load ${path}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
};

export const loadUniverseManifest = async (universeId: string) => {
  const manifest = await loadJson<unknown>(`${BASE_CONTENT_PATH}/${universeId}/universe.json`);

  if (!validateManifest(manifest)) {
    throw new Error(`Invalid manifest for universe "${universeId}".`);
  }

  return manifest;
};

export const loadUniverse = async (universeId: string): Promise<ContentBundle> => {
  const basePath = `${BASE_CONTENT_PATH}/${universeId}`;
  const manifest = await loadUniverseManifest(universeId);
  const [locations, edges, actions, skills, items, resourceDefinitions, effects, interactionTypes, enemies] = await Promise.all([
    loadJson<LocationNode[]>(`${basePath}/locations.json`),
    loadJson<TravelEdgeDefinition[]>(`${basePath}/edges.json`),
    loadJson<GameAction[]>(`${basePath}/actions.json`),
    loadJson<SkillDefinition[]>(`${basePath}/skills.json`),
    manifest.files.includes('items.json')
      ? loadJson<ItemDefinition[]>(`${basePath}/items.json`)
      : Promise.resolve([]),
    manifest.files.includes('resources.json')
      ? loadJson<ResourceDefinition[]>(`${basePath}/resources.json`)
      : Promise.resolve([]),
    manifest.files.includes('effects.json')
      ? loadJson<EffectDefinition[]>(`${basePath}/effects.json`)
      : Promise.resolve([]),
    manifest.files.includes('interaction-types.json')
      ? loadJson<InteractionTypeDefinition[]>(`${basePath}/interaction-types.json`)
      : Promise.resolve([]),
    manifest.files.includes('enemies.json')
      ? loadJson<EnemyDefinition[]>(`${basePath}/enemies.json`)
      : Promise.resolve([]),
  ]);

  const locales = await manifest.locales.reduce<Promise<Record<string, LocaleDictionary>>>(
    async (promise, locale) => {
      const loaded = await promise;
      loaded[locale] = await loadJson<LocaleDictionary>(`${basePath}/locales/${locale}.json`);
      return loaded;
    },
    Promise.resolve({}),
  );

  const bundle = {
    manifest,
    locations,
    edges,
    actions,
    skills,
    items,
    resourceDefinitions,
    effects,
    interactionTypes,
    enemies,
    locales,
  };
  const issues = validateContentShape(bundle);

  if (issues.some((issue) => issue.severity === 'error')) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }

  return bundle;
};

export const listBundledUniverses = async (): Promise<UniverseManifest[]> => {
  const universeIds = await loadJson<string[]>(`${BASE_CONTENT_PATH}/index.json`);
  return Promise.all(universeIds.map((universeId) => loadUniverseManifest(universeId)));
};

export const loadLocalUniverseLibrary = async (): Promise<LocalUniverseLibrary> =>
  (await load<LocalUniverseLibrary>(LOCAL_UNIVERSES_KEY)) ?? {};

export const saveLocalUniverseBundle = async (bundle: ContentBundle) => {
  const library = await loadLocalUniverseLibrary();
  library[bundle.manifest.id] = bundle;
  await save(LOCAL_UNIVERSES_KEY, library);
};

export const removeLocalUniverseBundle = async (universeId: string) => {
  const library = await loadLocalUniverseLibrary();
  delete library[universeId];
  await save(LOCAL_UNIVERSES_KEY, library);
};
