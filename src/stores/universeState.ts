import { create } from 'zustand';
import type { ContentBundle, ContributionDraft, UniverseManifest, ValidationIssue } from '../game/types';
import { applyModulesToBundle } from '../game/contentModules';
import { normalizeContentBundleStructure } from '../game/contentNormalization';
import {
  listBundledUniverses,
  loadLocalUniverseLibrary,
  loadUniverse,
  removeLocalUniverseBundle,
  saveLocalUniverseBundle,
} from '../game/loader';
import { mergeDraftModulesIntoBundle, mergeValidDraftIntoBundle, validateContentBundle } from '../game/validators';
import { load, save } from '../lib/storage';
import { useContributionState } from './contributionState';
import { useDslEditorState } from './dslEditorState';
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

const isProtectedCoreModule = (moduleId: string) => moduleId === 'base-core';

const protectedCoreModuleIds = (bundle: ContentBundle) =>
  (bundle.modules ?? []).filter((module) => isProtectedCoreModule(module.id)).map((module) => module.id);

const enabledWithProtectedCore = (baseBundle: ContentBundle, enabledModules: Record<string, string[]>) => {
  const protectedIds = protectedCoreModuleIds(baseBundle);
  const requested = enabledModules[baseBundle.manifest.id];
  if (requested === undefined) return undefined;
  return Array.from(new Set([...protectedIds, ...requested]));
};

const resolveDraftModules = (
  bundle: ContentBundle,
  draft: ContributionDraft | null,
  enabledModules: Record<string, string[]>,
  localePreference: LocalePreference,
) => {
  const bundleWithDraftModules = mergeDraftModulesIntoBundle(bundle, draft);
  return applyModulesToBundle(
    bundleWithDraftModules,
    bundleWithDraftModules.modules ?? [],
    enabledWithProtectedCore(bundle, enabledModules),
    resolveLocale(bundleWithDraftModules, localePreference),
  );
};

// A module id shows up here whenever it's disabled at all — including a
// pre-existing/unrelated disablement this specific draft had nothing to do
// with. That's fine: markPlayable only ever advances forward on a *clean*
// resolution, so there's nothing to fall back to for a module that's never
// resolved cleanly this session, and the substitution below is a no-op for
// it (nothing worse than today).
const disabledModuleIds = (issues: ValidationIssue[]): Set<string> =>
  new Set(
    issues
      .filter((issue) => issue.message === 'validation.moduleDisabled' || issue.message === 'validation.moduleConflictDisabled')
      .map((issue) => issue.path.match(/modules\.([^.]+)$/)?.[1])
      .filter((id): id is string => Boolean(id)),
  );

// A DSL edit that compiles cleanly can still trip a semantic
// module-conflict-disable cascade (e.g. the flag-scoping bug this guards
// against — see compiler.test.ts's "pack-scopes a bare # flags
// declaration..." case) — compileDsl alone can't see that, since it only
// knows about the module in isolation, not how it merges with everything
// else. Left unguarded, that cascade can drop the player's current
// location out of the bundle entirely and strand the whole app on a
// Settings-only view with no way back short of clearing storage — worse,
// the broken draft persists across reloads, so simply reloading doesn't
// help either. If the draft-as-authored resolution disables a module that
// has a last-known-playable version, use that version for the *live*
// bundle instead, while still surfacing the draft-as-authored issues (not
// the fallback's) so the editor keeps showing the real problem.
// Exported for universeState.test.ts's direct coverage of the fallback
// behavior; not otherwise used outside this module.
export const applyModulesAndDraft = (bundle: ContentBundle | null, enabledModules: Record<string, string[]>, localePreference: LocalePreference) => {
  if (!bundle) {
    return {
      bundle: null,
      enabledModuleIds: [],
      validationIssues: [],
    };
  }

  const draft = useContributionState.getState().getDraft(bundle.manifest.id);
  const draftModules = draft?.modules ?? [];
  const attempted = resolveDraftModules(bundle, draft, enabledModules, localePreference);
  const disabled = disabledModuleIds(attempted.issues);
  const brokenDraftModules = draftModules.filter((module) => disabled.has(module.id));

  let moduleResolution = attempted;

  if (brokenDraftModules.length > 0) {
    const fallbackModules = draftModules.map((module) => (disabled.has(module.id)
      ? useDslEditorState.getState().getDraft(module.id)?.lastPlayableModule ?? module
      : module));
    moduleResolution = resolveDraftModules(bundle, { ...(draft as ContributionDraft), modules: fallbackModules }, enabledModules, localePreference);
  } else {
    for (const module of draftModules) {
      useDslEditorState.getState().markPlayable(module.id, module);
    }
  }

  const draftMerge = mergeValidDraftIntoBundle(moduleResolution.bundle, draft);
  const merged = normalizeContentBundleStructure(draftMerge.bundle);

  return {
    bundle: merged,
    enabledModuleIds: moduleResolution.enabledModuleIds,
    validationIssues: [...attempted.issues, ...draftMerge.issues, ...validateContentBundle(merged)],
  };
};

const normalizeContentBundle = (bundle: ContentBundle): ContentBundle => {
  const normalized = normalizeContentBundleStructure(bundle);
  return {
    ...normalized,
    entities: normalized.entities ?? [],
    items: normalized.items ?? [],
    flags: normalized.flags ?? [],
    resourceDefinitions: normalized.resourceDefinitions ?? [],
    stats: normalized.stats ?? [],
    effects: normalized.effects ?? [],
    interactionTypes: normalized.interactionTypes ?? [],
    enemies: normalized.enemies ?? [],
    dialogues: normalized.dialogues ?? [],
  };
};

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
