import { areActionRequirementsMet, isActionVisible } from './conditions';
import { resolveManifestUiSettings } from './universeSettings';
import type { ActionResolutionContext, ContentBundle, GameAction, UniversePlayState } from './types';

export type AvailableTravelEdge = {
  action: GameAction;
  id: string;
  source: string;
  target: string;
  travelTimeSeconds: number;
};

export type TravelPathResult =
  | { status: 'found'; edges: AvailableTravelEdge[]; totalSeconds: number }
  | { status: 'not-found' }
  | { status: 'too-far' };

export const travelEdgeId = (action: Pick<GameAction, 'id'>) => `travel:${action.id}`;

export const getPureTravelDestination = (action: GameAction) => {
  const results = action.results ?? [];
  const relocate = results[0];

  if (
    action.role !== 'travel' ||
    !action.locationId ||
    action.rewards.length > 0 ||
    results.length !== 1 ||
    relocate?.kind !== 'relocate' ||
    action.experience?.length ||
    action.enemyId ||
    action.interactionTypeId
  ) {
    return null;
  }

  return relocate.locationId;
};

export const isPureTravelAction = (action: GameAction) => getPureTravelDestination(action) !== null;

export const getAvailableTravelEdgesForNode = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  locationId: string,
): AvailableTravelEdge[] => {
  const nodeState = {
    ...state,
    currentLocationId: locationId,
  };

  return context.actions.flatMap((action) => {
    const destination = getPureTravelDestination(action);
    if (!destination || action.locationId !== locationId) {
      return [];
    }
    if (!isActionVisible(nodeState, action, context) || !areActionRequirementsMet(nodeState, action, context)) {
      return [];
    }
    return [{
      action,
      id: travelEdgeId(action),
      source: locationId,
      target: destination,
      travelTimeSeconds: action.durationSeconds ?? 0,
    }];
  });
};

export const getVisibleTravelGraph = (
  bundle: ContentBundle,
  playState: UniversePlayState,
  context: ActionResolutionContext,
) => {
  const explored = new Set(playState.discoveredLocationIds);
  const visibleLocationIds = new Set<string>(explored);
  const edges = playState.discoveredLocationIds.flatMap((locationId) => {
    const fromExploredNode = getAvailableTravelEdgesForNode(playState, context, locationId);
    for (const edge of fromExploredNode) {
      visibleLocationIds.add(edge.target);
    }
    return fromExploredNode;
  });

  if (playState.activeTravel) {
    for (const locationId of playState.activeTravel.pathLocationIds) {
      visibleLocationIds.add(locationId);
    }
  }

  return {
    locations: bundle.locations.filter((location) => visibleLocationIds.has(location.id)),
    edges: edges.filter((edge) => visibleLocationIds.has(edge.source) && visibleLocationIds.has(edge.target)),
  };
};

export const findTravelPath = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  targetLocationId: string,
): TravelPathResult => {
  if (state.currentLocationId === targetLocationId) {
    return { status: 'found', edges: [], totalSeconds: 0 };
  }

  const settings = resolveManifestUiSettings(context.manifest);
  const maxSeconds = settings.travelPathMaxSeconds;
  const maxNodes = settings.travelPathMaxNodes;
  const explored = new Set(state.discoveredLocationIds);
  const frontier: Array<{ locationId: string; edges: AvailableTravelEdge[]; totalSeconds: number }> = [
    { locationId: state.currentLocationId, edges: [], totalSeconds: 0 },
  ];
  const bestSeconds = new Map<string, number>([[state.currentLocationId, 0]]);
  let hitLimit = false;

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.totalSeconds - right.totalSeconds);
    const current = frontier.shift()!;

    if (current.locationId === targetLocationId) {
      return { status: 'found', edges: current.edges, totalSeconds: current.totalSeconds };
    }
    if (current.edges.length >= maxNodes) {
      hitLimit = true;
      continue;
    }

    for (const edge of getAvailableTravelEdgesForNode(state, context, current.locationId)) {
      const canTraverse = edge.target === targetLocationId || explored.has(edge.target);
      if (!canTraverse) {
        continue;
      }

      const totalSeconds = current.totalSeconds + edge.travelTimeSeconds;
      if (totalSeconds > maxSeconds) {
        hitLimit = true;
        continue;
      }

      const best = bestSeconds.get(edge.target);
      if (best !== undefined && best <= totalSeconds) {
        continue;
      }

      bestSeconds.set(edge.target, totalSeconds);
      frontier.push({
        locationId: edge.target,
        edges: [...current.edges, edge],
        totalSeconds,
      });
    }
  }

  return hitLimit ? { status: 'too-far' } : { status: 'not-found' };
};
