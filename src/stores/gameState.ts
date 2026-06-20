import { create } from 'zustand';
import type { ActionResolutionContext, GameAction, IdleReport, RunLogEntry, TravelEdgeDefinition, UniversePlayState } from '../game/types';
import { appendChatMessage, appendRunLog, createInitialPlayState, normalizePlayState, resolveIdleTimers, startAction, startTravel } from '../game/timers';
import { load, remove, save } from '../lib/storage';
import { recordAgentSessionMessage, type AgentSessionMessage } from '../game/agentSession';

type GameStateStore = {
  states: Record<string, UniversePlayState>;
  hydrate: (universeId: string, startingLocationId: string) => Promise<void>;
  getUniverseState: (universeId: string, startingLocationId: string) => UniversePlayState;
  setCurrentLocation: (universeId: string, locationId: string) => void;
  travelTo: (universeId: string, edge: TravelEdgeDefinition, destinationLocationId: string) => void;
  cancelTravel: (universeId: string) => void;
  startAction: (universeId: string, action: GameAction, context: ActionResolutionContext) => void;
  stopAction: (universeId: string) => void;
  resolveIdle: (universeId: string, context: ActionResolutionContext, options?: { debugEnabled?: boolean; showReport?: boolean }) => IdleReport;
  setActionLooping: (universeId: string, enabled: boolean) => void;
  markInactive: (universeId: string) => void;
  sendChatMessage: (universeId: string, text: string) => void;
  recordRunEvent: (universeId: string, actor: RunLogEntry['actor'], event: string, data?: Record<string, unknown>) => void;
  recordAgentMessage: (universeId: string, message: AgentSessionMessage) => void;
  clearRunLog: (universeId: string) => void;
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

  stopAction: (universeId) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current?.activeAction) {
        return state;
      }

      const now = Date.now();
      const actionId = current.activeAction.actionId;
      const progress = current.actionProgress[actionId] ?? { elapsedMs: 0, runningSince: current.activeAction.startedAt };
      const next = {
        ...current,
        activeAction: null,
        actionProgress: {
          ...current.actionProgress,
          [actionId]: {
            ...progress,
            elapsedMs: progress.elapsedMs + Math.max(0, now - (progress.runningSince ?? current.activeAction.startedAt)),
            runningSince: null,
            targetHealth: current.activeAction.targetHealth ?? progress.targetHealth ?? null,
            enemyAttackStartedAt: current.activeAction.enemyAttackStartedAt ?? progress.enemyAttackStartedAt ?? null,
            enemyAttackCompletesAt: current.activeAction.enemyAttackCompletesAt ?? progress.enemyAttackCompletesAt ?? null,
          },
        },
        lastTickAt: now,
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

  recordRunEvent: (universeId, actor, event, data) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = appendRunLog(current, actor, event, data);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  recordAgentMessage: (universeId, message) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = recordAgentSessionMessage(current, message);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  clearRunLog: (universeId) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = { ...current, runLog: [], nextRunLogSequence: 1 };
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  importUniverseState: async (playState) => {
    const normalized = normalizePlayState(playState, playState.universeId, playState.currentLocationId);
    await save(storageKey(playState.universeId), normalized);
    set((state) => ({
      states: {
        ...state.states,
        [playState.universeId]: normalized,
      },
    }));
  },

  resetUniverse: async (universeId, startingLocationId) => {
    const current = get().states[universeId];
    const initial = createInitialPlayState(universeId, startingLocationId);
    const next = current
      ? appendRunLog({
          ...initial,
          runLog: current.runLog,
          nextRunLogSequence: current.nextRunLogSequence,
        }, 'player', 'run.start', { reason: 'manual-reset', previousRunId: current.runId, startingLocationId })
      : initial;
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
