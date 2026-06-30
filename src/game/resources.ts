import { getCharacterStatValue } from './characterStats';
import { evaluateCondition } from './conditions';
import type { ActionResolutionContext, BasePlayerDefinition, ContentBundle, EffectDefinition, ResourceDefinition, ResourcePool, UniversePlayState } from './types';

export const isEffectApplicable = (
  context: Pick<ActionResolutionContext, 'actions' | 'effects' | 'enemies' | 'flags' | 'interactionTypes' | 'items' | 'locations' | 'manifest' | 'resourceDefinitions' | 'skills' | 'stats'>,
  state: UniversePlayState,
  effect: EffectDefinition,
) =>
  (!effect.locationId || effect.locationId === state.currentLocationId)
  && (!effect.activeWhen || evaluateCondition(effect.activeWhen, state, {
    manifest: context.manifest,
    actions: context.actions,
    skills: context.skills,
    stats: context.stats,
    locations: context.locations,
    items: context.items,
    flags: context.flags,
    resourceDefinitions: context.resourceDefinitions,
    effects: context.effects,
    interactionTypes: context.interactionTypes,
    enemies: context.enemies,
  }));

export const getEffectRatePerMinute = (
  stats: ContentBundle['stats'],
  state: UniversePlayState,
  effect: EffectDefinition,
  basePlayer?: BasePlayerDefinition,
) => {
  return getCharacterStatValue(state, stats, effect.sourceStat, basePlayer);
};

export const getEffectDeltaPerMinute = (
  stats: ContentBundle['stats'],
  state: UniversePlayState,
  effect: EffectDefinition,
  basePlayer?: BasePlayerDefinition,
) => {
  const rate = getEffectRatePerMinute(stats, state, effect, basePlayer);
  return effect.rateUnit === 'per-second' ? rate * 60 : rate;
};

export const getResourceMax = (
  state: UniversePlayState,
  stats: ContentBundle['stats'],
  resource: ResourceDefinition,
  basePlayer?: BasePlayerDefinition,
) => Math.max(0, resource.max ?? getCharacterStatValue(state, stats, resource.sourceStat, basePlayer));

const basePool = (bundle: ContentBundle, state: UniversePlayState, resource: ResourceDefinition): ResourcePool => {
  const existing = state.resourcePools[resource.id];
  const max = getResourceMax(state, bundle.stats, resource, bundle.manifest.basePlayer);
  if (existing) {
    const wasUninitialized = existing.max <= existing.min && max > 0;
    const current = wasUninitialized && resource.initialValue !== 'empty'
      ? max
      : Math.min(max, Math.max(0, existing.current));
    return { current, min: 0, max };
  }
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
    .filter((effect) => effect.resourceId === resourceId && isEffectApplicable(bundle, state, effect))
    .reduce((total, effect) => total + getEffectDeltaPerMinute(bundle.stats, state, effect, bundle.manifest.basePlayer), 0);
};

export const projectResourcePool = (
  bundle: ContentBundle,
  state: UniversePlayState,
  resource: ResourceDefinition,
  now: number,
): ResourcePool => {
  const pool = basePool(bundle, state, resource);
  if (!state.activeAction) return pool;
  const action = bundle.actions.find((candidate) => candidate.id === state.activeAction?.actionId);
  const until = action?.enemyId ? now : Math.min(now, state.activeAction.completesAt);
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
  });
  return boundaries.length > 0 ? Math.min(...boundaries) : null;
};
