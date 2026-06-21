import { getSkillTotals } from './adversarial';
import type { ContentBundle, EffectDefinition, ResourceDefinition, ResourcePool, UniversePlayState } from './types';

export const isEffectApplicable = (state: UniversePlayState, effect: EffectDefinition) =>
  effect.source === 'player'
  || (effect.source === 'location' && (!effect.locationId || effect.locationId === state.currentLocationId));

export const getEffectRatePerMinute = (
  bundle: ContentBundle,
  state: UniversePlayState,
  effect: EffectDefinition,
) => {
  const skill = effect.rateSkillId
    ? bundle.skills.find((candidate) => candidate.id === effect.rateSkillId)
    : undefined;
  return effect.ratePerMinute + (skill ? getSkillTotals(state, skill).effectiveTotal : 0);
};

const basePool = (state: UniversePlayState, resource: ResourceDefinition): ResourcePool => {
  const existing = state.resourcePools[resource.id];
  if (existing) return existing;
  const max = resource.id === 'health' ? state.playerMaxHealth : resource.baseMaxValue;
  return {
    current: resource.id === 'health' ? state.playerHealth : resource.initialValue ?? max,
    min: resource.minValue,
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
    .reduce((total, effect) => total + getEffectRatePerMinute(bundle, state, effect), 0);
};

export const projectResourcePool = (
  bundle: ContentBundle,
  state: UniversePlayState,
  resource: ResourceDefinition,
  now: number,
): ResourcePool => {
  const pool = basePool(state, resource);
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
    const pool = basePool(state, resource);
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
