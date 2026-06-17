import { create } from 'zustand';
import type { ContentBundle, UniverseManifest, ValidationIssue } from '../game/types';
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
  t: (key: string, fallback?: string) => string;
};

const localePreferenceKey = 'universalis:settings:locale';

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

export const useUniverseState = create<UniverseStateStore>((set, get) => ({
  activeUniverseId: 'base',
  manifests: [],
  baseBundle: null,
  bundle: null,
  validationIssues: [],
  localePreference: 'system',
  loading: false,
  error: null,

  initialize: async () => {
    set({ loading: true, error: null });

    try {
      const [bundledManifests, localLibrary, savedLocalePreference] = await Promise.all([
        listBundledUniverses(),
        loadLocalUniverseLibrary(),
        load<LocalePreference>(localePreferenceKey),
      ]);
      const manifests = [...bundledManifests, ...Object.values(localLibrary).map((bundle) => bundle.manifest)];
      const activeUniverseId = get().activeUniverseId;
      await useContributionState.getState().hydrate(activeUniverseId);
      const baseBundle = localLibrary[activeUniverseId] ?? (await loadUniverse(activeUniverseId));
      const preview = applyDraft(baseBundle);
      set({
        manifests,
        activeUniverseId,
        baseBundle,
        localePreference: savedLocalePreference ?? 'system',
        ...preview,
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to load universe.',
        loading: false,
      });
    }
  },

  setActiveUniverse: async (universeId) => {
    set({ activeUniverseId: universeId, loading: true, error: null });

    try {
      await useContributionState.getState().hydrate(universeId);
      const localLibrary = await loadLocalUniverseLibrary();
      const baseBundle = localLibrary[universeId] ?? (await loadUniverse(universeId));
      const preview = applyDraft(baseBundle);
      set({
        baseBundle,
        ...preview,
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to load universe.',
        loading: false,
      });
    }
  },

  setLocalePreference: async (locale) => {
    await save(localePreferenceKey, locale);
    set({ localePreference: locale });
  },

  importLocalUniverse: async (bundle) => {
    const validationIssues = validateContentBundle(bundle);
    const hasErrors = validationIssues.some((issue) => issue.severity === 'error');

    if (hasErrors) {
      set({ validationIssues, error: 'Imported universe has validation errors.' });
      return;
    }

    await saveLocalUniverseBundle(bundle);
    const [bundledManifests, localLibrary] = await Promise.all([
      listBundledUniverses(),
      loadLocalUniverseLibrary(),
    ]);
    set({
      manifests: [...bundledManifests, ...Object.values(localLibrary).map((localBundle) => localBundle.manifest)],
      error: null,
    });
    await get().setActiveUniverse(bundle.manifest.id);
  },

  removeLocalUniverse: async (universeId) => {
    await removeLocalUniverseBundle(universeId);
    const [bundledManifests, localLibrary] = await Promise.all([
      listBundledUniverses(),
      loadLocalUniverseLibrary(),
    ]);
    const manifests = [...bundledManifests, ...Object.values(localLibrary).map((bundle) => bundle.manifest)];
    set({ manifests });

    if (get().activeUniverseId === universeId) {
      await get().setActiveUniverse('base');
    }
  },

  refreshContributionPreview: () => {
    const preview = applyDraft(get().baseBundle);
    set(preview);
  },

  t: (key, fallback) => {
    const bundle = get().bundle;
    const locale = bundle ? resolveLocale(bundle, get().localePreference) : 'en';
    return bundle?.locales[locale]?.[key] ?? fallback ?? key;
  },
}));
