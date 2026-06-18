import type { ChatMessage, GameAction, TravelEdgeDefinition, UniversePlayState } from './types';
import { actionFailureKey, actionSuccessKey } from './contentIds';

const MAX_CHAT_MESSAGES = 80;

const sameMessage = (left: ChatMessage, right: ChatMessage) =>
  left.author === right.author &&
  left.key === right.key &&
  left.text === right.text &&
  JSON.stringify(left.params ?? {}) === JSON.stringify(right.params ?? {});

export const appendChatMessage = (
  state: UniversePlayState,
  message: Omit<ChatMessage, 'id' | 'count' | 'createdAt'>,
  now = Date.now(),
): UniversePlayState => {
  const nextMessage: ChatMessage = {
    ...message,
    id: now,
    count: 1,
    createdAt: now,
  };
  const messages = state.chatMessages ?? [];
  const lastMessage = messages[messages.length - 1];
  const nextMessages = lastMessage && sameMessage(lastMessage, nextMessage)
    ? [
        ...messages.slice(0, -1),
        {
          ...lastMessage,
          count: lastMessage.count + 1,
          createdAt: now,
        },
      ]
    : [...messages, nextMessage];

  return {
    ...state,
    chatMessages: nextMessages.slice(-MAX_CHAT_MESSAGES),
  };
};

export const createInitialPlayState = (universeId: string, startingLocationId: string): UniversePlayState => ({
  universeId,
  currentLocationId: startingLocationId,
  discoveredLocationIds: [startingLocationId],
  activeAction: null,
  actionProgress: {},
  activeTravel: null,
  resources: {},
  skillXp: {},
  chatMessages: [],
  lastTickAt: Date.now(),
});

export const normalizePlayState = (
  state: UniversePlayState,
  universeId: string,
  startingLocationId: string,
): UniversePlayState => {
  const actionProgress = state.actionProgress ?? {};

  return {
    ...createInitialPlayState(universeId, startingLocationId),
    ...state,
    activeAction: state.activeAction ?? null,
    actionProgress: state.activeAction && !actionProgress[state.activeAction.actionId]
      ? {
          ...actionProgress,
          [state.activeAction.actionId]: {
            elapsedMs: 0,
            runningSince: state.activeAction.startedAt,
          },
        }
      : actionProgress,
    activeTravel: state.activeTravel ?? null,
    chatMessages: state.chatMessages ?? [],
  };
};

const pauseRunningAction = (state: UniversePlayState, now: number) => {
  if (!state.activeAction) {
    return state;
  }

  const progress = state.actionProgress[state.activeAction.actionId] ?? { elapsedMs: 0, runningSince: state.activeAction.startedAt };
  return {
    ...state,
    activeAction: null,
    actionProgress: {
      ...state.actionProgress,
      [state.activeAction.actionId]: {
        elapsedMs: progress.elapsedMs + Math.max(0, now - (progress.runningSince ?? state.activeAction.startedAt)),
        runningSince: null,
      },
    },
    lastTickAt: now,
  };
};

export const startAction = (
  state: UniversePlayState,
  action: GameAction,
  now = Date.now(),
): UniversePlayState => {
  if (state.activeAction?.actionId === action.id) {
    return pauseRunningAction(state, now);
  }

  const pausedState = pauseRunningAction(state, now);
  const progress = pausedState.actionProgress[action.id] ?? { elapsedMs: 0, runningSince: null };
  const remainingMs = Math.max(0, action.durationSeconds * 1000 - progress.elapsedMs);

  return {
    ...pausedState,
    activeAction: {
      actionId: action.id,
      startedAt: now,
      completesAt: now + remainingMs,
    },
    actionProgress: {
      ...pausedState.actionProgress,
      [action.id]: {
        ...progress,
        runningSince: now,
      },
    },
    lastTickAt: now,
  };
};

export const startTravel = (
  state: UniversePlayState,
  edge: TravelEdgeDefinition,
  destinationLocationId: string,
  now = Date.now(),
): UniversePlayState => {
  const pausedState = pauseRunningAction(state, now);

  return {
    ...pausedState,
    activeTravel: {
      edgeId: edge.id,
      fromLocationId: state.currentLocationId,
      toLocationId: destinationLocationId,
      startedAt: now,
      completesAt: now + edge.travelTimeSeconds * 1000,
    },
    activeAction: null,
    lastTickAt: now,
  };
};

export const completeAction = (
  state: UniversePlayState,
  action: GameAction,
  now = Date.now(),
): UniversePlayState => {
  const resources = { ...state.resources };
  const skillXp = { ...state.skillXp };

  for (const reward of action.rewards) {
    if (reward.kind === 'resource') {
      resources[reward.resourceId] = (resources[reward.resourceId] ?? 0) + reward.amount;
    }
    if (reward.kind === 'skillXp') {
      skillXp[reward.skillId] = (skillXp[reward.skillId] ?? 0) + reward.amount;
    }
  }

  return {
    ...state,
    activeAction: null,
    actionProgress: {
      ...state.actionProgress,
      [action.id]: {
        elapsedMs: 0,
        runningSince: null,
      },
    },
    resources,
    skillXp,
    lastTickAt: now,
  };
};

const actionRequirementsMet = (state: UniversePlayState, action: GameAction) =>
  (action.requirements ?? []).every((requirement) => {
    if (requirement.kind === 'resource') {
      return (state.resources[requirement.resourceId] ?? 0) >= requirement.amount;
    }
    if (requirement.kind === 'skillLevel') {
      return skillLevelFromXp(state.skillXp[requirement.skillId] ?? 0) >= requirement.level;
    }
    return true;
  });

export const resolveDueTimers = (
  state: UniversePlayState,
  actions: GameAction[],
  options: { debugEnabled?: boolean } = {},
  now = Date.now(),
): UniversePlayState => {
  if (state.activeTravel && state.activeTravel.completesAt <= now) {
    const destinationLocationId = state.activeTravel.toLocationId;
    const discoveredLocationIds = state.discoveredLocationIds.includes(destinationLocationId)
      ? state.discoveredLocationIds
      : [...state.discoveredLocationIds, destinationLocationId];

    return {
      ...state,
      currentLocationId: destinationLocationId,
      discoveredLocationIds,
      activeTravel: null,
      lastTickAt: now,
    };
  }

  if (!state.activeAction || state.activeAction.completesAt > now) {
    return {
      ...state,
      lastTickAt: now,
    };
  }

  const action = actions.find((candidate) => candidate.id === state.activeAction?.actionId);

  if (!action) {
    const failed = appendChatMessage({
      ...state,
      activeAction: null,
      lastTickAt: now,
    }, {
      author: 'system',
      key: 'chat.actionFailure',
      params: { actionId: state.activeAction.actionId },
    }, now);

    return options.debugEnabled
      ? appendChatMessage(failed, {
          author: 'debug',
          key: 'chat.debug.actionCompletionFailed',
          params: { actionId: state.activeAction.actionId, now },
        }, now + 1)
      : failed;
  }

  if (!actionRequirementsMet(state, action)) {
    const failed = appendChatMessage({
      ...state,
      activeAction: null,
      lastTickAt: now,
    }, {
      author: 'system',
      key: actionFailureKey(action.id),
      params: { actionId: action.id },
    }, now);

    return options.debugEnabled
      ? appendChatMessage(failed, {
          author: 'debug',
          key: 'chat.debug.actionRequirementFailed',
          params: { actionId: action.id, now },
        }, now + 1)
      : failed;
  }

  const completed = appendChatMessage(completeAction(state, action, now), {
    author: 'system',
    key: actionSuccessKey(action.id),
    params: { actionId: action.id },
  }, now);

  return options.debugEnabled
    ? appendChatMessage(completed, {
        author: 'debug',
        key: 'chat.debug.actionCompleted',
        params: {
          actionId: action.id,
          rewardCount: action.rewards.length,
          now,
        },
      }, now + 1)
    : completed;
};

export const skillLevelFromXp = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 10)) + 1;
