import type { GameAction, TravelEdgeDefinition, UniversePlayState } from './types';

export const createInitialPlayState = (universeId: string, startingLocationId: string): UniversePlayState => ({
  universeId,
  currentLocationId: startingLocationId,
  discoveredLocationIds: [startingLocationId],
  activeAction: null,
  activeTravel: null,
  resources: {},
  skillXp: {},
  lastTickAt: Date.now(),
});

export const normalizePlayState = (
  state: UniversePlayState,
  universeId: string,
  startingLocationId: string,
): UniversePlayState => ({
  ...createInitialPlayState(universeId, startingLocationId),
  ...state,
  activeAction: state.activeAction ?? null,
  activeTravel: state.activeTravel ?? null,
});

export const startAction = (
  state: UniversePlayState,
  action: GameAction,
  now = Date.now(),
): UniversePlayState => ({
  ...state,
  activeAction: {
    actionId: action.id,
    startedAt: now,
    completesAt: now + action.durationSeconds * 1000,
  },
  lastTickAt: now,
});

export const startTravel = (
  state: UniversePlayState,
  edge: TravelEdgeDefinition,
  destinationLocationId: string,
  now = Date.now(),
): UniversePlayState => ({
  ...state,
  activeTravel: {
    edgeId: edge.id,
    fromLocationId: state.currentLocationId,
    toLocationId: destinationLocationId,
    startedAt: now,
    completesAt: now + edge.travelTimeSeconds * 1000,
  },
  activeAction: null,
  lastTickAt: now,
});

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
    resources,
    skillXp,
    lastTickAt: now,
  };
};

export const resolveDueTimers = (
  state: UniversePlayState,
  actions: GameAction[],
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
    return {
      ...state,
      activeAction: null,
      lastTickAt: now,
    };
  }

  return completeAction(state, action, now);
};

export const skillLevelFromXp = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 10)) + 1;
