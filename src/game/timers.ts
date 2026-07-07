import type { ActionResolutionContext, ActionResult, ChatMessage, ConcreteReward, ExperienceEventKind, ExperienceTrigger, GameAction, IdleReport, IdleResolution, ResourceBoundaryBehavior, Reward, RunLogEntry, UniversePlayState } from './types';
import type { AvailableTravelEdge } from './travel';
import { getActionDurationMs, getEnemy, getInteractionType, isInstantAction, sampleAdversarialDamage, sampleEnemyAttackDamage } from './adversarial';
import { getEnemyStat } from './enemies';
import { getEffectDeltaPerMinute, getResourceMaxForContext, isEffectApplicable } from './resources';
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
  skillTitleKey,
} from './contentIds';
import { areActionRequirementsMet, canStartAction, evaluateCondition, isActionAvailableAtCurrentLocation, isActionExhausted, isActionVisible } from './conditions';
import { readStateVariable, writeStateVariable } from './stateVariables';
import { resolveManifestUiSettings } from './universeSettings';
import { skillLevelFromXp } from './skills';
import { rollRewards } from './rewards';
import { applyCollectionLogRewards } from './collectionLog';
import { resolveStationAction } from './recipes';

const MAX_CHAT_MESSAGES = 80;
const MAX_RUN_LOG_ENTRIES = 100;
const MIN_REPORT_INACTIVE_MS = 1000;
const HEALTH_RESOURCE_ID = 'health';
const ENEMY_HEALTH_RESOURCE_ID = 'enemy-health';
const CONTINUOUS_ACTION_MAX_MS = 4 * 60 * 60 * 1000;
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
  dropTables: [],
  dialogues: [],
};

type GameExperienceEvent = {
  kind: ExperienceEventKind;
  amount: number;
  actionId?: string;
  effectId?: string;
  enemyId?: string;
  interactionTypeId?: string;
  resourceId?: string;
  sourceStat?: string;
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
  ].slice(-MAX_RUN_LOG_ENTRIES),
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

export const createInitialPlayState = (
  universeId: string,
  startingLocationId: string,
  context?: Pick<ActionResolutionContext, 'manifest'>,
): UniversePlayState => ({
  universeId,
  runId: `run-${Date.now().toString(36)}`,
  currentLocationId: startingLocationId,
  discoveredLocationIds: [startingLocationId],
  activeAction: null,
  actionProgress: {},
  activeTravel: null,
  activeDialogue: null,
  resources: {},
  inventory: {},
  bank: {},
  flags: {},
  flagExpirations: {},
  actionCompletions: {},
  collectionLog: {
    [locationExploredKey(startingLocationId)]: 1,
  },
  resourcePools: {},
  skillXp: {},
  statOverrides: {},
  equipmentSkillBonuses: {},
  equipment: {},
  actionLoopingEnabled: resolveManifestUiSettings(context?.manifest).loopActionsByDefault,
  playerHealth: 0,
  playerMaxHealth: 0,
  chatMessages: [],
  runLog: [],
  nextRunLogSequence: 1,
  lastTickAt: Date.now(),
  spawnLocationId: null,
  characterName: '',
  openModalId: null,
});

export const normalizePlayState = (
  state: UniversePlayState,
  universeId: string,
  startingLocationId: string,
  context?: Pick<ActionResolutionContext, 'manifest'>,
): UniversePlayState => {
  const actionProgress = state.actionProgress ?? {};
  const runId = state.runId ?? `run-${Date.now().toString(36)}`;
  const discoveredLocationIds = Array.from(new Set(state.discoveredLocationIds?.length ? state.discoveredLocationIds : [startingLocationId]));
  const collectionLog = {
    ...(state.collectionLog ?? {}),
    ...Object.fromEntries(discoveredLocationIds.map((locationId) => [locationExploredKey(locationId), 1])),
  };
  const activeTravel = state.activeTravel?.actionId && state.activeTravel.pathLocationIds?.length && state.activeTravel.pathActionIds?.length
    ? state.activeTravel
    : null;

  return {
    ...createInitialPlayState(universeId, startingLocationId, context),
    ...state,
    runId,
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
    activeTravel,
    activeDialogue: state.activeDialogue ?? null,
    resourcePools: state.resourcePools ?? {},
    inventory: { ...(state.resources ?? {}), ...(state.inventory ?? {}) },
    bank: state.bank ?? {},
    flags: state.flags ?? {},
    flagExpirations: state.flagExpirations ?? {},
    actionCompletions: state.actionCompletions ?? {},
    discoveredLocationIds,
    collectionLog,
    statOverrides: state.statOverrides ?? {},
    equipmentSkillBonuses: state.equipmentSkillBonuses ?? {},
    equipment: state.equipment ?? {},
    actionLoopingEnabled: context?.manifest
      ? resolveManifestUiSettings(context.manifest).loopActionsByDefault
      : state.actionLoopingEnabled ?? resolveManifestUiSettings().loopActionsByDefault,
    playerHealth: state.playerHealth ?? 0,
    playerMaxHealth: state.playerMaxHealth ?? 0,
    chatMessages: state.chatMessages ?? [],
    runLog: (state.runLog ?? []).map((entry) => ({ ...entry, runId: entry.runId ?? runId })).slice(-MAX_RUN_LOG_ENTRIES),
    nextRunLogSequence: state.nextRunLogSequence ?? ((state.runLog?.length ?? 0) + 1),
    spawnLocationId: state.spawnLocationId ?? null,
    characterName: state.characterName ?? '',
    openModalId: state.openModalId ?? null,
  };
};

const applyManifestRuntimeSettings = (
  state: UniversePlayState,
  context: Pick<ActionResolutionContext, 'manifest'>,
): UniversePlayState => context.manifest
  ? {
      ...state,
      actionLoopingEnabled: resolveManifestUiSettings(context.manifest).loopActionsByDefault,
    }
  : state;

const pauseRunningAction = (state: UniversePlayState, now: number, context?: ActionResolutionContext) => {
  if (!state.activeAction) {
    return state;
  }

  const progress = state.actionProgress[state.activeAction.actionId] ?? { elapsedMs: 0, runningSince: state.activeAction.startedAt };
  const paused = {
    ...state,
    activeAction: null,
    actionProgress: {
      ...state.actionProgress,
      [state.activeAction.actionId]: {
        elapsedMs: progress.elapsedMs + Math.max(0, now - (progress.runningSince ?? state.activeAction.startedAt)),
        runningSince: null,
        targetHealth: state.activeAction.targetHealth ?? progress.targetHealth ?? null,
        recipeId: state.activeAction.recipeId,
      },
    },
    lastTickAt: now,
  };

  return context ? resetInactiveEffectResources(paused, context, now) : paused;
};

const stopRunningAction = (state: UniversePlayState, now: number, context?: ActionResolutionContext) => {
  if (!state.activeAction) {
    return state;
  }

  const stopped = {
    ...state,
    activeAction: null,
    actionProgress: {
      ...state.actionProgress,
      [state.activeAction.actionId]: {
        elapsedMs: 0,
        runningSince: null,
        targetHealth: null,
      },
    },
    lastTickAt: now,
  };

  return context ? resetInactiveEffectResources(stopped, context, now) : stopped;
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
    ? getResourceMaxForContext(context, state, definition)
    : state.resourcePools[resourceId]?.max ?? 0;
};

const matchesExperienceTrigger = (trigger: ExperienceTrigger, event: GameExperienceEvent) =>
  trigger.event === event.kind
  && (trigger.effectId === undefined || trigger.effectId === event.effectId)
  && (trigger.enemyId === undefined || trigger.enemyId === event.enemyId)
  && (trigger.interactionTypeId === undefined || trigger.interactionTypeId === event.interactionTypeId)
  && (trigger.resourceId === undefined || trigger.resourceId === event.resourceId)
  && (trigger.sourceStat === undefined || trigger.sourceStat === event.sourceStat);

const experienceAmount = (trigger: ExperienceTrigger, event: GameExperienceEvent) =>
  trigger.amount ?? event.amount * (trigger.amountPerUnit ?? 1);

const interactionTypeForExperienceEvent = (
  action: GameAction | null,
  context: ActionResolutionContext,
  event: GameExperienceEvent,
) => {
  const interactionTypeId = event.interactionTypeId ?? (action ? getInteractionType(action, context)?.id ?? action.interactionTypeId : undefined);
  return context.interactionTypes.find((interactionType) => interactionType.id === interactionTypeId) ?? null;
};

const experienceTriggersForEvent = (
  action: GameAction | null,
  context: ActionResolutionContext,
  event: GameExperienceEvent,
) => [
  ...(context.manifest?.experience ?? []),
  ...(interactionTypeForExperienceEvent(action, context, event)?.experience ?? []),
  ...(event.effectId ? (context.effects ?? []).find((effect) => effect.id === event.effectId)?.experience ?? [] : []),
  ...(action?.experience ?? []),
];

const maxSkillLevel = (context: ActionResolutionContext, skillId: string) =>
  context.skills.find((skill) => skill.id === skillId)?.maxLevel ?? Number.POSITIVE_INFINITY;

const skillLevel = (context: ActionResolutionContext, skillId: string, xp: number) =>
  Math.min(maxSkillLevel(context, skillId), skillLevelFromXp(xp, context.manifest?.experienceCurve));

const grantSkillXp = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  skillId: string,
  amount: number,
  now: number,
) => {
  if (amount <= 0) {
    return state;
  }

  const previousXp = state.skillXp[skillId] ?? 0;
  const nextXp = Math.max(0, previousXp + amount);
  const previousLevel = skillLevel(context, skillId, previousXp);
  const nextLevel = skillLevel(context, skillId, nextXp);
  let nextState = {
    ...state,
    skillXp: {
      ...state.skillXp,
      [skillId]: nextXp,
    },
  };

  for (let level = previousLevel + 1; level <= nextLevel; level += 1) {
    nextState = appendChatMessage(nextState, {
      author: 'system',
      key: 'chat.skillLevelUp',
      params: {
        'skill-name': skillTitleKey(skillId),
        'new-level': level,
      },
    }, now);
  }

  return nextState;
};

const applySkillXpResult = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  skillId: string,
  amount: number,
  now: number,
) => grantSkillXp(state, context, skillId, amount, now);

const emitExperienceEvent = (
  state: UniversePlayState,
  action: GameAction | null,
  context: ActionResolutionContext,
  event: GameExperienceEvent,
  now: number,
) => {
  let nextState = state;

  for (const trigger of experienceTriggersForEvent(action, context, event)) {
    if (!matchesExperienceTrigger(trigger, event)) {
      continue;
    }

    const amount = experienceAmount(trigger, event);
    nextState = grantSkillXp(nextState, context, trigger.skillId, amount, now);
    nextState = appendRunLog(nextState, 'engine', 'skill.xp-event', {
      actionId: event.actionId ?? action?.id ?? '',
      amount,
      event: event.kind,
      skillId: trigger.skillId,
      eventAmount: event.amount,
      effectId: event.effectId ?? '',
      interactionTypeId: event.interactionTypeId ?? '',
      resourceId: event.resourceId ?? '',
      sourceStat: event.sourceStat ?? '',
    }, now);
  }

  return nextState;
};

const emitActiveActionExperienceEvent = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  event: GameExperienceEvent,
  now: number,
) => {
  const action = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);
  return emitExperienceEvent(state, action ?? null, context, action ? { ...event, actionId: action.id } : event, now);
};

const emitResourceExperienceEvents = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  resourceId: string,
  appliedDelta: number,
  now: number,
  source: { effectId?: string; sourceStat?: string } = {},
) => {
  if (Math.abs(appliedDelta) <= 0.000001) {
    return state;
  }

  const action = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);
  const interactionType = action ? getInteractionType(action, context) : null;
  const enemy = action ? getEnemy(action, context) : null;
  const baseEvent = {
    actionId: action?.id,
    effectId: source.effectId,
    enemyId: enemy?.id,
    interactionTypeId: interactionType?.id ?? action?.interactionTypeId,
    resourceId,
    sourceStat: source.sourceStat,
  };

  if (resourceId === ENEMY_HEALTH_RESOURCE_ID && appliedDelta < 0) {
    return emitActiveActionExperienceEvent(state, context, {
      ...baseEvent,
      kind: 'damage-dealt',
      amount: -appliedDelta,
    }, now);
  }

  if (resourceId === HEALTH_RESOURCE_ID && appliedDelta < 0) {
    return emitActiveActionExperienceEvent(state, context, {
      ...baseEvent,
      kind: 'damage-taken',
      amount: -appliedDelta,
    }, now);
  }

  if (resourceId === HEALTH_RESOURCE_ID && appliedDelta > 0) {
    return emitActiveActionExperienceEvent(state, context, {
      ...baseEvent,
      kind: 'health-regenerated',
      amount: appliedDelta,
    }, now);
  }

  return state;
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

const getRuntimeResourcePool = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  resourceId: string,
) => {
  const definition = getResourceDefinition(context, resourceId);

  if (definition?.owner === 'enemy' && definition.sourceEnemyStat === 'health') {
    const max = getResourceMaxForContext(context, state, definition);
    return {
      current: Math.min(max, Math.max(0, state.activeAction?.targetHealth ?? max)),
      min: 0,
      max,
    };
  }

  return state.resourcePools[resourceId];
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
  const bank = {
    ...(context.manifest?.basePlayer?.bank ?? {}),
    ...state.bank,
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

  return applyManifestRuntimeSettings(ensureResourcePools({ ...state, inventory, bank, flags }, context), context);
};

const resetOwnedResourcePools = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  owner: 'player' | 'enemy',
) => {
  const resourcePools = { ...state.resourcePools };

  for (const definition of getResourceDefinitions(context)) {
    if (definition.owner !== owner) {
      continue;
    }

    const max = getResourceMaxForContext(context, state, definition);
    resourcePools[definition.id] = {
      current: definition.initialValue === 'empty' ? 0 : max,
      min: 0,
      max,
    };
  }

  return syncLegacyHealth({
    ...state,
    resourcePools,
  });
};

const setResourceCurrent = (
  state: UniversePlayState,
  context: ActionResolutionContext | null,
  resourceId: string,
  current: number,
) => {
  const definition = context ? getResourceDefinition(context, resourceId) : null;
  if (context && definition?.owner === 'enemy' && definition.sourceEnemyStat === 'health' && state.activeAction) {
    const max = getResourceMaxForContext(context, state, definition);
    const targetHealth = Math.min(max, Math.max(0, current));
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
  }

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

export const resetInactiveEffectResources = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  now = Date.now(),
) => {
  let nextState = state;

  for (const effect of context.effects ?? []) {
    if (!effect.resetResourceWhenInactive || isEffectApplicable(context, nextState, effect)) {
      continue;
    }

    const resource = getRuntimeResourcePool(nextState, context, effect.resourceId);
    if (resource && resource.current !== resource.min) {
      nextState = setResourceCurrent(nextState, context, effect.resourceId, resource.min);
      nextState = appendRunLog(nextState, 'engine', 'resource.reset-inactive', {
        resourceId: effect.resourceId,
        effectId: effect.id,
        previous: resource.current,
        current: resource.min,
      }, now);
    }
  }

  return nextState;
};

const resolveLocationId = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  locationId: string,
) => locationId === 'starting-location'
  ? state.spawnLocationId ?? context.locations?.find((location) => location.starting)?.id ?? state.currentLocationId
  : locationId;

const locationExploredKey = (locationId: string) => `location:${locationId}:explored`;

const exploreLocation = (
  state: UniversePlayState,
  locationId: string,
): UniversePlayState => ({
  ...state,
  currentLocationId: locationId,
  discoveredLocationIds: Array.from(new Set([...state.discoveredLocationIds, locationId])),
  collectionLog: {
    ...state.collectionLog,
    [locationExploredKey(locationId)]: 1,
  },
});

const selectKeys = <T>(values: Record<string, T>, ids: string[] = []) =>
  Object.fromEntries(ids.filter((id) => values[id] !== undefined).map((id) => [id, values[id]]));

const legacyFlagVariables = (ids: string[] = []) => ids.map((id) => `flag:${id}`);

const restoreStateVariables = (
  next: UniversePlayState,
  previous: UniversePlayState,
  context: ActionResolutionContext,
  variables: string[] = [],
) => variables.reduce(
  (state, variable) => writeStateVariable(state, variable, readStateVariable(previous, variable, context)),
  next,
);

export const applyStateReset = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  policy: Extract<ResourceBoundaryBehavior, { kind: 'reset-state' }>,
  now = Date.now(),
) => {
  const startingLocationId = resolveLocationId(state, context, policy?.locationId ?? 'starting-location');
  const preserve = policy?.preserve ?? {};
  const preservedVariableIds = Array.from(new Set([...(preserve.variableIds ?? []), ...legacyFlagVariables(preserve.flagIds)]));
  const initial = ensureWorldState(createInitialPlayState(state.universeId, startingLocationId), context);
  let next = {
    ...initial,
    inventory: {
      ...initial.inventory,
      ...(preserve.inventory ? state.inventory : {}),
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
    collectionLog: preserve.collectionLog ? state.collectionLog : initial.collectionLog,
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
    runId: state.runId,
    lastTickAt: now,
  };

  next = restoreStateVariables(next, state, context, preservedVariableIds);

  const incrementVariable = policy?.incrementVariable ?? (policy?.incrementFlagId ? `flag:${policy.incrementFlagId}` : undefined);
  if (incrementVariable) {
    next = writeStateVariable(next, incrementVariable, Number(readStateVariable(state, incrementVariable, context) ?? 0) + 1);
  }

  return appendRunLog(syncLegacyHealth(next), 'engine', 'state.reset', {
    incrementVariable: incrementVariable ?? '',
    incrementedValue: incrementVariable ? readStateVariable(next, incrementVariable, context) : 0,
    locationId: startingLocationId,
    preservedInventory: preserve.inventory === true,
    preservedInventoryIds: preserve.inventoryIds ?? [],
    preservedCollectionLog: preserve.collectionLog === true,
    preservedResourceIds: preserve.resourceIds ?? [],
    preservedVariableIds,
  }, now);
};

const applyResourceBehaviors = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  resourceId: string,
  behaviors: ResourceBoundaryBehavior[],
  now: number,
  options: { random?: () => number } = {},
) => {
  let nextState = state;

  for (const behavior of behaviors) {
    if (behavior.kind === 'stop-action') {
      nextState = stopRunningAction(nextState, now, context);
    }

    if (behavior.kind === 'complete-action') {
      nextState = completeActiveActionWithMessage(nextState, context, options, now);
    }

    if (behavior.kind === 'enemy-attack') {
      nextState = applyEnemyAttackWithMessage(nextState, context, options, now);
    }

    if (behavior.kind === 'refill') {
      const resource = getRuntimeResourcePool(nextState, context, resourceId);

      if (resource) {
        const value = behavior.value === 'min'
          ? resource.min
          : behavior.value === 'max'
            ? resource.max
            : behavior.value;
        nextState = setResourceCurrent(nextState, context, resourceId, value);
      }
    }

    if (behavior.kind === 'relocate') {
      const locationId = resolveLocationId(nextState, context, behavior.locationId);
      nextState = exploreLocation(nextState, locationId);
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
  options: { random?: () => number; effectId?: string; sourceStat?: string } = {},
) => {
  const definition = getResourceDefinition(context, resourceId);
  const resource = getRuntimeResourcePool(state, context, resourceId);

  if (!definition || !resource || delta === 0) {
    return state;
  }

  let nextState = state;
  let remaining = delta;
  const direction = delta > 0 ? 'full' : 'empty';
  let processedBoundaries = 0;

  while (Math.abs(remaining) > 0.000001 && processedBoundaries < 1000) {
    const currentResource = getRuntimeResourcePool(nextState, context, resourceId);
    if (!currentResource) return nextState;

    const previous = currentResource.current;
    const boundary = remaining > 0 ? currentResource.max : currentResource.min;
    const distance = boundary - previous;
    const alreadyAtBoundary = remaining > 0
      ? previous >= currentResource.max
      : previous <= currentResource.min;
    const reachesBoundary = alreadyAtBoundary || (remaining > 0
      ? previous < currentResource.max && remaining >= distance
      : previous > currentResource.min && remaining <= distance);
    const applied = alreadyAtBoundary ? 0 : reachesBoundary ? distance : remaining;
    const nextValue = Math.min(currentResource.max, Math.max(currentResource.min, previous + applied));

    nextState = setResourceCurrent(nextState, context, resourceId, nextValue);
    nextState = emitResourceExperienceEvents(nextState, context, resourceId, applied, now, {
      effectId: options.effectId,
      sourceStat: options.sourceStat,
    });
    nextState = appendRunLog(nextState, 'engine', 'resource.change', {
      resourceId,
      requestedDelta: delta,
      appliedDelta: applied,
      previous,
      current: nextValue,
    }, now);

    if (!reachesBoundary) {
      return nextState;
    }

    remaining -= applied;
    const beforeBehaviors = getRuntimeResourcePool(nextState, context, resourceId)?.current;
    nextState = applyResourceBehaviors(
      nextState,
      context,
      resourceId,
      direction === 'full' ? definition.onFull ?? [] : definition.onEmpty ?? [],
      now,
      options,
    );
    processedBoundaries += 1;

    if (!nextState.activeAction) {
      return nextState;
    }

    const afterBehaviors = getRuntimeResourcePool(nextState, context, resourceId)?.current;
    if (beforeBehaviors === afterBehaviors) {
      return nextState;
    }
  }

  return nextState;
};

const applyActiveEffects = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  now: number,
  options: { random?: () => number } = {},
) => {
  if (!state.activeAction) {
    return state;
  }

  return (context.effects ?? []).reduce((nextState, effect) => {
    if (!nextState.activeAction) {
      return nextState;
    }

    if (!isEffectApplicable(context, nextState, effect)) {
      return nextState;
    }

    const effectUntil = Math.min(now, nextState.activeAction.completesAt);
    const effectStartedAt = nextState.lastTickAt ?? effectUntil;
    const elapsedMs = Math.max(0, effectUntil - effectStartedAt);
    const elapsedMinutes = elapsedMs / 60_000;

    if (elapsedMinutes <= 0) {
      return nextState;
    }

    const delta = getEffectDeltaPerMinute(context, nextState, effect) * elapsedMinutes;
    const resource = getRuntimeResourcePool(nextState, context, effect.resourceId);
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
      { ...options, effectId: effect.id, sourceStat: effect.sourceStat },
    );
  }, state);
};

export const startAction = (
  state: UniversePlayState,
  action: GameAction,
  contextOrNow: ActionResolutionContext | number = EMPTY_CONTEXT,
  maybeNow = Date.now(),
  options: { random?: () => number; recipeId?: string } = {},
): UniversePlayState => {
  const context = typeof contextOrNow === 'number' ? EMPTY_CONTEXT : contextOrNow;
  const now = typeof contextOrNow === 'number' ? contextOrNow : maybeNow;
  state = ensureWorldState(state, context);

  const sameActiveAction = state.activeAction?.actionId === action.id
    && (action.stationId === undefined || state.activeAction?.recipeId === options.recipeId);

  if (sameActiveAction) {
    return appendRunLog(pauseRunningAction(state, now, context), 'player', 'action.pause', { actionId: action.id }, now);
  }

  const resolvedAction = action.stationId ? resolveStationAction(action, options.recipeId, context) : action;

  if (!canStartAction(state, resolvedAction, context)) {
    return appendRunLog(state, 'player', 'action.rejected', {
      actionId: action.id,
      exhausted: isActionExhausted(state, action),
    }, now);
  }

  const pausedState = pauseRunningAction(state, now, context);
  if (isInstantAction(resolvedAction)) {
    const started = appendRunLog(pausedState, 'player', 'action.start', { actionId: action.id, locationId: action.locationId }, now);
    return completeActionWithResult(started, resolvedAction, context, { random: options.random ?? Math.random }, now).state;
  }
  const durationMs = getActionDurationMs(pausedState, resolvedAction, context);
  const savedProgress = pausedState.actionProgress[action.id] ?? { elapsedMs: 0, runningSince: null };
  const progressMatchesRecipe = action.stationId === undefined || savedProgress.recipeId === options.recipeId;
  const progress = !progressMatchesRecipe || savedProgress.elapsedMs >= durationMs
    ? {
        elapsedMs: 0,
        runningSince: null,
        targetHealth: null,
      }
    : savedProgress;
  const remainingMs = Math.max(0, durationMs - progress.elapsedMs);
  const enemy = getEnemy(resolvedAction, context);
  const completesAt = enemy ? now + CONTINUOUS_ACTION_MAX_MS : now + remainingMs;

  return appendRunLog({
    ...pausedState,
    activeAction: {
      actionId: action.id,
      startedAt: now,
      completesAt,
      targetHealth: progress.targetHealth ?? (enemy ? getEnemyStat(enemy, 'health') : null),
      recipeId: options.recipeId,
    },
    actionProgress: {
      ...pausedState.actionProgress,
      [action.id]: {
        ...progress,
        runningSince: now,
        targetHealth: progress.targetHealth ?? (enemy ? getEnemyStat(enemy, 'health') : null),
        recipeId: options.recipeId,
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
  recipeId?: string,
) => {
  const completesAt = getEnemy(action, context)
    ? now + CONTINUOUS_ACTION_MAX_MS
    : now + getActionDurationMs(state, action, context);

  return {
    ...state,
    activeAction: {
      actionId: action.id,
      startedAt: now,
      completesAt,
      targetHealth,
      recipeId,
    },
    actionProgress: {
      ...state.actionProgress,
      [action.id]: {
        elapsedMs: 0,
        runningSince: now,
        targetHealth,
        recipeId,
      },
    },
    lastTickAt: now,
  };
};

export const startTravel = (
  state: UniversePlayState,
  path: AvailableTravelEdge[],
  now = Date.now(),
): UniversePlayState => {
  const firstEdge = path[0];
  if (!firstEdge) {
    return state;
  }
  const pausedState = pauseRunningAction(state, now);
  const pathLocationIds = [state.currentLocationId, ...path.map((edge) => edge.target)];
  const totalMs = path.reduce((sum, edge) => sum + edge.travelTimeSeconds * 1000, 0);

  return appendRunLog({
    ...pausedState,
    activeTravel: {
      actionId: firstEdge.action.id,
      fromLocationId: state.currentLocationId,
      toLocationId: firstEdge.target,
      finalLocationId: pathLocationIds[pathLocationIds.length - 1],
      startedAt: now,
      completesAt: now + firstEdge.travelTimeSeconds * 1000,
      pathStartedAt: now,
      pathCompletesAt: now + totalMs,
      pathLocationIds,
      pathActionIds: path.map((edge) => edge.action.id),
      pathSegmentDurationsSeconds: path.map((edge) => edge.travelTimeSeconds),
      pathIndex: 0,
    },
    activeAction: null,
    lastTickAt: now,
  }, 'player', 'travel.start', {
    actionId: firstEdge.action.id,
    pathActionIds: path.map((edge) => edge.action.id),
    pathLocationIds,
    fromLocationId: state.currentLocationId,
    toLocationId: firstEdge.target,
    finalLocationId: pathLocationIds[pathLocationIds.length - 1],
  }, now);
};

type ActionCompletionResult = {
  state: UniversePlayState;
  finished: boolean;
  outcome: 'basicSuccess' | 'hit' | 'miss' | 'kill' | 'chanceFailure';
  damage: number;
  remainingHealth: number | null;
  rewards: ConcreteReward[];
};

const occupiedInventorySlots = (inventory: Record<string, number>) =>
  Object.values(inventory).filter((amount) => amount > 0).length;

export const applyItemDelta = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  itemId: string,
  amount: number,
) => {
  const definition = context.items?.find((item) => item.id === itemId);
  const current = state.inventory[itemId] ?? 0;
  const maxSlots = context.manifest?.maxInventorySlots;
  if (amount > 0 && current <= 0 && maxSlots !== undefined && occupiedInventorySlots(state.inventory) >= maxSlots) {
    return state;
  }
  const next = Math.max(0, Math.min(definition?.maxQuantity ?? Number.POSITIVE_INFINITY, current + amount));
  return {
    ...state,
    inventory: { ...state.inventory, [itemId]: next },
    resources: { ...state.resources, [itemId]: next },
  };
};

const applyBankDelta = (
  state: UniversePlayState,
  itemId: string,
  amount: number,
): UniversePlayState => {
  const current = state.bank[itemId] ?? 0;
  const next = Math.max(0, current + amount);
  return { ...state, bank: { ...state.bank, [itemId]: next } };
};

export const depositToBank = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  itemId: string,
  amount: number,
): UniversePlayState => {
  const available = Math.min(amount, state.inventory[itemId] ?? 0);
  if (available <= 0) return state;
  return applyBankDelta(applyItemDelta(state, context, itemId, -available), itemId, available);
};

export const withdrawFromBank = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  itemId: string,
  amount: number,
): UniversePlayState => {
  const available = Math.min(amount, state.bank[itemId] ?? 0);
  if (available <= 0) return state;
  return applyItemDelta(applyBankDelta(state, itemId, -available), context, itemId, available);
};

export const setCharacterName = (
  state: UniversePlayState,
  name: string,
  now = Date.now(),
): UniversePlayState => ({ ...state, characterName: name, lastTickAt: now });

export const closeModal = (
  state: UniversePlayState,
  now = Date.now(),
): UniversePlayState => (state.openModalId ? { ...state, openModalId: null, lastTickAt: now } : state);

const findDialogue = (context: ActionResolutionContext, dialogueId: string) =>
  context.dialogues?.find((dialogue) => dialogue.id === dialogueId) ?? null;

const findDialogueNode = (context: ActionResolutionContext, dialogueId: string, nodeId: string) =>
  findDialogue(context, dialogueId)?.nodes.find((node) => node.id === nodeId) ?? null;

export const cancelDialogue = (state: UniversePlayState, now = Date.now()): UniversePlayState =>
  state.activeDialogue ? { ...state, activeDialogue: null, lastTickAt: now } : state;

const enterDialogueNode = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  dialogueId: string,
  nodeId: string,
  now: number,
  visited = new Set<string>(),
): UniversePlayState => {
  const visitKey = `${dialogueId}:${nodeId}`;
  if (visited.has(visitKey)) return { ...state, activeDialogue: { dialogueId, nodeId }, lastTickAt: now };
  visited.add(visitKey);

  const node = findDialogueNode(context, dialogueId, nodeId);
  if (!node) return cancelDialogue(state, now);

  const changed = applyResults(state, node.results, context, now);
  const branch = (node.branches ?? []).find((candidate) => evaluateCondition(candidate.conditions, changed, context));
  if (branch) return enterDialogueNode(changed, context, dialogueId, branch.gotoNodeId, now, visited);
  if (!node.textKey && !node.narratorKey && (!node.options || node.options.length === 0) && node.gotoNodeId) {
    return enterDialogueNode(changed, context, dialogueId, node.gotoNodeId, now, visited);
  }
  return { ...changed, activeDialogue: { dialogueId, nodeId }, lastTickAt: now };
};

export const startDialogue = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  dialogueId: string,
  now = Date.now(),
): UniversePlayState => {
  const dialogue = findDialogue(context, dialogueId);
  return dialogue ? enterDialogueNode(state, context, dialogue.id, dialogue.startNodeId, now) : state;
};

export const chooseDialogueOption = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  optionId?: string,
  now = Date.now(),
): UniversePlayState => {
  const active = state.activeDialogue;
  if (!active) return state;
  const node = findDialogueNode(context, active.dialogueId, active.nodeId);
  if (!node) return cancelDialogue(state, now);

  if (node.options && node.options.length > 0) {
    const option = node.options.find((candidate) => candidate.id === optionId);
    if (!option || (option.conditions && !evaluateCondition(option.conditions, state, context))) return state;
    const changed = applyResults(state, option.results, context, now);
    return option.gotoNodeId
      ? enterDialogueNode(changed, context, active.dialogueId, option.gotoNodeId, now)
      : cancelDialogue(changed, now);
  }

  return node.gotoNodeId
    ? enterDialogueNode(state, context, active.dialogueId, node.gotoNodeId, now)
    : cancelDialogue(state, now);
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
    return applySkillXpResult(state, context, result.skillId, result.amount, now);
  }
  if (result.kind === 'state-variable') {
    return writeStateVariable(state, result.variable, result.value);
  }
  if (result.kind === 'state-variable-delta') {
    const current = readStateVariable(state, result.variable, context);
    return writeStateVariable(state, result.variable, (typeof current === 'number' ? current : 0) + result.amount);
  }
  if (result.kind === 'flag') {
    const flags = { ...state.flags, [result.flagId]: result.value };
    const flagExpirations = { ...state.flagExpirations };
    if (result.expiresAfterSeconds !== undefined) {
      flagExpirations[result.flagId] = now + result.expiresAfterSeconds * 1000;
    } else {
      delete flagExpirations[result.flagId];
    }
    return { ...state, flags, flagExpirations };
  }
  if (result.kind === 'relocate') {
    const locationId = resolveLocationId(state, context, result.locationId);
    return {
      ...exploreLocation(state, locationId),
      activeTravel: null,
    };
  }
  if (result.kind === 'dialogue') {
    return startDialogue(state, context, result.dialogueId, now);
  }
  if (result.kind === 'bank-deposit') {
    return depositToBank(state, context, result.itemId, result.amount);
  }
  if (result.kind === 'bank-withdraw') {
    return withdrawFromBank(state, context, result.itemId, result.amount);
  }
  if (result.kind === 'set-spawn') {
    return { ...state, spawnLocationId: resolveLocationId(state, context, result.locationId) };
  }
  if (result.kind === 'open-modal') {
    return { ...state, openModalId: result.modalId, lastTickAt: now };
  }
  return appendChatMessage(
    state,
    { author: 'system', key: result.messageKey },
    now + (result.delaySeconds ?? 0) * 1000,
  );
};

const applyResults = (
  state: UniversePlayState,
  results: ActionResult[] | undefined,
  context: ActionResolutionContext,
  now: number,
) => (results ?? []).reduce(
  (nextState, result) => applyActionResult(nextState, result, context, now),
  state,
);

const appendExhaustedLocationMessage = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  now: number,
) => {
  if (action.role !== 'optional' || !action.locationId) return state;
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
  random: () => number = Math.random,
) => rollRewards(rewards, random, context.dropTables ?? []).reduce((nextState, reward) => {
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

const rollAndApplyRewards = (
  state: UniversePlayState,
  rewards: Reward[],
  context: ActionResolutionContext,
  now: number,
  random: () => number = Math.random,
) => {
  const rolled = rollRewards(rewards, random, context.dropTables ?? []);
  return {
    rewards: rolled,
    state: rolled.reduce((nextState, reward) => {
      if (reward.kind === 'skillXp') return applyActionResult(nextState, { kind: 'skill-xp', skillId: reward.skillId, amount: reward.amount }, context, now);
      if (reward.kind === 'item') return applyActionResult(nextState, { kind: 'item', itemId: reward.itemId, amount: reward.amount }, context, now);
      const resourceExists = context.resourceDefinitions?.some((resource) => resource.id === reward.resourceId);
      return applyActionResult(nextState, resourceExists
        ? { kind: 'resource', resourceId: reward.resourceId, amount: reward.amount }
        : { kind: 'item', itemId: reward.resourceId, amount: reward.amount }, context, now);
    }, state),
  };
};

const applyActionCompletion = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  now: number,
  options: { emitActionComplete?: boolean; random?: () => number } = {},
) => {
  const rewardResult = rollAndApplyRewards(state, action.rewards, context, now, options.random);
  const rewarded = rewardResult.state;
  const changed = applyResults(rewarded, action.results, context, now);
  const withExperience = options.emitActionComplete === false
    ? changed
    : emitExperienceEvent(changed, action, context, {
        kind: 'action-complete',
        amount: 1,
        actionId: action.id,
        enemyId: action.enemyId,
        interactionTypeId: getInteractionType(action, context)?.id ?? action.interactionTypeId,
      }, now);

  return {
    rewards: rewardResult.rewards,
    state: appendRunLog({
      ...withExperience,
      actionCompletions: {
        ...withExperience.actionCompletions,
        [action.id]: (withExperience.actionCompletions[action.id] ?? 0) + 1,
      },
    }, 'engine', 'action.complete', {
      actionId: action.id,
      completion: (withExperience.actionCompletions[action.id] ?? 0) + 1,
      results: action.results ?? [],
      rewards: rewardResult.rewards,
    }, now),
  };
};

const completeActionWithResult = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext = EMPTY_CONTEXT,
  options: { random?: () => number } = {},
  now = Date.now(),
): ActionCompletionResult => {
  const recipeId = state.activeAction?.recipeId;
  state = applyManifestRuntimeSettings(state, context);
  let damage = 0;
  let remainingHealth: number | null = null;
  const enemy = getEnemy(action, context);

  if (enemy) {
    const result = sampleAdversarialDamage(state, action, context, options.random);
    damage = result?.damage ?? 0;
    const currentHealth = getRuntimeResourcePool(state, context, ENEMY_HEALTH_RESOURCE_ID)?.current
      ?? state.activeAction?.targetHealth
      ?? getEnemyStat(enemy, 'health');
    const targetHealth = Math.max(0, currentHealth - damage);
    remainingHealth = targetHealth;

    if (damage <= 0) {
      const missedState = emitExperienceEvent(state, action, context, {
        kind: 'action-complete',
        amount: 1,
        actionId: action.id,
        enemyId: enemy.id,
        interactionTypeId: getInteractionType(action, context)?.id ?? action.interactionTypeId,
      }, now);
      return {
        state: restartAction(missedState, action, context, now, currentHealth, recipeId),
        finished: false,
        outcome: 'miss',
        damage,
        remainingHealth: currentHealth,
        rewards: [],
      };
    }

    const damagedState = getResourceDefinition(context, ENEMY_HEALTH_RESOURCE_ID)
      ? applyResourceDelta(state, context, ENEMY_HEALTH_RESOURCE_ID, -damage, now, options)
      : emitExperienceEvent(state, action, context, {
          kind: 'damage-dealt',
          amount: damage,
          actionId: action.id,
          enemyId: enemy.id,
          interactionTypeId: getInteractionType(action, context)?.id ?? action.interactionTypeId,
          resourceId: ENEMY_HEALTH_RESOURCE_ID,
        }, now);

    if (targetHealth > 0) {
      const completedHitState = emitExperienceEvent(damagedState, action, context, {
        kind: 'action-complete',
        amount: 1,
        actionId: action.id,
        enemyId: enemy.id,
        interactionTypeId: getInteractionType(action, context)?.id ?? action.interactionTypeId,
      }, now);
      const hitRewards = rollAndApplyRewards(completedHitState, action.rewards, context, now, options.random);
      const loggedHitState = appendRunLog(hitRewards.state, 'engine', 'action.complete', {
        actionId: action.id,
        outcome: 'hit',
        rewards: hitRewards.rewards,
      }, now);
      return {
        state: restartAction(loggedHitState, action, context, now, targetHealth, recipeId),
        finished: false,
        outcome: 'hit',
        damage,
        remainingHealth,
        rewards: hitRewards.rewards,
      };
    }

    const actionCompletion = applyActionCompletion(damagedState, action, context, now, { random: options.random });
    const enemyRewards = rollAndApplyRewards(actionCompletion.state, enemy.rewards, context, now, options.random);
    const killRewards = [...actionCompletion.rewards, ...enemyRewards.rewards];
    state = applyCollectionLogRewards(enemyRewards.state, action, context, killRewards);
    const resolvedState = resetOwnedResourcePools(state, context, 'enemy');
    const completedState = {
      ...resolvedState,
      activeAction: null,
      actionProgress: {
        ...resolvedState.actionProgress,
        [action.id]: {
          elapsedMs: 0,
          runningSince: null,
          targetHealth: null,
        },
      },
      lastTickAt: now,
    };
    const startsDialogue = (action.results ?? []).some((result) => result.kind === 'dialogue');
    const shouldLoop = !startsDialogue
    && !isInstantAction(action)
    && completedState.actionLoopingEnabled
      && (action.locationId === undefined || completedState.currentLocationId === action.locationId)
      && canStartAction(completedState, action, context);
    const restartTargetHealth = getEnemyStat(enemy, 'health');

    return {
      state: shouldLoop ? restartAction(completedState, action, context, now, restartTargetHealth, recipeId) : completedState,
      finished: true,
      outcome: 'kill',
      damage,
      remainingHealth,
      rewards: killRewards,
    };
  }

  if (action.chance !== undefined) {
    const random = options.random ?? Math.random;
    const roll = random() * 100;
    if (roll >= action.chance) {
      const failedState = applyResults(state, action.failureResults, context, now);
      const nextCompletionCount = (failedState.actionCompletions[action.id] ?? 0) + 1;
      const completedFailureState = {
        ...failedState,
        activeAction: null,
        actionProgress: {
          ...failedState.actionProgress,
          [action.id]: {
            elapsedMs: 0,
            runningSince: null,
            targetHealth: null,
          },
        },
        actionCompletions: {
          ...failedState.actionCompletions,
          [action.id]: nextCompletionCount,
        },
        lastTickAt: now,
      };

      return {
        state: appendRunLog(completedFailureState, 'engine', 'action.complete', {
          actionId: action.id,
          completion: nextCompletionCount,
          outcome: 'chanceFailure',
        }, now),
        finished: true,
        outcome: 'chanceFailure',
        damage,
        remainingHealth,
        rewards: [],
      };
    }
  }

  const actionCompletion = applyActionCompletion(state, action, context, now, { random: options.random });
  const resolvedState = applyCollectionLogRewards(actionCompletion.state, action, context, actionCompletion.rewards);
  const completedState = {
    ...resolvedState,
    activeAction: null,
    actionProgress: {
      ...resolvedState.actionProgress,
      [action.id]: {
        elapsedMs: 0,
        runningSince: null,
        targetHealth: null,
      },
    },
    lastTickAt: now,
  };
  const startsDialogue = (action.results ?? []).some((result) => result.kind === 'dialogue');
  const shouldLoop = !startsDialogue
    && !isInstantAction(action)
    && completedState.actionLoopingEnabled
    && (action.locationId === undefined || completedState.currentLocationId === action.locationId)
    && canStartAction(completedState, action, context);
  const restartTargetHealth = null;

  return {
    state: shouldLoop ? restartAction(completedState, action, context, now, restartTargetHealth, recipeId) : completedState,
    finished: true,
    outcome: 'basicSuccess',
    damage,
    remainingHealth,
    rewards: actionCompletion.rewards,
  };
};

export const completeAction = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext = EMPTY_CONTEXT,
  options: { random?: () => number } = {},
  now = Date.now(),
): UniversePlayState => completeActionWithResult(state, action, context, options, now).state;

const applyEnemyAttackWithMessage = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  options: { random?: () => number },
  now: number,
) => {
  const action = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);
  if (!state.activeAction || !action) {
    return state;
  }

  const enemy = getEnemy(action, context);
  const interactionType = getInteractionType(action, context);
  const attack = sampleEnemyAttackDamage(state, action, context, options.random);
  const damage = attack?.damage ?? 0;
  const health = state.resourcePools[HEALTH_RESOURCE_ID];
  const isKill = Boolean(health && damage > 0 && health.current - damage <= health.min);
  let nextState = state;

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
    }, now);
  }

  if (enemy && interactionType && attack && damage <= 0) {
    nextState = emitExperienceEvent(nextState, action, context, {
      kind: 'incoming-attack-missed',
      amount: 1,
      actionId: action.id,
      enemyId: enemy.id,
      interactionTypeId: interactionType.id,
      resourceId: HEALTH_RESOURCE_ID,
    }, now);
  }

  return applyResourceDelta(nextState, context, HEALTH_RESOURCE_ID, -damage, now, options);
};

const rewardLabelId = (reward: ConcreteReward) => reward.kind === 'resource'
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

function completeActiveActionWithMessage(
  state: UniversePlayState,
  context: ActionResolutionContext = EMPTY_CONTEXT,
  options: { random?: () => number } = {},
  now = Date.now(),
): UniversePlayState {
  const foundAction = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);
  const action = foundAction ? resolveStationAction(foundAction, state.activeAction?.recipeId, context) : foundAction;

  if (!state.activeAction || !action || !isActionAvailableAtCurrentLocation(state, action, context) || !areActionRequirementsMet(state, action, context)) {
    return state.activeAction && action
      ? appendRunLog(stopRunningAction(state, now, context), 'engine', 'action.requirements-failed', { actionId: action.id }, now)
      : state;
  }

  const completion = completeActionWithResult(state, action, context, options, now);
  const enemy = getEnemy(action, context);
  const messageKey = getActionMessage(action, context, completion.outcome);
  const completed = messageKey
    ? appendChatMessage(completion.state, {
        author: 'system',
        key: messageKey,
        params: {
          entity: action.entityId ?? enemy?.id ?? action.id,
          actionId: action.id,
          target: enemy?.id ?? action.id,
          damage: roundCombatNumber(completion.damage),
        },
      }, now)
    : completion.state;

  return completion.finished
    ? appendExhaustedLocationMessage(completed, action, context, now)
    : completed;
}

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

const completeDueTravelSegments = (
  state: UniversePlayState,
  now: number,
) => {
  let nextState = state;
  let completedReport: Extract<IdleReport, { kind: 'travelCompleted' }> | null = null;

  while (nextState.activeTravel && nextState.activeTravel.completesAt <= now) {
    const activeTravel = nextState.activeTravel;
    const destinationLocationId = activeTravel.toLocationId;
    const completedAt = activeTravel.completesAt;
    const nextPathIndex = activeTravel.pathIndex + 1;
    const nextSegmentTarget = activeTravel.pathLocationIds[nextPathIndex + 1];
    const segmentCompletedState = appendRunLog({
      ...exploreLocation(nextState, destinationLocationId),
      activeTravel: null,
      lastTickAt: completedAt,
    }, 'engine', 'travel.complete-segment', {
      actionId: activeTravel.actionId,
      fromLocationId: activeTravel.fromLocationId,
      toLocationId: activeTravel.toLocationId,
      finalLocationId: activeTravel.finalLocationId,
      pathIndex: activeTravel.pathIndex,
    }, completedAt);

    if (nextSegmentTarget) {
      const nextStartedAt = completedAt;
      const nextDurationSeconds = activeTravel.pathSegmentDurationsSeconds[nextPathIndex] ?? 0;
      nextState = appendRunLog({
        ...segmentCompletedState,
        activeTravel: {
          ...activeTravel,
          actionId: activeTravel.pathActionIds[nextPathIndex],
          fromLocationId: destinationLocationId,
          toLocationId: nextSegmentTarget,
          startedAt: nextStartedAt,
          completesAt: nextStartedAt + nextDurationSeconds * 1000,
          pathIndex: nextPathIndex,
        },
        lastTickAt: completedAt,
      }, 'engine', 'travel.start-segment', {
        actionId: activeTravel.pathActionIds[nextPathIndex],
        fromLocationId: destinationLocationId,
        toLocationId: nextSegmentTarget,
        finalLocationId: activeTravel.finalLocationId,
        pathIndex: nextPathIndex,
      }, completedAt);
      continue;
    }

    nextState = appendRunLog(segmentCompletedState, 'engine', 'travel.complete', {
      actionId: activeTravel.actionId,
      fromLocationId: activeTravel.pathLocationIds[0],
      toLocationId: activeTravel.finalLocationId,
      pathLocationIds: activeTravel.pathLocationIds,
    }, completedAt);
    completedReport = {
      kind: 'travelCompleted',
      inactiveMs: 0,
      fromLocationId: activeTravel.pathLocationIds[0],
      toLocationId: activeTravel.finalLocationId,
      completedAt,
    };
  }

  return { state: nextState, completedReport };
};

const clearExpiredFlags = (state: UniversePlayState, now: number): UniversePlayState => {
  const expirations = state.flagExpirations ?? {};
  const expiredIds = Object.entries(expirations).filter(([, expiresAt]) => expiresAt <= now).map(([flagId]) => flagId);
  if (expiredIds.length === 0) return state;

  const flags = { ...state.flags };
  const flagExpirations = { ...expirations };
  for (const flagId of expiredIds) {
    flags[flagId] = false;
    delete flagExpirations[flagId];
  }

  return { ...state, flags, flagExpirations };
};

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
  state = clearExpiredFlags(state, now);
  if (!state.activeAction) {
    state = resetInactiveEffectResources(state, context, now);
  }
  state = applyActiveEffects(state, context, now, { random: options.random });

  const travelCompletion = completeDueTravelSegments(state, now);
  state = travelCompletion.state;
  if (travelCompletion.completedReport) {
    const report: IdleReport = reportEnabled
      ? {
          ...travelCompletion.completedReport,
          inactiveMs,
        }
      : noIdleReport();

    return {
      state: options.debugEnabled && report.kind !== 'none' ? appendIdleDebugMessage(state, report, now) : state,
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

  let action = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);

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

  if (action.stationId) {
    action = resolveStationAction(action, state.activeAction.recipeId, context);
  }

  if (isInstantAction(action)) {
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
          completedAt: now,
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
  }

  if (getEnemy(action, context) && state.activeAction.completesAt <= now) {
    const capped = stopRunningAction(state, state.activeAction.completesAt, context);
    const report: IdleReport = reportEnabled
      ? {
          kind: 'actionFailed',
          inactiveMs,
          actionId: action.id,
          completedAt: state.activeAction.completesAt,
        }
      : noIdleReport();

    return {
      state: options.debugEnabled && report.kind !== 'none' ? appendIdleDebugMessage(capped, report, now) : capped,
      report,
    };
  }

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

  if (!isActionAvailableAtCurrentLocation(state, action, context) || !areActionRequirementsMet(state, action, context)) {
    const failed = appendRunLog(stopRunningAction(state, now, context), 'engine', 'action.requirements-failed', { actionId: action.id }, now);
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
