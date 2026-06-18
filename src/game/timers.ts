import type { ActionResolutionContext, ChatMessage, GameAction, IdleReport, IdleResolution, Reward, TravelEdgeDefinition, UniversePlayState } from './types';
import { getActionDurationMs, getInteractionType, sampleAdversarialDamage } from './adversarial';
import { actionFailureKey, actionSuccessKey } from './contentIds';
import { skillLevelFromXp } from './skills';

const MAX_CHAT_MESSAGES = 80;
const MIN_REPORT_INACTIVE_MS = 1000;
const EMPTY_CONTEXT: ActionResolutionContext = {
  actions: [],
  skills: [],
  interactionTypes: [],
};

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
  equipmentSkillBonuses: {},
  actionLoopingEnabled: false,
  playerHealth: 100,
  playerMaxHealth: 100,
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
    activeAction: state.activeAction
      ? {
          ...state.activeAction,
          targetHealth: state.activeAction.targetHealth ?? null,
        }
      : null,
    actionProgress: state.activeAction && !actionProgress[state.activeAction.actionId]
      ? {
          ...actionProgress,
          [state.activeAction.actionId]: {
            elapsedMs: 0,
            runningSince: state.activeAction.startedAt,
            targetHealth: state.activeAction.targetHealth ?? null,
          },
        }
      : actionProgress,
    activeTravel: state.activeTravel ?? null,
    equipmentSkillBonuses: state.equipmentSkillBonuses ?? {},
    actionLoopingEnabled: state.actionLoopingEnabled ?? false,
    playerHealth: state.playerHealth ?? 100,
    playerMaxHealth: state.playerMaxHealth ?? 100,
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
        targetHealth: state.activeAction.targetHealth ?? progress.targetHealth ?? null,
      },
    },
    lastTickAt: now,
  };
};

export const startAction = (
  state: UniversePlayState,
  action: GameAction,
  contextOrNow: ActionResolutionContext | number = EMPTY_CONTEXT,
  maybeNow = Date.now(),
): UniversePlayState => {
  const context = typeof contextOrNow === 'number' ? EMPTY_CONTEXT : contextOrNow;
  const now = typeof contextOrNow === 'number' ? contextOrNow : maybeNow;

  if (state.activeAction?.actionId === action.id) {
    return pauseRunningAction(state, now);
  }

  const pausedState = pauseRunningAction(state, now);
  const progress = pausedState.actionProgress[action.id] ?? { elapsedMs: 0, runningSince: null };
  const durationMs = getActionDurationMs(pausedState, action, context);
  const remainingMs = Math.max(0, durationMs - progress.elapsedMs);

  return {
    ...pausedState,
    activeAction: {
      actionId: action.id,
      startedAt: now,
      completesAt: now + remainingMs,
      targetHealth: progress.targetHealth ?? action.health ?? null,
    },
    actionProgress: {
      ...pausedState.actionProgress,
      [action.id]: {
        ...progress,
        runningSince: now,
        targetHealth: progress.targetHealth ?? action.health ?? null,
      },
    },
    lastTickAt: now,
  };
};

const restartAction = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  now: number,
  targetHealth: number | null,
) => ({
  ...state,
  activeAction: {
    actionId: action.id,
    startedAt: now,
    completesAt: now + getActionDurationMs(state, action, context),
    targetHealth,
  },
  actionProgress: {
    ...state.actionProgress,
    [action.id]: {
      elapsedMs: 0,
      runningSince: now,
      targetHealth,
    },
  },
  lastTickAt: now,
});

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

type ActionCompletionResult = {
  state: UniversePlayState;
  finished: boolean;
  damage: number;
  remainingHealth: number | null;
};

const completeActionWithResult = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext = EMPTY_CONTEXT,
  options: { random?: () => number } = {},
  now = Date.now(),
): ActionCompletionResult => {
  let damage = 0;
  let remainingHealth: number | null = null;
  const interactionType = getInteractionType(action, context);

  if (interactionType && action.health) {
    const result = sampleAdversarialDamage(state, action, context, options.random);
    damage = result?.damage ?? 0;
    const targetHealth = Math.max(0, (state.activeAction?.targetHealth ?? action.health) - damage);
    remainingHealth = targetHealth;
    const nextPlayerHealth = interactionType.targetPlayerHealth && (action.rate ?? 0) > 0
      ? Math.max(0, state.playerHealth - (action.rate ?? 0))
      : state.playerHealth;

    if (targetHealth > 0) {
      return {
        state: restartAction({
          ...state,
          playerHealth: nextPlayerHealth,
        }, action, context, now, targetHealth),
        finished: false,
        damage,
        remainingHealth,
      };
    }

    state = {
      ...state,
      playerHealth: nextPlayerHealth,
    };
  }

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

  const completedState = {
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

  return {
    state: state.actionLoopingEnabled ? restartAction(completedState, action, context, now, action.health ?? null) : completedState,
    finished: true,
    damage,
    remainingHealth,
  };
};

export const completeAction = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext = EMPTY_CONTEXT,
  options: { random?: () => number } = {},
  now = Date.now(),
): UniversePlayState => completeActionWithResult(state, action, context, options, now).state;

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

const rewardLabelId = (reward: Reward) => (reward.kind === 'resource' ? reward.resourceId : reward.skillId);

const noIdleReport = (): IdleReport => ({ kind: 'none' });

const shouldReportIdle = (inactiveMs: number, showReport?: boolean) =>
  Boolean(showReport) && inactiveMs >= MIN_REPORT_INACTIVE_MS;

const appendIdleDebugMessage = (
  state: UniversePlayState,
  report: IdleReport,
  now: number,
) => report.kind === 'none'
  ? state
  : appendChatMessage(state, {
      author: 'debug',
      key: 'chat.debug.idleCatchUp',
      params: {
        kind: report.kind,
        inactiveSeconds: Math.floor(report.inactiveMs / 1000),
        now,
      },
    }, now + 2);

export const resolveIdleTimers = (
  state: UniversePlayState,
  contextOrActions: ActionResolutionContext | GameAction[],
  options: { debugEnabled?: boolean; showReport?: boolean; random?: () => number } = {},
  now = Date.now(),
): IdleResolution => {
  const context = Array.isArray(contextOrActions)
    ? { ...EMPTY_CONTEXT, actions: contextOrActions }
    : contextOrActions;
  const inactiveMs = Math.max(0, now - (state.lastTickAt ?? now));
  const reportEnabled = shouldReportIdle(inactiveMs, options.showReport);

  if (state.activeTravel && state.activeTravel.completesAt <= now) {
    const activeTravel = state.activeTravel;
    const destinationLocationId = state.activeTravel.toLocationId;
    const discoveredLocationIds = state.discoveredLocationIds.includes(destinationLocationId)
      ? state.discoveredLocationIds
      : [...state.discoveredLocationIds, destinationLocationId];
    const nextState = {
      ...state,
      currentLocationId: destinationLocationId,
      discoveredLocationIds,
      activeTravel: null,
      lastTickAt: now,
    };
    const report: IdleReport = reportEnabled
      ? {
          kind: 'travelCompleted',
          inactiveMs,
          fromLocationId: activeTravel.fromLocationId,
          toLocationId: activeTravel.toLocationId,
          completedAt: activeTravel.completesAt,
        }
      : noIdleReport();

    return {
      state: options.debugEnabled && report.kind !== 'none' ? appendIdleDebugMessage(nextState, report, now) : nextState,
      report,
    };
  }

  if (!state.activeAction || state.activeAction.completesAt > now) {
    const nextState = {
      ...state,
      lastTickAt: now,
    };
    let report: IdleReport = noIdleReport();

    if (reportEnabled && state.activeTravel) {
      report = {
        kind: 'inProgress',
        inactiveMs,
        timerKind: 'travel',
        fromLocationId: state.activeTravel.fromLocationId,
        toLocationId: state.activeTravel.toLocationId,
        remainingMs: Math.max(0, state.activeTravel.completesAt - now),
      };
    }

    if (reportEnabled && state.activeAction) {
      report = {
        kind: 'inProgress',
        inactiveMs,
        timerKind: 'action',
        actionId: state.activeAction.actionId,
        remainingMs: Math.max(0, state.activeAction.completesAt - now),
      };
    }

    return {
      state: options.debugEnabled && report.kind !== 'none' ? appendIdleDebugMessage(nextState, report, now) : nextState,
      report,
    };
  }

  const action = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);

  if (!action) {
    const actionId = state.activeAction.actionId;
    const failed = appendChatMessage({
      ...state,
      activeAction: null,
      lastTickAt: now,
    }, {
      author: 'system',
      key: 'chat.actionFailure',
      params: { actionId },
    }, now);
    const withDebug = options.debugEnabled
      ? appendChatMessage(failed, {
          author: 'debug',
          key: 'chat.debug.actionCompletionFailed',
          params: { actionId, now },
        }, now + 1)
      : failed;
    const report: IdleReport = reportEnabled
      ? {
          kind: 'actionFailed',
          inactiveMs,
          actionId,
          completedAt: state.activeAction.completesAt,
        }
      : noIdleReport();

    return {
      state: options.debugEnabled && report.kind !== 'none' ? appendIdleDebugMessage(withDebug, report, now) : withDebug,
      report,
    };
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
    const failedWithDebug = options.debugEnabled
      ? appendChatMessage(failed, {
          author: 'debug',
          key: 'chat.debug.actionRequirementFailed',
          params: { actionId: action.id, now },
        }, now + 1)
      : failed;
    const report: IdleReport = reportEnabled
      ? {
          kind: 'actionFailed',
          inactiveMs,
          actionId: action.id,
          completedAt: state.activeAction.completesAt,
        }
      : noIdleReport();

    return {
      state: options.debugEnabled && report.kind !== 'none' ? appendIdleDebugMessage(failedWithDebug, report, now) : failedWithDebug,
      report,
    };
  }

  const completion = completeActionWithResult(state, action, context, { random: options.random }, now);
  const completed = completion.finished
    ? appendChatMessage(completion.state, {
    author: 'system',
    key: actionSuccessKey(action.id),
    params: { actionId: action.id },
  }, now)
    : completion.state;
  const completedWithDebug = options.debugEnabled
    ? appendChatMessage(completed, {
        author: 'debug',
        key: 'chat.debug.actionCompleted',
        params: {
          actionId: action.id,
          rewardCount: action.rewards.length,
          damage: Math.round(completion.damage * 100) / 100,
          remainingHealth: Math.round((completion.remainingHealth ?? 0) * 100) / 100,
          now,
        },
      }, now + 1)
    : completed;
  const report: IdleReport = reportEnabled && completion.finished
    ? {
        kind: 'actionCompleted',
        inactiveMs,
        actionId: action.id,
        completedAt: state.activeAction.completesAt,
        rewards: action.rewards.map((reward) => ({
          ...reward,
          labelId: rewardLabelId(reward),
        })),
      }
    : noIdleReport();

  return {
    state: options.debugEnabled && report.kind !== 'none' ? appendIdleDebugMessage(completedWithDebug, report, now) : completedWithDebug,
    report,
  };
};

export const resolveDueTimers = (
  state: UniversePlayState,
  contextOrActions: ActionResolutionContext | GameAction[],
  options: { debugEnabled?: boolean } = {},
  now = Date.now(),
): UniversePlayState => {
  return resolveIdleTimers(state, contextOrActions, options, now).state;
};
