import type {
  ContentBundle,
  ContentModule,
  ContentModulePack,
  DialogueDefinition,
  DropTableDefinition,
  EnemyDefinition,
  EntityDefinition,
  EffectDefinition,
  GameAction,
  InteractionTypeDefinition,
  ItemDefinition,
  LocalUniverseLibrary,
  LocaleDictionary,
  LocationNode,
  ResourceDefinition,
  SkillDefinition,
  StatDefinition,
  StateFlagDefinition,
  UniverseManifest,
  ValidationIssue,
} from './types';
import { validateModuleShape } from './contentModules';
import { validateContentShape, validateManifest } from './validators';
import { load, save } from '../lib/storage';
import { compileDsl } from './contentDsl/compiler';

const BASE_CONTENT_PATH = '/content/universes';
const LOCAL_UNIVERSES_KEY = 'universalis:local-universes';

const moduleIdFromFile = (moduleFile: string) => moduleFile.replace(/\.json$/i, '');
const moduleIdPattern = /^[a-z0-9][a-z0-9.-]*$/;
const moduleFileFromId = (moduleId: string) => `${moduleId}.json`;

const moduleLoadIssue = (moduleFile: string, message: string, params?: Record<string, string | number>): ValidationIssue => ({
  severity: 'error',
  path: `modules.${moduleIdFromFile(moduleFile)}`,
  message,
  params,
});

const moduleFileIssue = (path: string, message: string, params?: Record<string, string | number>): ValidationIssue => ({
  severity: 'error',
  path,
  message,
  params,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateManifestModulesShape = (value: unknown): value is string[] =>
  value === undefined ||
  (Array.isArray(value) && value.every((moduleId) => typeof moduleId === 'string' && moduleIdPattern.test(moduleId)));

const validateModulePackShape = (value: unknown): value is ContentModulePack =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  /^[a-z0-9][a-z0-9.-]*$/.test(value.id) &&
  (value.titleKey === undefined || typeof value.titleKey === 'string') &&
  (value.modules === undefined || (Array.isArray(value.modules) && value.modules.every((moduleId) => typeof moduleId === 'string'))) &&
  (value.packs === undefined || (Array.isArray(value.packs) && value.packs.every(validateModulePackShape)));

const validateModulePacksShape = (value: unknown): value is ContentModulePack[] =>
  Array.isArray(value) && value.every(validateModulePackShape);

const loadJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Unable to load ${path}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
};

const tryLoadJson = async <T>(path: string): Promise<T | null> => {
  const response = await fetch(path);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load ${path}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
};

const tryLoadText = async (path: string): Promise<string | null> => {
  const response = await fetch(path);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.text();
};

// A missing static file doesn't always come back as a literal 404 — some
// dev servers (Vite's included) serve their SPA-fallback index.html with a
// 200 for any unmatched path, which would otherwise look like a
// successfully-loaded (but garbage) JSON module. Used specifically by the
// json-then-md module fallback below, which needs to reliably tell "this
// isn't JSON, try .md" apart from "this really is invalid JSON."
const tryLoadModuleJson = async <T>(path: string): Promise<T | null> => {
  const response = await fetch(path);
  if (!response.ok) return null;
  if (!(response.headers.get('content-type') ?? '').includes('json')) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
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
  const loadContentFile = <T>(fileName: string) =>
    manifest.files.includes(fileName)
      ? loadJson<T[]>(`${basePath}/${fileName}`)
      : Promise.resolve([]);
  const [locations, entities, actions, skills, stats, items, flags, resourceDefinitions, effects, interactionTypes, enemies, dropTables, dialogues] = await Promise.all([
    loadContentFile<LocationNode>('locations.json'),
    loadContentFile<EntityDefinition>('entities.json'),
    loadContentFile<GameAction>('actions.json'),
    loadContentFile<SkillDefinition>('skills.json'),
    loadContentFile<StatDefinition>('stats.json'),
    loadContentFile<ItemDefinition>('items.json'),
    loadContentFile<StateFlagDefinition>('flags.json'),
    loadContentFile<ResourceDefinition>('resources.json'),
    loadContentFile<EffectDefinition>('effects.json'),
    loadContentFile<InteractionTypeDefinition>('interaction-types.json'),
    loadContentFile<EnemyDefinition>('enemies.json'),
    loadContentFile<DropTableDefinition>('drop-tables.json'),
    loadContentFile<DialogueDefinition>('dialogues.json'),
  ]);

  const locales = await manifest.locales.reduce<Promise<Record<string, LocaleDictionary>>>(
    async (promise, locale) => {
      const loaded = await promise;
      loaded[locale] = await loadJson<LocaleDictionary>(`${basePath}/locales/${locale}.json`);
      return loaded;
    },
    Promise.resolve({}),
  );
  const moduleIssueSeeds: ValidationIssue[] = [];
  let moduleFiles: string[] = [];
  if (validateManifestModulesShape(manifest.modules)) {
    moduleFiles = (manifest.modules ?? []).map(moduleFileFromId);
  } else {
    moduleIssueSeeds.push(moduleFileIssue('universe.json.modules', 'validation.moduleIndexInvalid'));
  }

  const { modules, moduleIssues } = await moduleFiles.reduce<Promise<{ modules: ContentModule[]; moduleIssues: ValidationIssue[] }>>(async (promise, moduleFile) => {
    const loaded = await promise;
    const moduleId = moduleIdFromFile(moduleFile);
    try {
      // Content modules are authored as either JSON (promoted from the
      // legacy pipeline) or DSL markdown (see src/game/contentDsl/) —
      // try JSON first, then fall back to compiling the .md source.
      const jsonModule = await tryLoadModuleJson<unknown>(`${basePath}/modules/${moduleFile}`);
      let module: unknown = jsonModule;
      if (module === null) {
        const source = await tryLoadText(`${basePath}/modules/${moduleId}.md`);
        if (source === null) {
          return {
            ...loaded,
            moduleIssues: [...loaded.moduleIssues, moduleLoadIssue(moduleFile, 'validation.moduleLoadFailed', { id: moduleId })],
          };
        }
        module = compileDsl(source).module;
      }
      if (!validateModuleShape(module, moduleFile)) {
        return {
          ...loaded,
          moduleIssues: [...loaded.moduleIssues, moduleLoadIssue(moduleFile, 'validation.moduleShapeInvalid', { id: moduleId })],
        };
      }
      return { ...loaded, modules: [...loaded.modules, module] };
    } catch {
      return {
        ...loaded,
        moduleIssues: [...loaded.moduleIssues, moduleLoadIssue(moduleFile, 'validation.moduleLoadFailed', { id: moduleId })],
      };
    }
  }, Promise.resolve({ modules: [], moduleIssues: moduleIssueSeeds }));

  let modulePacks: ContentModulePack[] = [];
  try {
    const modulePacksJson = await tryLoadJson<unknown>(`${basePath}/module-packs.json`);
    if (modulePacksJson !== null) {
      if (validateModulePacksShape(modulePacksJson)) {
        modulePacks = modulePacksJson;
      } else {
        moduleIssues.push(moduleFileIssue('modulePacks', 'validation.modulePacksInvalid'));
      }
    }
  } catch {
    moduleIssues.push(moduleFileIssue('modulePacks', 'validation.modulePacksInvalid'));
  }

  const bundle = {
    manifest,
    locations,
    entities,
    actions,
    skills,
    stats,
    items,
    flags,
    resourceDefinitions,
    effects,
    interactionTypes,
    enemies,
    dropTables,
    dialogues,
    locales,
    modules,
    modulePacks,
    moduleIssues,
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
