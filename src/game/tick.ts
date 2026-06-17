import type { GameAction, UniversePlayState } from './types';

export const createInitialPlayState = (universeId: string, startingLocationId: string): UniversePlayState => ({
  universeId,
  currentLocationId: startingLocationId,
  discoveredLocationIds: [startingLocationId],
  activeAction: null,
  resources: {},
  skillXp: {},
  lastTickAt: Date.now(),
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

export const advanceTick = (
  state: UniversePlayState,
  actions: GameAction[],
  now = Date.now(),
): UniversePlayState => {
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
