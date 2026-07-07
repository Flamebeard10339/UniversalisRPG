import { create } from 'zustand';
import type { ActionResolutionContext, ContentBundle, EquipmentSlot, GameAction, IdleReport, RunLogEntry, UniversePlayState } from '../game/types';
import type { AvailableTravelEdge } from '../game/travel';
import { appendChatMessage, appendRunLog, applyItemDelta, cancelDialogue, chooseDialogueOption, closeModal, createInitialPlayState, depositToBank, dropInventoryItem, eatItem, equipItem, normalizePlayState, pickUpGroundItem, resetInactiveEffectResources, resolveIdleTimers, setCharacterName, startAction, startTravel, unequipSlot, withdrawFromBank } from '../game/timers';
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
  resolveIdle: (universeId: string, context: ActionResolutionContext, options?: { debugEnabled?: boolean; showReport?: boolean }, now?: number) => IdleReport;
  setActionLooping: (universeId: string, enabled: boolean) => void;
  equipItem: (universeId: string, itemId: string, slot: EquipmentSlot, context: ActionResolutionContext) => void;
  unequipSlot: (universeId: string, slot: EquipmentSlot, context: ActionResolutionContext) => void;
  eatItem: (universeId: string, itemId: string, context: ActionResolutionContext) => void;
  dropInventoryItem: (universeId: string, itemId: string, context: ActionResolutionContext) => void;
  pickUpGroundItem: (universeId: string, groundItemId: string, context: ActionResolutionContext) => void;
  depositToBank: (universeId: string, context: ActionResolutionContext, itemId: string, amount: number) => void;
  withdrawFromBank: (universeId: string, context: ActionResolutionContext, itemId: string, amount: number) => void;
  setCharacterName: (universeId: string, name: string) => void;
  closeModal: (universeId: string) => void;
  markInactive: (universeId: string) => void;
  sendChatMessage: (universeId: string, text: string) => void;
  appendSystemMessage: (universeId: string, key: string, params?: Record<string, string | number>) => void;
  appendChatText: (universeId: string, text: string, author?: 'system' | 'player') => void;
  recordRunEvent: (universeId: string, actor: RunLogEntry['actor'], event: string, data?: Record<string, unknown>) => void;
  recordAgentMessage: (universeId: string, message: AgentSessionMessage) => void;
  clearRunLog: (universeId: string) => void;
  sanitizeForBundle: (universeId: string, bundle: ContentBundle, startingLocationId: string) => ModuleCleanupReport | null;
  importUniverseState: (playState: UniversePlayState) => Promise<void>;
  replaceUniverseState: (universeId: string, playState: UniversePlayState) => Promise<void>;
  resetUniverse: (universeId: string, startingLocationId: string, context?: Pick<ActionResolutionContext, 'manifest'>) => Promise<void>;
  // --- Dev-only mutators for src/game/testHarness.ts (window.__test). Bypass normal
  // gameplay validation on purpose; never called from production UI code paths. ---
  debugSetFlag: (universeId: string, flagId: string, value: boolean | number | string) => void;
  debugSetResource: (universeId: string, resourceId: string, current: number) => void;
  debugSetSkillXp: (universeId: string, skillId: string, xp: number) => void;
  debugSetInventoryItem: (universeId: string, itemId: string, amount: number) => void;
  debugGiveItem: (universeId: string, context: ActionResolutionContext, itemId: string, amount: number) => void;
  debugSetBankItem: (universeId: string, itemId: string, amount: number) => void;
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
      const resolved = closeModal(cancelDialogue(resolveIdleTimers(current, context, {}, now).state, now), now);
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

  resolveIdle: (universeId, context, options, now) => {
    let report = noIdleReport();

    set((state) => {
      const current = state.states[universeId];

      if (!current) {
        return state;
      }

      const resolved = resolveIdleTimers(current, context, options, now);
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
      const next = equipItem(current, item, slot, context);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  unequipSlot: (universeId, slot, context) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current?.equipment?.[slot]) return state;
      const next = unequipSlot(current, slot, context);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  eatItem: (universeId, itemId, context) => {
    set((state) => {
      const current = state.states[universeId];
      const item = context.items?.find((candidate) => candidate.id === itemId);
      if (!current || !item) return state;
      const next = eatItem(current, item);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  dropInventoryItem: (universeId, itemId, context) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = dropInventoryItem(current, context, itemId);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  pickUpGroundItem: (universeId, groundItemId, context) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = pickUpGroundItem(current, context, groundItemId);
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

  setCharacterName: (universeId, name) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = setCharacterName(current, name);
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  closeModal: (universeId) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current?.openModalId) return state;
      const next = closeModal(current);
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

  appendChatText: (universeId, text, author = 'system') => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = appendChatMessage(current, { author, text });
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
    set((state) => ({
      states: {
        ...state.states,
        [playState.universeId]: normalized,
      },
    }));
    await save(storageKey(playState.universeId), normalized);
  },

  replaceUniverseState: async (universeId, playState) => {
    const normalized = normalizePlayState({ ...playState, universeId }, universeId, playState.currentLocationId);
    set((state) => ({
      states: {
        ...state.states,
        [universeId]: normalized,
      },
    }));
    await save(storageKey(universeId), normalized);
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
    set((state) => ({
      states: {
        ...state.states,
        [universeId]: next,
      },
    }));
    await remove(storageKey(universeId));
    await save(storageKey(universeId), next);
  },

  debugSetFlag: (universeId, flagId, value) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const { [flagId]: _removedExpiration, ...flagExpirations } = current.flagExpirations;
      const next = {
        ...current,
        flags: { ...current.flags, [flagId]: value },
        flagExpirations,
        lastTickAt: Date.now(),
      };
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  debugSetResource: (universeId, resourceId, current: number) => {
    set((state) => {
      const universe = state.states[universeId];
      const pool = universe?.resourcePools[resourceId];
      if (!universe || !pool) return state;
      const next = {
        ...universe,
        resourcePools: {
          ...universe.resourcePools,
          [resourceId]: { ...pool, current: Math.max(pool.min, Math.min(pool.max, current)) },
        },
        lastTickAt: Date.now(),
      };
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  debugSetSkillXp: (universeId, skillId, xp) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = {
        ...current,
        skillXp: { ...current.skillXp, [skillId]: Math.max(0, xp) },
        lastTickAt: Date.now(),
      };
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  debugSetInventoryItem: (universeId, itemId, amount) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = {
        ...current,
        inventory: { ...current.inventory, [itemId]: Math.max(0, amount) },
        lastTickAt: Date.now(),
      };
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  debugGiveItem: (universeId, context, itemId, amount) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = { ...applyItemDelta(current, context, itemId, amount), lastTickAt: Date.now() };
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },

  debugSetBankItem: (universeId, itemId, amount) => {
    set((state) => {
      const current = state.states[universeId];
      if (!current) return state;
      const next = {
        ...current,
        bank: { ...current.bank, [itemId]: Math.max(0, amount) },
        lastTickAt: Date.now(),
      };
      void save(storageKey(universeId), next);
      return { states: { ...state.states, [universeId]: next } };
    });
  },
}));
