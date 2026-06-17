import { create } from 'zustand';
import type { GameAction, UniversePlayState } from '../game/types';
import { advanceTick, createInitialPlayState, startAction } from '../game/tick';
import { load, save } from '../lib/storage';

type GameStateStore = {
  states: Record<string, UniversePlayState>;
  hydrate: (universeId: string, startingLocationId: string) => Promise<void>;
  getUniverseState: (universeId: string, startingLocationId: string) => UniversePlayState;
  setCurrentLocation: (universeId: string, locationId: string) => void;
  startAction: (universeId: string, action: GameAction) => void;
  tick: (universeId: string, actions: GameAction[]) => void;
};

const storageKey = (universeId: string) => `universalis:play:${universeId}`;

export const useGameState = create<GameStateStore>((set, get) => ({
  states: {},

  hydrate: async (universeId, startingLocationId) => {
    const saved = await load<UniversePlayState>(storageKey(universeId));
    const nextState = saved ?? createInitialPlayState(universeId, startingLocationId);

    set((state) => ({
      states: {
        ...state.states,
        [universeId]: nextState,
      },
    }));
  },

  getUniverseState: (universeId, startingLocationId) =>
    get().states[universeId] ?? createInitialPlayState(universeId, startingLocationId),

  setCurrentLocation: (universeId, locationId) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current) {
        return state;
      }

      const discoveredLocationIds = current.discoveredLocationIds.includes(locationId)
        ? current.discoveredLocationIds
        : [...current.discoveredLocationIds, locationId];
      const next = {
        ...current,
        currentLocationId: locationId,
        discoveredLocationIds,
      };

      void save(storageKey(universeId), next);

      return {
        states: {
          ...state.states,
          [universeId]: next,
        },
      };
    });
  },

  startAction: (universeId, action) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current || current.activeAction) {
        return state;
      }

      const next = startAction(current, action);
      void save(storageKey(universeId), next);

      return {
        states: {
          ...state.states,
          [universeId]: next,
        },
      };
    });
  },

  tick: (universeId, actions) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current) {
        return state;
      }

      const next = advanceTick(current, actions);
      void save(storageKey(universeId), next);

      return {
        states: {
          ...state.states,
          [universeId]: next,
        },
      };
    });
  },
}));
