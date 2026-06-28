import { getCharacterStatValue } from './characterStats';
import type { BasePlayerDefinition, ContentBundle, EffectDefinition, ResourceDefinition, ResourcePool, UniversePlayState } from './types';

export const isEffectApplicable = (state: UniversePlayState, effect: EffectDefinition) =>
  !effect.locationId || effect.locationId === state.currentLocationId;

export const getEffectRatePerMinute = (
  stats: ContentBundle['stats'],
  state: UniversePlayState,
  effect: EffectDefinition,
  basePlayer?: BasePlayerDefinition,
) => {
  return getCharacterStatValue(state, stats, effect.sourceStat, basePlayer);
};

export const getResourceMax = (
  state: UniversePlayState,
  stats: ContentBundle['stats'],
  resource: ResourceDefinition,
  basePlayer?: BasePlayerDefinition,
) => Math.max(0, getCharacterStatValue(state, stats, resource.sourceStat, basePlayer));

const basePool = (bundle: ContentBundle, state: UniversePlayState, resource: ResourceDefinition): ResourcePool => {
  const existing = state.resourcePools[resource.id];
  const max = getResourceMax(state, bundle.stats, resource, bundle.manifest.basePlayer);
  if (existing) return { current: Math.min(max, Math.max(0, existing.current)), min: 0, max };
  return {
    current: resource.initialValue === 'empty' ? 0 : max,
    min: 0,
    max,
  };
};

export const getActiveResourceRate = (
  bundle: ContentBundle,
  state: UniversePlayState,
  resourceId: string,
) => {
  if (!state.activeAction) return 0;
  return bundle.effects
    .filter((effect) => effect.resourceId === resourceId && isEffectApplicable(state, effect))
    .reduce((total, effect) => total + getEffectRatePerMinute(bundle.stats, state, effect, bundle.manifest.basePlayer), 0);
};

export const projectResourcePool = (
  bundle: ContentBundle,
  state: UniversePlayState,
  resource: ResourceDefinition,
  now: number,
): ResourcePool => {
  const pool = basePool(bundle, state, resource);
  if (!state.activeAction) return pool;
  const until = Math.min(now, state.activeAction.completesAt);
  const elapsedMinutes = Math.max(0, until - state.lastTickAt) / 60_000;
  const current = Math.min(pool.max, Math.max(pool.min, pool.current + getActiveResourceRate(bundle, state, resource.id) * elapsedMinutes));
  return { ...pool, current };
};

export const getNextResourceBoundaryAt = (
  bundle: ContentBundle,
  state: UniversePlayState,
) => {
  if (!state.activeAction) return null;
  const boundaries = bundle.resourceDefinitions.flatMap((resource) => {
    const pool = basePool(bundle, state, resource);
    const rate = getActiveResourceRate(bundle, state, resource.id);
    if (rate < 0 && pool.current > pool.min) {
      return [state.lastTickAt + ((pool.current - pool.min) / -rate) * 60_000];
    }
    if (rate > 0 && pool.current < pool.max) {
      return [state.lastTickAt + ((pool.max - pool.current) / rate) * 60_000];
    }
    return [];
  }).filter((boundary) => boundary <= state.activeAction!.completesAt);
  return boundaries.length > 0 ? Math.min(...boundaries) : null;
};
