import { create } from 'zustand';
import type { ActionResolutionContext, ContentBundle, EquipmentSlot, GameAction, IdleReport, RunLogEntry, UniversePlayState } from '../game/types';
import type { AvailableTravelEdge } from '../game/travel';
import { appendChatMessage, appendRunLog, cancelDialogue, chooseDialogueOption, createInitialPlayState, depositToBank, normalizePlayState, resetInactiveEffectResources, resolveIdleTimers, setAppearancePreset, startAction, startTravel, withdrawFromBank } from '../game/timers';
import { equipItem, unequipSlot } from '../game/equipment';
import { load, remove, save } from '../lib/storage';
import { recordAgentSessionMessage, type AgentSessionMessage } from '../game/agentSession';
import { hasModuleCleanupChanges, sanitizePlayStateForBundle, type ModuleCleanupReport } from '../game/moduleCleanup';

type GameStateStore = {
  states: Record<string, UniversePlayState>;
  hydrate: (universeId: string, startingLocationId: string, context?: Pick<ActionResolutionContext, 'manifest'>) => Promise<void>;
  getUniverseState: (universeId: string, startingLocationId: string, context?: Pick<ActionResolutionContext, 'manifest'>) => UniversePlayState;
  setCurrentLocation: (universeId: string, locationId: string) => void;
  travelTo: (universeId: string, path: AvailableTravelEdge[]) => void;
  cancelTravel: (universeId: string) => void;
  startAction: (universeId: string, action: GameAction, context: ActionResolutionContext, recipeId?: string) => void;
  stopAction: (universeId: string, context: ActionResolutionContext) => void;
  chooseDialogueOption: (universeId: string, context: ActionResolutionContext, optionId?: string) => void;
  cancelDialogue: (universeId: string) => void;
  resolveIdle: (universeId: string, context: ActionResolutionContext, options?: { debugEnabled?: boolean; showReport?: boolean }) => IdleReport;
  setActionLooping: (universeId: string, enabled: boolean) => void;
  equipItem: (universeId: string, itemId: string, slot: EquipmentSlot, context: ActionResolutionContext) => void;
  unequipSlot: (universeId: string, slot: EquipmentSlot) => void;
  depositToBank: (universeId: string, context: ActionResolutionContext, itemId: string, amount: number) => void;
  withdrawFromBank: (universeId: string, context: ActionResolutionContext, itemId: string, amount: number) => void;
  setAppearance: (universeId: string, presetId: string) => void;
  markInactive: (universeId: string) => void;
  sendChatMessage: (universeId: string, text: string) => void;
  appendSystemMessage: (universeId: string, key: string, params?: Record<string, string | number>) => void;
  recordRunEvent: (universeId: string, actor: RunLogEntry['actor'], event: string, data?: Record<string, unknown>) => void;
  recordAgentMessage: (universeId: string, message: AgentSessionMessage) => void;
  clearRunLog: (universeId: string) => void;
  sanitizeForBundle: (universeId: string, bundle: ContentBundle, startingLocationId: string) => ModuleCleanupReport | null;
  importUniverseState: (playState: UniversePlayState) => Promise<void>;
  replaceUniverseState: (universeId: string, playState: UniversePlayState) => Promise<void>;
  resetUniverse: (universeId: string, startingLocationId: string, context?: Pick<ActionResolutionContext, 'manifest'>) => Promise<void>;
};

const storageKey = (universeId: string) => `universalis:play:${universeId}`;
const noIdleReport = (): IdleReport => ({ kind: 'none' });

export const useGameState = create<GameStateStore>((set, get) => ({
  states: {},

  hydrate: async (universeId, startingLocationId, context) => {
    const saved = await load<UniversePlayState>(storageKey(universeId));
    const nextState = saved
      ? normalizePlayState(saved, universeId, startingLocationId, context)
      : createInitialPlayState(universeId, startingLocationId, context);

    set((state) => ({
      states: {
        ...state.states,
        [universeId]: nextState,
      },
    }));
  },

  getUniverseState: (universeId, startingLocationId, context) =>
    get().states[universeId] ?? createInitialPlayState(universeId, startingLocationId, context),

  setCurrentLocation: (universeId, locationId) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current) {
        return state;
      }

      const discoveredLocationIds = current.discoveredLocationIds.includes(locationId)
        ? current.discoveredLocationIds
        : [...current.discoveredLocationIds, locationId];
      const next = cancelDialogue({
        ...current,
        currentLocationId: locationId,
        discoveredLocationIds,
        collectionLog: {
          ...current.collectionLog,
          [`location:${locationId}:explored`]: 1,
        },
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

  travelTo: (universeId, path) => {
    set((state) => {
      const current = state.states[universeId];
      const destinationLocationId = path[path.length - 1]?.target;

      if (!current || !destinationLocationId || current.activeTravel || current.currentLocationId === destinationLocationId) {
        return state;
      }

      const next = startTravel(cancelDialogue(current), path);
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

  startAction: (universeId, action, context, recipeId) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current || current.activeTravel) {
        return state;
      }

      const now = Date.now();
      const resolved = cancelDialogue(resolveIdleTimers(current, context, {}, now).state, now);
      const next = startAction(resolved, action, context, now, { recipeId });
      void save(storageKey(universeId), next);

      return {
        states: {
          ...state.states,
          [universeId]: next,
        },
      };
    });
  },

  chooseDialogueOption: (universeId, context, optionId) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current?.activeDialogue) return state;
      const next = chooseDialogueOption(current, context, optionId);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  cancelDialogue: (universeId) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current?.activeDialogue) return state;
      const next = cancelDialogue(current);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  stopAction: (universeId, context) => {
    set((state) => {
      const current = state.states[universeId];

      if (!current?.activeAction) {
        return state;
      }

      const now = Date.now();
      const resolved = resolveIdleTimers(current, context, {}, now).state;
      if (!resolved.activeAction) {
        void save(storageKey(universeId), resolved);
        return { states: { ...state.states, [universeId]: resolved } };
      }
      const actionId = resolved.activeAction.actionId;
      const progress = resolved.actionProgress[actionId] ?? { elapsedMs: 0, runningSince: resolved.activeAction.startedAt };
      const next = resetInactiveEffectResources({
        ...resolved,
        activeAction: null,
        actionProgress: {
          ...resolved.actionProgress,
          [actionId]: {
            ...progress,
            elapsedMs: progress.elapsedMs + Math.max(0, now - (progress.runningSince ?? resolved.activeAction.startedAt)),
            runningSince: null,
            targetHealth: resolved.activeAction.targetHealth ?? progress.targetHealth ?? null,
          },
        },
        lastTickAt: now,
      }, context, now);
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

  equipItem: (universeId, itemId, slot, context) => {
    set((state) => {
      const current = state.states[universeId];
      const item = context.items?.find((candidate) => candidate.id === itemId);
      if (!current || !item) return state;
      const next = equipItem(current, item, slot, context.skills, context.manifest?.experienceCurve);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  unequipSlot: (universeId, slot) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current?.equipment?.[slot]) return state;
      const next = unequipSlot(current, slot);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  depositToBank: (universeId, context, itemId, amount) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = depositToBank(current, context, itemId, amount);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  withdrawFromBank: (universeId, context, itemId, amount) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = withdrawFromBank(current, context, itemId, amount);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  setAppearance: (universeId, presetId) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = setAppearancePreset(current, presetId);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
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

  appendSystemMessage: (universeId, key, params) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = appendChatMessage(current, { author: 'system', key, params });
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
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

  sanitizeForBundle: (universeId, bundle, startingLocationId) => {
    let report: ModuleCleanupReport | null = null;
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const sanitized = sanitizePlayStateForBundle(current, bundle, startingLocationId);
      if (!hasModuleCleanupChanges(sanitized.report)) return state;
      report = sanitized.report;
      void save(storageKey(universeId), sanitized.state);
      return { states: { ...state.states, [universeId]: sanitized.state } };
    });
    return report;
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

  replaceUniverseState: async (universeId, playState) => {
    const normalized = normalizePlayState({ ...playState, universeId }, universeId, playState.currentLocationId);
    await save(storageKey(universeId), normalized);
    set((state) => ({
      states: {
        ...state.states,
        [universeId]: normalized,
      },
    }));
  },

  resetUniverse: async (universeId, startingLocationId, context) => {
    const current = get().states[universeId];
    const initial = createInitialPlayState(universeId, startingLocationId, context);
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
