import { create } from 'zustand';
import type { ContentBundle, UniverseManifest, ValidationIssue } from '../game/types';
import { normalizeEnemyDefinition } from '../game/enemies';
import { normalizeGameAction } from '../game/actions';
import {
  listBundledUniverses,
  loadLocalUniverseLibrary,
  loadUniverse,
  removeLocalUniverseBundle,
  saveLocalUniverseBundle,
} from '../game/loader';
import { mergeDraftIntoBundle, validateContentBundle } from '../game/validators';
import { load, save } from '../lib/storage';
import { useContributionState } from './contributionState';

export type LocalePreference = 'system' | string;

type UniverseStateStore = {
  activeUniverseId: string;
  manifests: UniverseManifest[];
  guiLocales: Record<string, Record<string, string>>;
  baseBundle: ContentBundle | null;
  bundle: ContentBundle | null;
  validationIssues: ValidationIssue[];
  localePreference: LocalePreference;
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  setActiveUniverse: (universeId: string) => Promise<void>;
  setLocalePreference: (locale: LocalePreference) => Promise<void>;
  importLocalUniverse: (bundle: ContentBundle) => Promise<void>;
  removeLocalUniverse: (universeId: string) => Promise<void>;
  refreshContributionPreview: () => void;
  t: (key: string, fallbackOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => string;
};

const localePreferenceKey = 'universalis:settings:locale';
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

const applyDraft = (bundle: ContentBundle | null) => {
  if (!bundle) {
    return {
      bundle: null,
      validationIssues: [],
    };
  }

  const draft = useContributionState.getState().getDraft(bundle.manifest.id);
  const merged = mergeDraftIntoBundle(bundle, draft);

  return {
    bundle: merged,
    validationIssues: validateContentBundle(merged),
  };
};

const normalizeContentBundle = (bundle: ContentBundle): ContentBundle => ({
  ...bundle,
  actions: bundle.actions.map(normalizeGameAction),
  items: bundle.items ?? [],
  flags: bundle.flags ?? [],
  resourceDefinitions: bundle.resourceDefinitions ?? [],
  stats: bundle.stats ?? [],
  effects: bundle.effects ?? [],
  interactionTypes: bundle.interactionTypes ?? [],
  enemies: (bundle.enemies ?? []).map((enemy) => normalizeEnemyDefinition(enemy)),
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
  localePreference: 'system',
  loading: false,
  error: null,

  initialize: async () => {
    set({ loading: true, error: null });

    try {
      const [bundledManifests, localLibrary, savedLocalePreference, guiEn] = await Promise.all([
        listBundledUniverses(),
        loadLocalUniverseLibrary(),
        load<LocalePreference>(localePreferenceKey),
        loadGuiLocale('en'),
      ]);
      const manifests = mergeManifests(bundledManifests, localLibrary);
      const activeUniverseId = get().activeUniverseId;
      await useContributionState.getState().hydrate(activeUniverseId);
      const baseBundle = await loadBaseBundle(activeUniverseId, bundledManifests, localLibrary);
      const preview = applyDraft(baseBundle);
      set({
        manifests,
        guiLocales: { en: guiEn },
        activeUniverseId,
        baseBundle,
        localePreference: savedLocalePreference ?? 'system',
        ...preview,
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
      const preview = applyDraft(baseBundle);
      set({
        baseBundle,
        ...preview,
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
    set({ localePreference: locale });
  },

  importLocalUniverse: async (bundle) => {
    const normalizedBundle = normalizeContentBundle(bundle);
    const validationIssues = validateContentBundle(normalizedBundle);
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
    const preview = applyDraft(get().baseBundle);
    set(preview);
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
