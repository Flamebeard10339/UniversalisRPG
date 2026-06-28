import { create } from 'zustand';
import type { ContributionDraft } from '../game/types';
import { normalizeEnemyDefinition } from '../game/enemies';
import { normalizeGameAction } from '../game/actions';
import { load, save } from '../lib/storage';

type ContributionStateStore = {
  drafts: Record<string, ContributionDraft>;
  hydrate: (universeId: string) => Promise<void>;
  getDraft: (universeId: string) => ContributionDraft | null;
  updateDraft: (universeId: string, patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  resetDraft: (universeId: string) => void;
};

const storageKey = (universeId: string) => `universalis:contribution:${universeId}`;

const createEmptyDraft = (universeId: string): ContributionDraft => ({
  universeId,
  updatedAt: Date.now(),
  notes: '',
  basePlayer: undefined,
  combatBalance: undefined,
  ui: undefined,
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
  locales: {},
  removed: {
    locations: [],
    edges: [],
    actions: [],
    skills: [],
    stats: [],
    items: [],
    flags: [],
    resources: [],
    effects: [],
    interactionTypes: [],
    enemies: [],
  },
});

const normalizeDraft = (draft: ContributionDraft): ContributionDraft => ({
  ...createEmptyDraft(draft.universeId),
  ...draft,
  basePlayer: draft.basePlayer,
  combatBalance: draft.combatBalance,
  ui: draft.ui,
  actions: (draft.actions ?? []).map(normalizeGameAction),
  items: draft.items ?? [],
  flags: draft.flags ?? [],
  resourceDefinitions: draft.resourceDefinitions ?? [],
  stats: draft.stats ?? [],
  effects: draft.effects ?? [],
  interactionTypes: draft.interactionTypes ?? [],
  enemies: (draft.enemies ?? []).map((enemy) => normalizeEnemyDefinition(enemy)),
  removed: {
    ...createEmptyDraft(draft.universeId).removed,
    ...(draft.removed ?? {}),
  },
});

export const useContributionState = create<ContributionStateStore>((set, get) => ({
  drafts: {},

  hydrate: async (universeId) => {
    const saved = await load<ContributionDraft>(storageKey(universeId));

    if (!saved) {
      return;
    }

    set((state) => ({
      drafts: {
        ...state.drafts,
        [universeId]: normalizeDraft(saved),
      },
    }));
  },

  getDraft: (universeId) => get().drafts[universeId] ?? null,

  updateDraft: (universeId, patch) => {
    set((state) => {
      const draft = normalizeDraft(state.drafts[universeId] ?? createEmptyDraft(universeId));
      const next = {
        ...draft,
        ...patch,
        updatedAt: Date.now(),
      };

      void save(storageKey(universeId), next);

      return {
        drafts: {
          ...state.drafts,
          [universeId]: next,
        },
      };
    });
  },

  resetDraft: (universeId) => {
    set((state) => {
      const emptyDraft = createEmptyDraft(universeId);
      void save(storageKey(universeId), emptyDraft);
      return {
        drafts: {
          ...state.drafts,
          [universeId]: emptyDraft,
        },
      };
    });
  },
}));
