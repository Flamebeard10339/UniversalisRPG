import { getCharacterStatValue } from './characterStats';
import { evaluateCondition } from './conditions';
import { getEnemy } from './adversarial';
import { getEnemyStat } from './enemies';
import type { ActionResolutionContext, ContentBundle, EffectDefinition, ResourceDefinition, ResourcePool, UniversePlayState } from './types';

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
  context: Pick<ActionResolutionContext, 'actions' | 'enemies' | 'items' | 'manifest' | 'skills' | 'stats'>,
  state: UniversePlayState,
  effect: EffectDefinition,
) => {
  if (effect.sourceEnemyStat && state.activeAction) {
    const action = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);
    const enemy = action ? getEnemy(action, {
      actions: context.actions,
      skills: context.skills,
      stats: context.stats,
      manifest: context.manifest,
      interactionTypes: [],
      enemies: context.enemies,
      items: context.items,
    }) : null;
    return enemy ? getEnemyStat(enemy, effect.sourceEnemyStat) : 0;
  }

  return getCharacterStatValue(state, context.stats ?? [], effect.sourceStat, context.skills, context.items ?? [], context.manifest?.experienceCurve);
};

export const getEffectDeltaPerMinute = (
  context: Pick<ActionResolutionContext, 'actions' | 'enemies' | 'items' | 'manifest' | 'skills' | 'stats'>,
  state: UniversePlayState,
  effect: EffectDefinition,
) => {
  const rate = getEffectRatePerMinute(context, state, effect);
  return effect.rateUnit === 'per-second' ? rate * 60 : rate;
};

export const getResourceMax = (
  state: UniversePlayState,
  stats: ContentBundle['stats'],
  resource: ResourceDefinition,
  skills: ContentBundle['skills'] = [],
  items: ContentBundle['items'] = [],
  experienceCurve?: ContentBundle['manifest']['experienceCurve'],
) => Math.max(0, resource.max ?? getCharacterStatValue(state, stats, resource.sourceStat, skills, items, experienceCurve));

export const getResourceMaxForContext = (
  context: Pick<ActionResolutionContext, 'actions' | 'enemies' | 'items' | 'manifest' | 'skills' | 'stats'>,
  state: UniversePlayState,
  resource: ResourceDefinition,
) => {
  if (resource.sourceEnemyStat && state.activeAction) {
    const action = context.actions.find((candidate) => candidate.id === state.activeAction?.actionId);
    const enemy = action ? getEnemy(action, {
      actions: context.actions,
      skills: context.skills,
      stats: context.stats,
      manifest: context.manifest,
      interactionTypes: [],
      enemies: context.enemies,
    }) : null;
    return Math.max(0, enemy ? getEnemyStat(enemy, resource.sourceEnemyStat) : 0);
  }

  return getResourceMax(state, context.stats ?? [], resource, context.skills, context.items ?? [], context.manifest?.experienceCurve);
};

const basePool = (bundle: ContentBundle, state: UniversePlayState, resource: ResourceDefinition): ResourcePool => {
  if (resource.owner === 'enemy' && resource.sourceEnemyStat === 'health') {
    const max = getResourceMaxForContext(bundle, state, resource);
    return {
      current: Math.min(max, Math.max(0, state.activeAction?.targetHealth ?? max)),
      min: 0,
      max,
    };
  }

  const existing = state.resourcePools[resource.id];
  const max = getResourceMaxForContext(bundle, state, resource);
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
    .reduce((total, effect) => total + getEffectDeltaPerMinute(bundle, state, effect), 0);
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
    if (rate < 0 && pool.current <= pool.min && (resource.onEmpty ?? []).length > 0) {
      return [state.lastTickAt];
    }
    if (rate > 0 && pool.current < pool.max) {
      return [state.lastTickAt + ((pool.max - pool.current) / rate) * 60_000];
    }
    if (rate > 0 && pool.current >= pool.max && (resource.onFull ?? []).length > 0) {
      return [state.lastTickAt];
    }
    return [];
  });
  return boundaries.length > 0 ? Math.min(...boundaries) : null;
};
