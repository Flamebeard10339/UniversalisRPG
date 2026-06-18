import { create } from 'zustand';
import type { ActionResolutionContext, GameAction, IdleReport, TravelEdgeDefinition, UniversePlayState } from '../game/types';
import { appendChatMessage, createInitialPlayState, normalizePlayState, resolveIdleTimers, startAction, startTravel } from '../game/timers';
import { load, remove, save } from '../lib/storage';

type GameStateStore = {
  states: Record<string, UniversePlayState>;
  hydrate: (universeId: string, startingLocationId: string) => Promise<void>;
  getUniverseState: (universeId: string, startingLocationId: string) => UniversePlayState;
  setCurrentLocation: (universeId: string, locationId: string) => void;
  travelTo: (universeId: string, edge: TravelEdgeDefinition, destinationLocationId: string) => void;
  cancelTravel: (universeId: string) => void;
  startAction: (universeId: string, action: GameAction, context: ActionResolutionContext) => void;
  resolveIdle: (universeId: string, context: ActionResolutionContext, options?: { debugEnabled?: boolean; showReport?: boolean }) => IdleReport;
  setActionLooping: (universeId: string, enabled: boolean) => void;
  markInactive: (universeId: string) => void;
  sendChatMessage: (universeId: string, text: string) => void;
  importUniverseState: (playState: UniversePlayState) => Promise<void>;
  resetUniverse: (universeId: string, startingLocationId: string) => Promise<void>;
};

const storageKey = (universeId: string) => `universalis:play:${universeId}`;
const noIdleReport = (): IdleReport => ({ kind: 'none' });

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

  startAction: (universeId, action, context) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current || current.activeTravel) {
        return state;
      }

      const next = startAction(current, action, context);
      void save(storageKey(universeId), next);

      return {
        states: {
          ...state.states,
          [universeId]: next,
        },
      };
    });
  },

  resolveIdle: (universeId, context, options) => {
    let report = noIdleReport();

    set((state) => {
      const current = state.states[universeId];

      if (!current) {
        return state;
      }

      const resolved = resolveIdleTimers(current, context, options);
      report = resolved.report;
      const next = resolved.state;
      void save(storageKey(universeId), next);

      return {
        states: {
          ...state.states,
          [universeId]: next,
        },
      };
    });

    return report;
  },

  setActionLooping: (universeId, enabled) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current) {
        return state;
      }

      const next = {
        ...current,
        actionLoopingEnabled: enabled,
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

  markInactive: (universeId) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current) {
        return state;
      }

      const next = {
        ...current,
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

  sendChatMessage: (universeId, text) => {
    set((state) => {
      const current = state.states[universeId];
      const trimmed = text.trim();

      if (!current || !trimmed) {
        return state;
      }

      const next = appendChatMessage(current, {
        author: 'player',
        text: trimmed,
      });
      void save(storageKey(universeId), next);

      return {
        states: {
          ...state.states,
          [universeId]: next,
        },
      };
    });
  },

  importUniverseState: async (playState) => {
    await save(storageKey(playState.universeId), playState);
    set((state) => ({
      states: {
        ...state.states,
        [playState.universeId]: playState,
      },
    }));
  },

  resetUniverse: async (universeId, startingLocationId) => {
    const next = createInitialPlayState(universeId, startingLocationId);
    await remove(storageKey(universeId));
    await save(storageKey(universeId), next);
    set((state) => ({
      states: {
        ...state.states,
        [universeId]: next,
      },
    }));
  },
}));
