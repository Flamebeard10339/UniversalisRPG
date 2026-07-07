import { areActionRequirementsMet, isActionVisible } from './conditions';
import { getCharacterStatValue } from './characterStats';
import { resolveManifestUiSettings } from './universeSettings';
import type { ActionResolutionContext, ContentBundle, GameAction, LocationNode, Position, UniversePlayState } from './types';

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

export const MOVEMENT_SPEED_STAT_ID = 'movement-speed';
const DEFAULT_MOVEMENT_SPEED = 60;

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

// In a highly-connected universe every pair of grid-adjacent locations (same
// z-layer) is traversable by default; an authored `role: 'travel'` action
// between them is a wall, not a connection, and is only blocking while it is
// currently visible (so a wall can be conditionally torn down, e.g. once a
// quest flag is set — the exact inverse of an ordinary sparse-mode travel
// action being conditionally revealed).
export const isWallAction = (action: GameAction, context: Pick<ActionResolutionContext, 'manifest'>) =>
  isPureTravelAction(action) && resolveManifestUiSettings(context.manifest).connectivityMode === 'highly-connected';

const locationZ = (location: Pick<LocationNode, 'position'>) => location.position.z ?? 0;

const gridDistance = (from: Position, to: Position) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const computeTravelSeconds = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  from: Position,
  to: Position,
) => {
  const settings = resolveManifestUiSettings(context.manifest);
  const movementSpeed = getCharacterStatValue(
    state,
    context.stats ?? [],
    MOVEMENT_SPEED_STAT_ID,
    context.skills,
    context.items ?? [],
    context.manifest?.experienceCurve,
    context.statModifiers,
  ) || DEFAULT_MOVEMENT_SPEED;
  const distanceUnits = gridDistance(from, to) * settings.distanceBetweenAdjacentTiles;
  return distanceUnits / (movementSpeed / 60);
};

const isGridAdjacent = (from: Position, to: Position) => {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return dx <= 1 && dy <= 1 && (dx > 0 || dy > 0);
};

export const getAvailableTravelEdgesForNode = (
  state: UniversePlayState,
  context: ActionResolutionContext,
  locationId: string,
): AvailableTravelEdge[] => {
  const nodeState = {
    ...state,
    currentLocationId: locationId,
  };
  const sourceLocation = context.locations?.find((location) => location.id === locationId);
  if (!sourceLocation) return [];

  const buildEdge = (targetLocation: LocationNode, action: GameAction): AvailableTravelEdge => ({
    action,
    id: travelEdgeId(action),
    source: locationId,
    target: targetLocation.id,
    travelTimeSeconds: computeTravelSeconds(nodeState, context, sourceLocation.position, targetLocation.position),
  });

  const settings = resolveManifestUiSettings(context.manifest);

  if (settings.connectivityMode !== 'highly-connected') {
    return context.actions.flatMap((action) => {
      const destination = getPureTravelDestination(action);
      if (!destination || action.locationId !== locationId) {
        return [];
      }
      if (!isActionVisible(nodeState, action, context) || !areActionRequirementsMet(nodeState, action, context)) {
        return [];
      }
      const targetLocation = context.locations?.find((location) => location.id === destination);
      if (!targetLocation) return [];
      return [buildEdge(targetLocation, action)];
    });
  }

  const z = locationZ(sourceLocation);
  const neighbors = (context.locations ?? []).filter((candidate) =>
    candidate.id !== locationId && locationZ(candidate) === z && isGridAdjacent(sourceLocation.position, candidate.position));

  return neighbors.flatMap((targetLocation) => {
    const wallAction = context.actions.find((action) =>
      action.locationId === locationId && getPureTravelDestination(action) === targetLocation.id);
    if (wallAction && isActionVisible(nodeState, wallAction, context)) {
      return [];
    }
    const action: GameAction = wallAction ?? {
      id: `grid-travel:${locationId}:${targetLocation.id}`,
      locationId,
      role: 'travel',
      rewards: [],
      results: [{ kind: 'relocate', locationId: targetLocation.id }],
    };
    return [buildEdge(targetLocation, action)];
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

  const currentZ = locationZ(bundle.locations.find((location) => location.id === playState.currentLocationId) ?? { position: { x: 0, y: 0 } });
  const locations = bundle.locations.filter((location) => visibleLocationIds.has(location.id) && locationZ(location) === currentZ);
  const visibleOnLayer = new Set(locations.map((location) => location.id));

  return {
    locations,
    edges: edges.filter((edge) => visibleOnLayer.has(edge.source) && visibleOnLayer.has(edge.target)),
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

export type CardinalDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

// Screen convention: -y is north (up), +y is south (down), matching how the
// map already lays locations out for ReactFlow (which renders y growing
// downward).
export const cardinalDirectionOffsets: Record<CardinalDirection, { dx: number; dy: number }> = {
  n: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  e: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 },
  ne: { dx: 1, dy: -1 },
  nw: { dx: -1, dy: -1 },
  se: { dx: 1, dy: 1 },
  sw: { dx: -1, dy: 1 },
};

export const getLocationInDirection = (
  bundle: Pick<ContentBundle, 'locations'>,
  currentLocationId: string,
  direction: CardinalDirection,
): LocationNode | null => {
  const current = bundle.locations.find((location) => location.id === currentLocationId);
  if (!current) return null;
  const offset = cardinalDirectionOffsets[direction];
  const z = locationZ(current);
  return bundle.locations.find((candidate) =>
    candidate.id !== current.id
    && locationZ(candidate) === z
    && candidate.position.x === current.position.x + offset.dx
    && candidate.position.y === current.position.y + offset.dy) ?? null;
};
