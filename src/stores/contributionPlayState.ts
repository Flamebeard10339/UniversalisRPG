import { create } from 'zustand';
import type { UniversePlayState } from '../game/types';
import { load, save } from '../lib/storage';

export type ContributionStateProfile = {
  id: string;
  name: string;
  state: UniversePlayState;
  updatedAt: number;
};

type ContributionPlayStateStore = {
  profiles: Record<string, ContributionStateProfile[]>;
  hydrate: (universeId: string) => Promise<void>;
  saveProfile: (universeId: string, name: string, state: UniversePlayState) => void;
  deleteProfile: (universeId: string, profileId: string) => void;
};

const storageKey = (universeId: string) => `universalis:contribution-play-profiles:${universeId}`;

export const contributionRuntimeId = (universeId: string) => `contribution:${universeId}`;

export const useContributionPlayState = create<ContributionPlayStateStore>((set) => ({
  profiles: {},

  hydrate: async (universeId) => {
    const profiles = await load<ContributionStateProfile[]>(storageKey(universeId));
    set((state) => ({ profiles: { ...state.profiles, [universeId]: profiles ?? [] } }));
  },

  saveProfile: (universeId, name, playState) => {
    set((state) => {
      const profiles = state.profiles[universeId] ?? [];
      const existing = profiles.find((profile) => profile.name.toLowerCase() === name.trim().toLowerCase());
      const profile: ContributionStateProfile = {
        id: existing?.id ?? `profile-${Date.now().toString(36)}`,
        name: name.trim(),
        state: structuredClone(playState),
        updatedAt: Date.now(),
      };
      const next = existing
        ? profiles.map((candidate) => candidate.id === existing.id ? profile : candidate)
        : [profile, ...profiles];
      void save(storageKey(universeId), next);
      return { profiles: { ...state.profiles, [universeId]: next } };
    });
  },

  deleteProfile: (universeId, profileId) => {
    set((state) => {
      const next = (state.profiles[universeId] ?? []).filter((profile) => profile.id !== profileId);
      void save(storageKey(universeId), next);
      return { profiles: { ...state.profiles, [universeId]: next } };
    });
  },
}));
