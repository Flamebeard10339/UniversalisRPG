import { create } from 'zustand';
import type { ContentBundle, UniverseManifest, ValidationIssue } from '../game/types';
import { applyModulesToBundle } from '../game/contentModules';
import { normalizeEnemyDefinition } from '../game/enemies';
import { normalizeGameAction } from '../game/actions';
import {
  listBundledUniverses,
  loadLocalUniverseLibrary,
  loadUniverse,
  removeLocalUniverseBundle,
  saveLocalUniverseBundle,
} from '../game/loader';
import { mergeDraftIntoBundle, mergeDraftModulesIntoBundle, validateContentBundle } from '../game/validators';
import { load, save } from '../lib/storage';
import { useContributionState } from './contributionState';
import { useGameState } from './gameState';
import type { ModuleCleanupReport } from '../game/moduleCleanup';
import { migrateMonolithicBundleToCoreModule } from '../game/moduleMigration';

export type LocalePreference = 'system' | string;

type UniverseStateStore = {
  activeUniverseId: string;
  manifests: UniverseManifest[];
  guiLocales: Record<string, Record<string, string>>;
  baseBundle: ContentBundle | null;
  bundle: ContentBundle | null;
  validationIssues: ValidationIssue[];
  enabledModules: Record<string, string[]>;
  moduleCleanupReport: ModuleCleanupReport | null;
  localePreference: LocalePreference;
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  setActiveUniverse: (universeId: string) => Promise<void>;
  setLocalePreference: (locale: LocalePreference) => Promise<void>;
  setEnabledModules: (universeId: string, moduleIds: string[]) => Promise<void>;
  clearModuleCleanupReport: () => void;
  importLocalUniverse: (bundle: ContentBundle) => Promise<void>;
  removeLocalUniverse: (universeId: string) => Promise<void>;
  refreshContributionPreview: () => void;
  t: (key: string, fallbackOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => string;
};

const localePreferenceKey = 'universalis:settings:locale';
const moduleSettingsKey = 'universalis:settings:modules';
const GUI_LOCALE_PATH = '/content/gui/locales';

const loadGuiLocale = async (locale: string) => {
  const response = await fetch(`${GUI_LOCALE_PATH}/${locale}.json`);
  if (!response.ok) {
    throw new Error(`gui-locale:${locale}`);
  }
  return response.json() as Promise<Record<string, string>>;
};

const formatText = (value: string, params?: Record<string, string | number>) =>
  params
    ? value.replace(/\{([^}]+)\}/g, (match, key) => String(params[key] ?? match))
    : value;

const resolveLocale = (bundle: ContentBundle, preference: LocalePreference) => {
  if (preference !== 'system' && bundle.manifest.locales.includes(preference)) {
    return preference;
  }

  const systemLocale = navigator.language.split('-')[0];
  return bundle.manifest.locales.includes(systemLocale) ? systemLocale : bundle.manifest.locales[0] ?? 'en';
};

const applyModulesAndDraft = (bundle: ContentBundle | null, enabledModules: Record<string, string[]>, localePreference: LocalePreference) => {
  if (!bundle) {
    return {
      bundle: null,
      enabledModuleIds: [],
      validationIssues: [],
    };
  }

  const draft = useContributionState.getState().getDraft(bundle.manifest.id);
  const bundleWithDraftModules = mergeDraftModulesIntoBundle(bundle, draft);
  const moduleResolution = applyModulesToBundle(
    bundleWithDraftModules,
    bundleWithDraftModules.modules ?? [],
    enabledModules[bundleWithDraftModules.manifest.id],
    resolveLocale(bundleWithDraftModules, localePreference),
  );
  const merged = mergeDraftIntoBundle(moduleResolution.bundle, draft);

  return {
    bundle: merged,
    enabledModuleIds: moduleResolution.enabledModuleIds,
    validationIssues: [...moduleResolution.issues, ...validateContentBundle(merged)],
  };
};

const normalizeContentBundle = (bundle: ContentBundle): ContentBundle => ({
  ...bundle,
  actions: bundle.actions.map(normalizeGameAction),
  entities: bundle.entities ?? [],
  items: bundle.items ?? [],
  flags: bundle.flags ?? [],
  resourceDefinitions: bundle.resourceDefinitions ?? [],
  stats: bundle.stats ?? [],
  effects: bundle.effects ?? [],
  interactionTypes: bundle.interactionTypes ?? [],
  enemies: (bundle.enemies ?? []).map((enemy) => normalizeEnemyDefinition(enemy)),
  dialogues: bundle.dialogues ?? [],
});

const loadBaseBundle = async (
  universeId: string,
  bundledManifests: UniverseManifest[],
  localLibrary: Record<string, ContentBundle>,
) => {
  const bundled = bundledManifests.some((manifest) => manifest.id === universeId);
  if (bundled) {
    return normalizeContentBundle(await loadUniverse(universeId));
  }

  const localBundle = localLibrary[universeId];
  const bundle = localBundle ?? (await loadUniverse(universeId));
  return normalizeContentBundle(bundle);
};

const mergeManifests = (bundledManifests: UniverseManifest[], localLibrary: Record<string, ContentBundle>) => {
  const bundledIds = new Set(bundledManifests.map((manifest) => manifest.id));
  return [
    ...bundledManifests,
    ...Object.values(localLibrary)
      .map((bundle) => bundle.manifest)
      .filter((manifest) => !bundledIds.has(manifest.id)),
  ];
};

export const useUniverseState = create<UniverseStateStore>((set, get) => ({
  activeUniverseId: 'base',
  manifests: [],
  guiLocales: {},
  baseBundle: null,
  bundle: null,
  validationIssues: [],
  enabledModules: {},
  moduleCleanupReport: null,
  localePreference: 'system',
  loading: false,
  error: null,

  initialize: async () => {
    set({ loading: true, error: null });

    try {
      const [bundledManifests, localLibrary, savedLocalePreference, savedEnabledModules, guiEn] = await Promise.all([
        listBundledUniverses(),
        loadLocalUniverseLibrary(),
        load<LocalePreference>(localePreferenceKey),
        load<Record<string, string[]>>(moduleSettingsKey),
        loadGuiLocale('en'),
      ]);
      const manifests = mergeManifests(bundledManifests, localLibrary);
      const activeUniverseId = get().activeUniverseId;
      await useContributionState.getState().hydrate(activeUniverseId);
      const baseBundle = await loadBaseBundle(activeUniverseId, bundledManifests, localLibrary);
      const enabledModules = savedEnabledModules ?? {};
      const localePreference = savedLocalePreference ?? 'system';
      const preview = applyModulesAndDraft(baseBundle, enabledModules, localePreference);
      const { enabledModuleIds, ...previewState } = preview;
      const resolvedEnabledModules = {
        ...enabledModules,
        ...(enabledModules[activeUniverseId] !== undefined || enabledModuleIds.length > 0
          ? { [activeUniverseId]: enabledModuleIds }
          : {}),
      };
      set({
        manifests,
        guiLocales: { en: guiEn },
        activeUniverseId,
        baseBundle,
        enabledModules: resolvedEnabledModules,
        localePreference,
        ...previewState,
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'error.universeLoadFailed',
        loading: false,
      });
    }
  },

  setActiveUniverse: async (universeId) => {
    set({ activeUniverseId: universeId, loading: true, error: null });

    try {
      await useContributionState.getState().hydrate(universeId);
      const [bundledManifests, localLibrary] = await Promise.all([
        listBundledUniverses(),
        loadLocalUniverseLibrary(),
      ]);
      const baseBundle = await loadBaseBundle(universeId, bundledManifests, localLibrary);
      const preview = applyModulesAndDraft(baseBundle, get().enabledModules, get().localePreference);
      const { enabledModuleIds, ...previewState } = preview;
      const enabledModules = {
        ...get().enabledModules,
        ...(get().enabledModules[universeId] !== undefined || enabledModuleIds.length > 0
          ? { [universeId]: enabledModuleIds }
          : {}),
      };
      set({
        baseBundle,
        enabledModules,
        ...previewState,
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'error.universeLoadFailed',
        loading: false,
      });
    }
  },

  setLocalePreference: async (locale) => {
    await save(localePreferenceKey, locale);
    const preview = applyModulesAndDraft(get().baseBundle, get().enabledModules, locale);
    const { enabledModuleIds: _enabledModuleIds, ...previewState } = preview;
    set({ localePreference: locale, ...previewState });
  },

  setEnabledModules: async (universeId, moduleIds) => {
    const requestedEnabledModules = {
      ...get().enabledModules,
      [universeId]: moduleIds,
    };
    const preview = get().baseBundle?.manifest.id === universeId
      ? applyModulesAndDraft(get().baseBundle, requestedEnabledModules, get().localePreference)
      : null;
    const enabledModules = preview
      ? {
          ...requestedEnabledModules,
          [universeId]: preview.enabledModuleIds,
        }
      : requestedEnabledModules;
    await save(moduleSettingsKey, enabledModules);
    const previewState = preview
      ? (({ enabledModuleIds: _enabledModuleIds, ...state }) => state)(preview)
      : null;
    const nextBundle = preview?.bundle ?? null;
    const startingLocationId = nextBundle?.locations.find((location) => location.starting)?.id ?? nextBundle?.locations[0]?.id ?? '';
    const moduleCleanupReport = nextBundle && startingLocationId
      ? useGameState.getState().sanitizeForBundle(universeId, nextBundle, startingLocationId)
      : null;
    set({ enabledModules, ...(previewState ?? {}) });
    if (moduleCleanupReport) set({ moduleCleanupReport });
  },

  clearModuleCleanupReport: () => set({ moduleCleanupReport: null }),

  importLocalUniverse: async (bundle) => {
    const normalizedBundle = normalizeContentBundle(migrateMonolithicBundleToCoreModule(bundle));
    const moduleResolution = applyModulesToBundle(normalizedBundle, normalizedBundle.modules ?? []);
    const validationIssues = [...moduleResolution.issues, ...validateContentBundle(moduleResolution.bundle)];
    const hasErrors = validationIssues.some((issue) => issue.severity === 'error');

    if (hasErrors) {
      set({ validationIssues, error: 'error.importedUniverseInvalid' });
      return;
    }

    await saveLocalUniverseBundle(normalizedBundle);
    const [bundledManifests, localLibrary] = await Promise.all([
      listBundledUniverses(),
      loadLocalUniverseLibrary(),
    ]);
    set({
      manifests: mergeManifests(bundledManifests, localLibrary),
      error: null,
    });
    await get().setActiveUniverse(normalizedBundle.manifest.id);
  },

  removeLocalUniverse: async (universeId) => {
    await removeLocalUniverseBundle(universeId);
    const [bundledManifests, localLibrary] = await Promise.all([
      listBundledUniverses(),
      loadLocalUniverseLibrary(),
    ]);
    const manifests = mergeManifests(bundledManifests, localLibrary);
    set({ manifests });

    if (get().activeUniverseId === universeId) {
      await get().setActiveUniverse('base');
    }
  },

  refreshContributionPreview: () => {
    const preview = applyModulesAndDraft(get().baseBundle, get().enabledModules, get().localePreference);
    const { enabledModuleIds, ...previewState } = preview;
    const universeId = get().baseBundle?.manifest.id;
    const enabledModules = universeId
      ? {
          ...get().enabledModules,
          ...(get().enabledModules[universeId] !== undefined || enabledModuleIds.length > 0
            ? { [universeId]: enabledModuleIds }
            : {}),
        }
      : get().enabledModules;
    set({ enabledModules, ...previewState });
  },

  t: (key, fallbackOrParams, params) => {
    const bundle = get().bundle;
    const locale = bundle ? resolveLocale(bundle, get().localePreference) : 'en';
    const fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : undefined;
    const interpolation = typeof fallbackOrParams === 'object' ? fallbackOrParams : params;
    const guiLocales = get().guiLocales;
    const value = bundle?.locales[locale]?.[key] ?? guiLocales[locale]?.[key] ?? guiLocales.en?.[key] ?? fallback ?? key;
    return formatText(value, interpolation);
  },
}));
