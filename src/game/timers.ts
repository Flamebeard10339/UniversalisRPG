import type { ActionResolutionContext, ChatMessage, GameAction, IdleReport, IdleResolution, Reward, TravelEdgeDefinition, UniversePlayState } from './types';
import { getActionDurationMs, getEnemy, getEnemyAttackDurationMs, sampleAdversarialDamage, sampleEnemyAttackDamage } from './adversarial';
import { actionKillKey, actionSuccessKey } from './contentIds';
import { skillLevelFromXp } from './skills';

const MAX_CHAT_MESSAGES = 80;
const MIN_REPORT_INACTIVE_MS = 1000;
const EMPTY_CONTEXT: ActionResolutionContext = {
  actions: [],
  skills: [],
  interactionTypes: [],
  enemies: [],
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
          enemyAttackStartedAt: state.activeAction.enemyAttackStartedAt ?? null,
          enemyAttackCompletesAt: state.activeAction.enemyAttackCompletesAt ?? null,
        }
      : null,
    actionProgress: state.activeAction && !actionProgress[state.activeAction.actionId]
      ? {
          ...actionProgress,
          [state.activeAction.actionId]: {
            elapsedMs: 0,
            runningSince: state.activeAction.startedAt,
            targetHealth: state.activeAction.targetHealth ?? null,
            enemyAttackStartedAt: state.activeAction.enemyAttackStartedAt ?? null,
            enemyAttackCompletesAt: state.activeAction.enemyAttackCompletesAt ?? null,
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
        enemyAttackStartedAt: state.activeAction.enemyAttackStartedAt ?? progress.enemyAttackStartedAt ?? null,
        enemyAttackCompletesAt: state.activeAction.enemyAttackCompletesAt ?? progress.enemyAttackCompletesAt ?? null,
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
  const enemy = getEnemy(action, context);
  const enemyAttackDurationMs = getEnemyAttackDurationMs(enemy);
  const enemyAttackStartedAt = progress.enemyAttackStartedAt ?? (enemyAttackDurationMs ? now : null);
  const enemyAttackCompletesAt = progress.enemyAttackCompletesAt ?? (enemyAttackDurationMs ? now + enemyAttackDurationMs : null);

  return {
    ...pausedState,
    activeAction: {
      actionId: action.id,
      startedAt: now,
      completesAt: now + remainingMs,
      targetHealth: progress.targetHealth ?? enemy?.health ?? action.health ?? null,
      enemyAttackStartedAt,
      enemyAttackCompletesAt,
    },
    actionProgress: {
      ...pausedState.actionProgress,
      [action.id]: {
        ...progress,
        runningSince: now,
        targetHealth: progress.targetHealth ?? enemy?.health ?? action.health ?? null,
        enemyAttackStartedAt,
        enemyAttackCompletesAt,
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
) => {
  const enemyAttackDurationMs = getEnemyAttackDurationMs(getEnemy(action, context));
  const enemyAttackStartedAt = state.activeAction?.enemyAttackStartedAt ?? (enemyAttackDurationMs ? now : null);
  const enemyAttackCompletesAt = state.activeAction?.enemyAttackCompletesAt ?? (enemyAttackDurationMs ? now + enemyAttackDurationMs : null);

  return {
    ...state,
    activeAction: {
      actionId: action.id,
      startedAt: now,
      completesAt: now + getActionDurationMs(state, action, context),
      targetHealth,
      enemyAttackStartedAt,
      enemyAttackCompletesAt,
    },
    actionProgress: {
      ...state.actionProgress,
      [action.id]: {
        elapsedMs: 0,
        runningSince: now,
        targetHealth,
        enemyAttackStartedAt,
        enemyAttackCompletesAt,
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

type ActionCompletionResult = {
  state: UniversePlayState;
  finished: boolean;
  outcome: 'basicSuccess' | 'hit' | 'miss' | 'kill';
  damage: number;
  remainingHealth: number | null;
  rewards: Reward[];
};

const applyRewards = (state: UniversePlayState, rewards: Reward[]) => {
  const resources = { ...state.resources };
  const skillXp = { ...state.skillXp };

  for (const reward of rewards) {
    if (reward.kind === 'resource') {
      resources[reward.resourceId] = (resources[reward.resourceId] ?? 0) + reward.amount;
    }
    if (reward.kind === 'skillXp') {
      skillXp[reward.skillId] = (skillXp[reward.skillId] ?? 0) + reward.amount;
    }
  }

  return {
    ...state,
    resources,
    skillXp,
  };
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
  const enemy = getEnemy(action, context);

  if (enemy) {
    const result = sampleAdversarialDamage(state, action, context, options.random);
    damage = result?.damage ?? 0;
    const currentHealth = state.activeAction?.targetHealth ?? enemy.health;
    const targetHealth = Math.max(0, currentHealth - damage);
    remainingHealth = targetHealth;

    if (damage <= 0) {
      return {
        state: restartAction(state, action, context, now, currentHealth),
        finished: false,
        outcome: 'miss',
        damage,
        remainingHealth: currentHealth,
        rewards: [],
      };
    }

    const hitState = applyRewards(state, action.rewards);

    if (targetHealth > 0) {
      return {
        state: restartAction(hitState, action, context, now, targetHealth),
        finished: false,
        outcome: 'hit',
        damage,
        remainingHealth,
        rewards: action.rewards,
      };
    }

    state = applyRewards(hitState, enemy.rewards);
  }

  const completedState = {
    ...(enemy ? state : applyRewards(state, action.rewards)),
    activeAction: null,
    actionProgress: {
      ...state.actionProgress,
      [action.id]: {
        elapsedMs: 0,
        runningSince: null,
        targetHealth: null,
        enemyAttackStartedAt: null,
        enemyAttackCompletesAt: null,
      },
    },
    lastTickAt: now,
  };
  const shouldLoop = state.actionLoopingEnabled;
  const restartTargetHealth = enemy ? enemy.health : null;

  return {
    state: shouldLoop ? restartAction(completedState, action, context, now, restartTargetHealth) : completedState,
    finished: true,
    outcome: enemy ? 'kill' : 'basicSuccess',
    damage,
    remainingHealth,
    rewards: enemy ? [...action.rewards, ...enemy.rewards] : action.rewards,
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

const resolveDueEnemyAttacks = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  options: { random?: () => number },
  now: number,
) => {
  const enemyAttackDurationMs = getEnemyAttackDurationMs(getEnemy(action, context));

  if (!state.activeAction?.enemyAttackCompletesAt || !enemyAttackDurationMs) {
    return state;
  }

  let nextState = state;
  let nextAttackAt = state.activeAction.enemyAttackCompletesAt;
  const latestAttackAt = Math.min(now, state.activeAction.completesAt);
  let processed = 0;

  while (nextAttackAt <= latestAttackAt && processed < 100) {
    const attack = sampleEnemyAttackDamage(nextState, action, context, options.random);
    nextState = {
      ...nextState,
      playerHealth: Math.max(0, nextState.playerHealth - (attack?.damage ?? 0)),
    };
    nextAttackAt += enemyAttackDurationMs;
    processed += 1;
  }

  return {
    ...nextState,
    activeAction: nextState.activeAction
      ? {
          ...nextState.activeAction,
          enemyAttackStartedAt: nextAttackAt - enemyAttackDurationMs,
          enemyAttackCompletesAt: nextAttackAt,
        }
      : null,
    actionProgress: nextState.activeAction
      ? {
          ...nextState.actionProgress,
          [nextState.activeAction.actionId]: {
            ...(nextState.actionProgress[nextState.activeAction.actionId] ?? { elapsedMs: 0, runningSince: nextState.activeAction.startedAt }),
            enemyAttackStartedAt: nextAttackAt - enemyAttackDurationMs,
            enemyAttackCompletesAt: nextAttackAt,
          },
        }
      : nextState.actionProgress,
  };
};

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

  if (!state.activeAction) {
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

    return {
      state: options.debugEnabled && report.kind !== 'none' ? appendIdleDebugMessage(nextState, report, now) : nextState,
      report,
    };
  }

  const action = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);

  if (!action) {
    const actionId = state.activeAction.actionId;
    const failed = {
      ...state,
      activeAction: null,
      lastTickAt: now,
    };
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

  state = resolveDueEnemyAttacks(state, action, context, { random: options.random }, now);

  if (!state.activeAction || state.activeAction.completesAt > now) {
    const nextState = {
      ...state,
      lastTickAt: now,
    };
    const report: IdleReport = reportEnabled && state.activeAction
      ? {
          kind: 'inProgress',
          inactiveMs,
          timerKind: 'action',
          actionId: state.activeAction.actionId,
          remainingMs: Math.max(0, state.activeAction.completesAt - now),
        }
      : noIdleReport();

    return {
      state: options.debugEnabled && report.kind !== 'none' ? appendIdleDebugMessage(nextState, report, now) : nextState,
      report,
    };
  }

  if (!actionRequirementsMet(state, action)) {
    const failed = {
      ...state,
      activeAction: null,
      lastTickAt: now,
    };
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
  const messageKey = completion.outcome === 'kill'
    ? actionKillKey(action.id)
    : completion.outcome === 'hit' || completion.outcome === 'basicSuccess'
      ? actionSuccessKey(action.id)
      : null;
  const completed = messageKey
    ? appendChatMessage(completion.state, {
        author: 'system',
        key: messageKey,
        params: { actionId: action.id },
      }, now)
    : completion.state;
  const completedWithDebug = options.debugEnabled
    ? appendChatMessage(completed, {
        author: 'debug',
        key: 'chat.debug.actionCompleted',
        params: {
          actionId: action.id,
          outcome: completion.outcome,
          rewardCount: completion.rewards.length,
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
        rewards: completion.rewards.map((reward) => ({
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
