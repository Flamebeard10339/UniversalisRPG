import { create } from 'zustand';
import type { GameAction, TravelEdgeDefinition, UniversePlayState } from '../game/types';
import { createInitialPlayState, normalizePlayState, resolveDueTimers, startAction, startTravel } from '../game/timers';
import { load, save } from '../lib/storage';

type GameStateStore = {
  states: Record<string, UniversePlayState>;
  hydrate: (universeId: string, startingLocationId: string) => Promise<void>;
  getUniverseState: (universeId: string, startingLocationId: string) => UniversePlayState;
  setCurrentLocation: (universeId: string, locationId: string) => void;
  travelTo: (universeId: string, edge: TravelEdgeDefinition, destinationLocationId: string) => void;
  cancelTravel: (universeId: string) => void;
  startAction: (universeId: string, action: GameAction) => void;
  resolveDue: (universeId: string, actions: GameAction[]) => void;
};

const storageKey = (universeId: string) => `universalis:play:${universeId}`;

export const useGameState = create<GameStateStore>((set, get) => ({
  states: {},

  hydrate: async (universeId, startingLocationId) => {
    const saved = await load<UniversePlayState>(storageKey(universeId));
    const nextState = saved
      ? normalizePlayState(saved, universeId, startingLocationId)
      : createInitialPlayState(universeId, startingLocationId);

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

  travelTo: (universeId, edge, destinationLocationId) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current || current.activeTravel || current.currentLocationId === destinationLocationId) {
        return state;
      }

      const next = startTravel(current, edge, destinationLocationId);
      void save(storageKey(universeId), next);

      return {
        states: {
          ...state.states,
          [universeId]: next,
        },
      };
    });
  },

  cancelTravel: (universeId) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current?.activeTravel) {
        return state;
      }

      const next = {
        ...current,
        activeTravel: null,
        lastTickAt: Date.now(),
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

      if (!current || current.activeAction || current.activeTravel) {
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

  resolveDue: (universeId, actions) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current) {
        return state;
      }

      const next = resolveDueTimers(current, actions);
      if (next === current) {
        return state;
      }
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
