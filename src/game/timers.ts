import type { ActionResolutionContext, ActionResult, ChatMessage, GameAction, IdleReport, IdleResolution, ResourceBoundaryBehavior, Reward, RunLogEntry, TravelEdgeDefinition, UniversePlayState } from './types';
import { getActionDurationMs, getEnemy, getEnemyAttackDurationMs, getInteractionType, sampleAdversarialDamage, sampleEnemyAttackDamage } from './adversarial';
import { getEnemyStat } from './enemies';
import { getEffectRatePerMinute, getResourceMax as resolveResourceMax, isEffectApplicable } from './resources';
import {
  actionFailureKey,
  actionKillKey,
  actionSuccessKey,
  interactionEntityHitKey,
  interactionEntityKillKey,
  interactionEntityMissKey,
  interactionPlayerHitKey,
  interactionPlayerKillKey,
  interactionPlayerMissKey,
  locationExhaustedKey,
} from './contentIds';
import { areActionRequirementsMet, canStartAction, isActionExhausted, isActionVisible } from './conditions';

const MAX_CHAT_MESSAGES = 80;
const MIN_REPORT_INACTIVE_MS = 1000;
const HEALTH_RESOURCE_ID = 'health';
const EMPTY_CONTEXT: ActionResolutionContext = {
  actions: [],
  skills: [],
  stats: [],
  locations: [],
  items: [],
  flags: [],
  resourceDefinitions: [],
  effects: [],
  interactionTypes: [],
  enemies: [],
};

export const appendRunLog = (
  state: UniversePlayState,
  actor: RunLogEntry['actor'],
  event: string,
  data?: Record<string, unknown>,
  now = Date.now(),
): UniversePlayState => ({
  ...state,
  runLog: [
    ...(state.runLog ?? []),
    {
      runId: state.runId,
      sequence: state.nextRunLogSequence ?? 1,
      createdAt: now,
      actor,
      event,
      ...(data ? { data } : {}),
    },
  ],
  nextRunLogSequence: (state.nextRunLogSequence ?? 1) + 1,
});

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
  const messages = state.chatMessages ?? [];
  const nextMessage: ChatMessage = {
    ...message,
    id: Math.max(now, (messages[messages.length - 1]?.id ?? 0) + 1),
    count: 1,
    createdAt: now,
  };
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
  runId: `run-${Date.now().toString(36)}`,
  currentLocationId: startingLocationId,
  discoveredLocationIds: [startingLocationId],
  activeAction: null,
  actionProgress: {},
  activeTravel: null,
  resources: {},
  inventory: {},
  flags: {},
  actionCompletions: {},
  resourcePools: {},
  skillXp: {},
  statOverrides: {},
  equipmentSkillBonuses: {},
  actionLoopingEnabled: false,
  playerHealth: 0,
  playerMaxHealth: 0,
  chatMessages: [],
  runLog: [],
  nextRunLogSequence: 1,
  lastTickAt: Date.now(),
});

export const normalizePlayState = (
  state: UniversePlayState,
  universeId: string,
  startingLocationId: string,
): UniversePlayState => {
  const actionProgress = state.actionProgress ?? {};
  const runId = state.runId ?? `run-${Date.now().toString(36)}`;

  return {
    ...createInitialPlayState(universeId, startingLocationId),
    ...state,
    runId,
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
    resourcePools: state.resourcePools ?? {},
    inventory: { ...(state.resources ?? {}), ...(state.inventory ?? {}) },
    flags: state.flags ?? {},
    actionCompletions: state.actionCompletions ?? {},
    statOverrides: state.statOverrides ?? {},
    equipmentSkillBonuses: state.equipmentSkillBonuses ?? {},
    actionLoopingEnabled: state.actionLoopingEnabled ?? false,
    playerHealth: state.playerHealth ?? 0,
    playerMaxHealth: state.playerMaxHealth ?? 0,
    chatMessages: state.chatMessages ?? [],
    runLog: (state.runLog ?? []).map((entry) => ({ ...entry, runId: entry.runId ?? runId })),
    nextRunLogSequence: state.nextRunLogSequence ?? ((state.runLog?.length ?? 0) + 1),
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

const stopRunningAction = (state: UniversePlayState, now: number) => {
  if (!state.activeAction) {
    return state;
  }

  return {
    ...state,
    activeAction: null,
    actionProgress: {
      ...state.actionProgress,
      [state.activeAction.actionId]: {
        elapsedMs: 0,
        runningSince: null,
        targetHealth: null,
        enemyAttackStartedAt: null,
        enemyAttackCompletesAt: null,
      },
    },
    lastTickAt: now,
  };
};

const getResourceDefinitions = (context: ActionResolutionContext) => context.resourceDefinitions ?? [];

const getResourceDefinition = (context: ActionResolutionContext, resourceId: string) =>
  getResourceDefinitions(context).find((resource) => resource.id === resourceId);

const getResourceMax = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  resourceId: string,
) => {
  const definition = getResourceDefinition(context, resourceId);

  return definition
    ? resolveResourceMax(state, context.stats ?? [], definition, context.manifest?.basePlayer)
    : state.resourcePools[resourceId]?.max ?? 0;
};

const syncLegacyHealth = (state: UniversePlayState) => {
  const health = state.resourcePools[HEALTH_RESOURCE_ID];

  if (!health) {
    return state;
  }

  return {
    ...state,
    playerHealth: health.current,
    playerMaxHealth: health.max,
  };
};

const ensureResourcePools = (
  state: UniversePlayState,
  context: ActionResolutionContext,
) => {
  const resourcePools = { ...state.resourcePools };

  for (const definition of getResourceDefinitions(context)) {
    const existing = resourcePools[definition.id];
    const min = 0;
    const max = getResourceMax(state, context, definition.id);
    const initial = definition.initialValue === 'empty' ? 0 : max;
    const wasUninitialized = existing && existing.max <= existing.min && max > min;
    const current = Math.min(max, Math.max(min, wasUninitialized ? initial : existing?.current ?? initial));

    resourcePools[definition.id] = {
      current,
      min,
      max,
    };
  }

  return syncLegacyHealth({
    ...state,
    resourcePools,
  });
};

const ensureWorldState = (
  state: UniversePlayState,
  context: ActionResolutionContext,
) => {
  const inventory = {
    ...(context.manifest?.basePlayer?.inventory ?? {}),
    ...state.inventory,
  };
  const flags = { ...state.flags };

  for (const item of context.items ?? []) {
    if (inventory[item.id] === undefined) {
      inventory[item.id] = 0;
    }
  }
  for (const flag of context.flags ?? []) {
    if (flags[flag.id] === undefined) {
      flags[flag.id] = flag.initialValue ?? false;
    }
  }

  return ensureResourcePools({ ...state, inventory, flags }, context);
};

const setResourceCurrent = (
  state: UniversePlayState,
  resourceId: string,
  current: number,
) => {
  const resource = state.resourcePools[resourceId];

  if (!resource) {
    return state;
  }

  return syncLegacyHealth({
    ...state,
    resourcePools: {
      ...state.resourcePools,
      [resourceId]: {
        ...resource,
        current: Math.min(resource.max, Math.max(resource.min, current)),
      },
    },
  });
};

const resolveLocationId = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  locationId: string,
) => locationId === 'starting-location'
  ? context.locations?.find((location) => location.starting)?.id ?? state.currentLocationId
  : locationId;

const selectKeys = <T>(values: Record<string, T>, ids: string[] = []) =>
  Object.fromEntries(ids.filter((id) => values[id] !== undefined).map((id) => [id, values[id]]));

export const applyStateReset = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  policy: Extract<ResourceBoundaryBehavior, { kind: 'reset-state' }>,
  now = Date.now(),
) => {
  const startingLocationId = resolveLocationId(state, context, policy?.locationId ?? 'starting-location');
  const preserve = policy?.preserve ?? {};
  const initial = ensureWorldState(createInitialPlayState(state.universeId, startingLocationId), context);
  const next = {
    ...initial,
    inventory: {
      ...initial.inventory,
      ...selectKeys(state.inventory, preserve.inventoryIds),
    },
    resourcePools: {
      ...initial.resourcePools,
      ...selectKeys(state.resourcePools, preserve.resourceIds),
    },
    flags: {
      ...initial.flags,
      ...selectKeys(state.flags, preserve.flagIds),
    },
    skillXp: preserve.skillXp ? state.skillXp : initial.skillXp,
    discoveredLocationIds: preserve.discoveredLocations
      ? Array.from(new Set([...state.discoveredLocationIds, startingLocationId]))
      : initial.discoveredLocationIds,
    actionCompletions: {
      ...initial.actionCompletions,
      ...selectKeys(state.actionCompletions, preserve.actionCompletionIds),
    },
    chatMessages: state.chatMessages,
    runLog: state.runLog,
    nextRunLogSequence: state.nextRunLogSequence,
    actionLoopingEnabled: state.actionLoopingEnabled,
    runId: state.runId,
    lastTickAt: now,
  };

  if (policy?.incrementFlagId) {
    next.flags[policy.incrementFlagId] = Number(state.flags[policy.incrementFlagId] ?? 0) + 1;
  }

  return appendRunLog(syncLegacyHealth(next), 'engine', 'state.reset', {
    incrementFlagId: policy?.incrementFlagId ?? '',
    incrementedValue: policy?.incrementFlagId ? next.flags[policy.incrementFlagId] : 0,
    locationId: startingLocationId,
    preservedInventoryIds: preserve.inventoryIds ?? [],
    preservedResourceIds: preserve.resourceIds ?? [],
    preservedFlagIds: preserve.flagIds ?? [],
  }, now);
};

const applyResourceBehaviors = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  resourceId: string,
  behaviors: ResourceBoundaryBehavior[],
  now: number,
) => {
  let nextState = state;

  for (const behavior of behaviors) {
    if (behavior.kind === 'stop-action') {
      nextState = stopRunningAction(nextState, now);
    }

    if (behavior.kind === 'refill') {
      const resource = nextState.resourcePools[resourceId];

      if (resource) {
        const value = behavior.value === 'min'
          ? resource.min
          : behavior.value === 'max'
            ? resource.max
            : behavior.value;
        nextState = setResourceCurrent(nextState, resourceId, value);
      }
    }

    if (behavior.kind === 'relocate') {
      const locationId = resolveLocationId(nextState, context, behavior.locationId);
      const discoveredLocationIds = nextState.discoveredLocationIds.includes(locationId)
        ? nextState.discoveredLocationIds
        : [...nextState.discoveredLocationIds, locationId];

      nextState = {
        ...nextState,
        currentLocationId: locationId,
        discoveredLocationIds,
      };
    }

    if (behavior.kind === 'chat') {
      nextState = appendChatMessage(nextState, {
        author: 'system',
        key: behavior.messageKey,
      }, now);
    }

    if (behavior.kind === 'reset-state') {
      nextState = applyStateReset(nextState, context, behavior, now);
    }
  }

  return nextState;
};

const applyResourceDelta = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  resourceId: string,
  delta: number,
  now: number,
) => {
  const definition = getResourceDefinition(context, resourceId);
  const resource = state.resourcePools[resourceId];

  if (!definition || !resource || delta === 0) {
    return state;
  }

  const previous = resource.current;
  const nextValue = Math.min(resource.max, Math.max(resource.min, previous + delta));
  let nextState = setResourceCurrent(state, resourceId, nextValue);
  nextState = appendRunLog(nextState, 'engine', 'resource.change', {
    resourceId,
    requestedDelta: delta,
    previous,
    current: nextValue,
  }, now);

  if (previous > resource.min && nextValue <= resource.min) {
    nextState = applyResourceBehaviors(nextState, context, resourceId, definition.onEmpty ?? [], now);
  } else if (previous < resource.max && nextValue >= resource.max) {
    nextState = applyResourceBehaviors(nextState, context, resourceId, definition.onFull ?? [], now);
  }

  return nextState;
};

const applyActiveEffects = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  now: number,
) => {
  if (!state.activeAction) {
    return state;
  }

  const effectUntil = Math.min(now, state.activeAction.completesAt);
  const effectStartedAt = state.lastTickAt ?? effectUntil;
  const elapsedMs = Math.max(0, effectUntil - effectStartedAt);
  const elapsedMinutes = elapsedMs / 60_000;

  if (elapsedMinutes <= 0) {
    return state;
  }

  return (context.effects ?? []).reduce((nextState, effect) => {
    if (!isEffectApplicable(nextState, effect)) {
      return nextState;
    }

    const resource = nextState.resourcePools[effect.resourceId];
    const delta = getEffectRatePerMinute(context.stats ?? [], nextState, effect, context.manifest?.basePlayer) * elapsedMinutes;
    const crossedMin = resource && delta < 0 && resource.current > resource.min && resource.current + delta <= resource.min;
    const crossedMax = resource && delta > 0 && resource.current < resource.max && resource.current + delta >= resource.max;
    const boundaryAt = crossedMin
      ? effectStartedAt + elapsedMs * ((resource.current - resource.min) / Math.abs(delta))
      : crossedMax
        ? effectStartedAt + elapsedMs * ((resource.max - resource.current) / delta)
        : effectUntil;

    return applyResourceDelta(
      nextState,
      context,
      effect.resourceId,
      delta,
      boundaryAt,
    );
  }, state);
};

const applyEnemyRegeneration = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  now: number,
) => {
  if (!state.activeAction || state.activeAction.targetHealth === null) {
    return state;
  }

  const action = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);
  const enemy = action ? getEnemy(action, context) : null;

  if (!enemy || getEnemyStat(enemy, 'regeneration') <= 0) {
    return state;
  }

  const effectUntil = Math.min(now, state.activeAction.completesAt);
  const elapsedMinutes = Math.max(0, effectUntil - (state.lastTickAt ?? effectUntil)) / 60_000;
  const targetHealth = Math.min(getEnemyStat(enemy, 'health'), state.activeAction.targetHealth + getEnemyStat(enemy, 'regeneration') * elapsedMinutes);

  return {
    ...state,
    activeAction: {
      ...state.activeAction,
      targetHealth,
    },
    actionProgress: {
      ...state.actionProgress,
      [state.activeAction.actionId]: {
        ...(state.actionProgress[state.activeAction.actionId] ?? {
          elapsedMs: 0,
          runningSince: state.activeAction.startedAt,
        }),
        targetHealth,
      },
    },
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
  state = ensureWorldState(state, context);

  if (state.activeAction?.actionId === action.id) {
    return appendRunLog(pauseRunningAction(state, now), 'player', 'action.pause', { actionId: action.id }, now);
  }

  if (!canStartAction(state, action, context)) {
    return appendRunLog(state, 'player', 'action.rejected', {
      actionId: action.id,
      exhausted: isActionExhausted(state, action),
    }, now);
  }

  const pausedState = pauseRunningAction(state, now);
  const durationMs = getActionDurationMs(pausedState, action, context);
  const savedProgress = pausedState.actionProgress[action.id] ?? { elapsedMs: 0, runningSince: null };
  const progress = savedProgress.elapsedMs >= durationMs
    ? {
        elapsedMs: 0,
        runningSince: null,
        targetHealth: null,
        enemyAttackStartedAt: null,
        enemyAttackCompletesAt: null,
      }
    : savedProgress;
  const remainingMs = Math.max(0, durationMs - progress.elapsedMs);
  const enemy = getEnemy(action, context);
  const enemyAttackDurationMs = getEnemyAttackDurationMs(enemy);
  const enemyAttackStartedAt = progress.enemyAttackStartedAt ?? (enemyAttackDurationMs ? now : null);
  const enemyAttackCompletesAt = progress.enemyAttackCompletesAt ?? (enemyAttackDurationMs ? now + enemyAttackDurationMs : null);

  return appendRunLog({
    ...pausedState,
    activeAction: {
      actionId: action.id,
      startedAt: now,
      completesAt: now + remainingMs,
      targetHealth: progress.targetHealth ?? (enemy ? getEnemyStat(enemy, 'health') : null),
      enemyAttackStartedAt,
      enemyAttackCompletesAt,
    },
    actionProgress: {
      ...pausedState.actionProgress,
      [action.id]: {
        ...progress,
        runningSince: now,
        targetHealth: progress.targetHealth ?? (enemy ? getEnemyStat(enemy, 'health') : null),
        enemyAttackStartedAt,
        enemyAttackCompletesAt,
      },
    },
    lastTickAt: now,
  }, 'player', 'action.start', { actionId: action.id, locationId: action.locationId }, now);
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

  return appendRunLog({
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
  }, 'player', 'travel.start', {
    edgeId: edge.id,
    fromLocationId: state.currentLocationId,
    toLocationId: destinationLocationId,
  }, now);
};

type ActionCompletionResult = {
  state: UniversePlayState;
  finished: boolean;
  outcome: 'basicSuccess' | 'hit' | 'miss' | 'kill';
  damage: number;
  remainingHealth: number | null;
  rewards: Reward[];
};

const applyItemDelta = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  itemId: string,
  amount: number,
) => {
  const definition = context.items?.find((item) => item.id === itemId);
  const current = state.inventory[itemId] ?? 0;
  const next = Math.max(0, Math.min(definition?.maxQuantity ?? Number.POSITIVE_INFINITY, current + amount));
  return {
    ...state,
    inventory: { ...state.inventory, [itemId]: next },
    resources: { ...state.resources, [itemId]: next },
  };
};

const applyActionResult = (
  state: UniversePlayState,
  result: ActionResult,
  context: ActionResolutionContext,
  now: number,
) => {
  if (result.kind === 'item') {
    return applyItemDelta(state, context, result.itemId, result.amount);
  }
  if (result.kind === 'resource') {
    return applyResourceDelta(state, context, result.resourceId, result.amount, now);
  }
  if (result.kind === 'skill-xp') {
    return {
      ...state,
      skillXp: {
        ...state.skillXp,
        [result.skillId]: Math.max(0, (state.skillXp[result.skillId] ?? 0) + result.amount),
      },
    };
  }
  if (result.kind === 'flag') {
    return { ...state, flags: { ...state.flags, [result.flagId]: result.value } };
  }
  if (result.kind === 'relocate') {
    const locationId = resolveLocationId(state, context, result.locationId);
    return {
      ...state,
      currentLocationId: locationId,
      discoveredLocationIds: Array.from(new Set([...state.discoveredLocationIds, locationId])),
      activeTravel: null,
    };
  }
  return appendChatMessage(
    state,
    { author: 'system', key: result.messageKey },
    now + (result.delaySeconds ?? 0) * 1000,
  );
};

const appendExhaustedLocationMessage = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  now: number,
) => {
  if (action.role !== 'optional') return state;
  const hasRemainingOptionalAction = context.actions.some((candidate) =>
    candidate.locationId === action.locationId
    && candidate.role === 'optional'
    && isActionVisible(state, candidate, context)
    && !isActionExhausted(state, candidate));
  return hasRemainingOptionalAction
    ? state
    : appendChatMessage(state, { author: 'system', key: locationExhaustedKey(action.locationId) }, now + 1);
};

const applyRewards = (
  state: UniversePlayState,
  rewards: Reward[],
  context: ActionResolutionContext,
  now: number,
) => rewards.reduce((nextState, reward) => {
  if (reward.kind === 'skillXp') {
    return applyActionResult(nextState, { kind: 'skill-xp', skillId: reward.skillId, amount: reward.amount }, context, now);
  }
  if (reward.kind === 'item') {
    return applyActionResult(nextState, { kind: 'item', itemId: reward.itemId, amount: reward.amount }, context, now);
  }
  const resourceExists = context.resourceDefinitions?.some((resource) => resource.id === reward.resourceId);
  return applyActionResult(nextState, resourceExists
    ? { kind: 'resource', resourceId: reward.resourceId, amount: reward.amount }
    : { kind: 'item', itemId: reward.resourceId, amount: reward.amount }, context, now);
}, state);

const applyActionCompletion = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  now: number,
) => {
  const rewarded = applyRewards(state, action.rewards, context, now);
  const changed = (action.results ?? []).reduce(
    (nextState, result) => applyActionResult(nextState, result, context, now),
    rewarded,
  );
  return appendRunLog({
    ...changed,
    actionCompletions: {
      ...changed.actionCompletions,
      [action.id]: (changed.actionCompletions[action.id] ?? 0) + 1,
    },
  }, 'engine', 'action.complete', {
    actionId: action.id,
    completion: (changed.actionCompletions[action.id] ?? 0) + 1,
    results: action.results ?? [],
    rewards: action.rewards,
  }, now);
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
    const currentHealth = state.activeAction?.targetHealth ?? getEnemyStat(enemy, 'health');
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

    const hitState = applyRewards(state, action.rewards, context, now);

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

    state = applyRewards(applyActionCompletion(state, action, context, now), enemy.rewards, context, now);
  }

  const resolvedState = enemy ? state : applyActionCompletion(state, action, context, now);
  const completedState = {
    ...resolvedState,
    activeAction: null,
    actionProgress: {
      ...resolvedState.actionProgress,
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
  const shouldLoop = completedState.actionLoopingEnabled
    && completedState.currentLocationId === action.locationId
    && canStartAction(completedState, action, context);
  const restartTargetHealth = enemy ? getEnemyStat(enemy, 'health') : null;

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
    const attackAt = nextAttackAt;
    const enemy = getEnemy(action, context);
    const interactionType = getInteractionType(action, context);
    const attack = sampleEnemyAttackDamage(nextState, action, context, options.random);
    const damage = attack?.damage ?? 0;
    const health = nextState.resourcePools[HEALTH_RESOURCE_ID];
    const isKill = Boolean(health && damage > 0 && health.current - damage <= health.min);

    if (enemy && interactionType) {
      nextState = appendChatMessage(nextState, {
        author: 'system',
        key: isKill
          ? interactionEntityKillKey(interactionType.id)
          : damage > 0
            ? interactionEntityHitKey(interactionType.id)
            : interactionEntityMissKey(interactionType.id),
        params: {
          source: enemy.id,
          target: 'you',
          damage: roundCombatNumber(damage),
        },
      }, attackAt);
    }

    nextState = applyResourceDelta(nextState, context, HEALTH_RESOURCE_ID, -damage, attackAt);

    nextAttackAt += enemyAttackDurationMs;
    processed += 1;

    if (!nextState.activeAction) {
      return nextState;
    }
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

const rewardLabelId = (reward: Reward) => reward.kind === 'resource'
  ? reward.resourceId
  : reward.kind === 'item'
    ? reward.itemId
    : reward.skillId;

const roundCombatNumber = (value: number) => Math.round(value * 100) / 100;

const getActionMessage = (
  action: GameAction,
  context: ActionResolutionContext,
  outcome: ActionCompletionResult['outcome'],
) => {
  const enemy = getEnemy(action, context);
  const interactionType = getInteractionType(action, context);

  if (enemy && interactionType) {
    if (outcome === 'kill') {
      return interactionPlayerKillKey(interactionType.id);
    }
    if (outcome === 'hit') {
      return interactionPlayerHitKey(interactionType.id);
    }
    if (outcome === 'miss') {
      return interactionPlayerMissKey(interactionType.id);
    }
  }

  if (outcome === 'kill') {
    return actionKillKey(action.id);
  }

  return outcome === 'hit' || outcome === 'basicSuccess'
    ? actionSuccessKey(action.id)
    : actionFailureKey(action.id);
};

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

  state = ensureWorldState(state, context);
  state = applyActiveEffects(state, context, now);
  state = applyEnemyRegeneration(state, context, now);

  if (state.activeTravel && state.activeTravel.completesAt <= now) {
    const activeTravel = state.activeTravel;
    const destinationLocationId = state.activeTravel.toLocationId;
    const discoveredLocationIds = state.discoveredLocationIds.includes(destinationLocationId)
      ? state.discoveredLocationIds
      : [...state.discoveredLocationIds, destinationLocationId];
    const nextState = appendRunLog({
      ...state,
      currentLocationId: destinationLocationId,
      discoveredLocationIds,
      activeTravel: null,
      lastTickAt: now,
    }, 'engine', 'travel.complete', {
      edgeId: activeTravel.edgeId,
      fromLocationId: activeTravel.fromLocationId,
      toLocationId: activeTravel.toLocationId,
    }, activeTravel.completesAt);
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

  if (!areActionRequirementsMet(state, action, context)) {
    const failed = appendRunLog(stopRunningAction(state, now), 'engine', 'action.requirements-failed', { actionId: action.id }, now);
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
  const enemy = getEnemy(action, context);
  const messageKey = getActionMessage(action, context, completion.outcome);
  const completed = messageKey
    ? appendChatMessage(completion.state, {
        author: 'system',
        key: messageKey,
        params: {
          actionId: action.id,
          target: enemy?.id ?? action.id,
          damage: roundCombatNumber(completion.damage),
        },
      }, now)
    : completion.state;
  const completedWithExhaustion = completion.finished
    ? appendExhaustedLocationMessage(completed, action, context, now)
    : completed;
  const completedWithDebug = options.debugEnabled
    ? appendChatMessage(completedWithExhaustion, {
        author: 'debug',
        key: 'chat.debug.actionCompleted',
        params: {
          actionId: action.id,
          outcome: completion.outcome,
          rewardCount: completion.rewards.length,
          damage: roundCombatNumber(completion.damage),
          remainingHealth: roundCombatNumber(completion.remainingHealth ?? 0),
          playerHealth: roundCombatNumber(completed.playerHealth),
          now,
        },
      }, now + 1)
      : completedWithExhaustion;
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
