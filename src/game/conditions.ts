import type { ActionResolutionContext, Condition, GameAction, NumericComparison, UniversePlayState } from './types';
import { readStateVariable } from './stateVariables';
import { hasEquippedItemWithTag, hasInventoryItemWithTag } from './equipment';

const compare = (actual: number, comparison: NumericComparison, expected: number) => {
  if (comparison === 'equal') return actual === expected;
  if (comparison === 'greater-than') return actual > expected;
  return actual < expected;
};

export const evaluateCondition = (
  condition: Condition,
  state: UniversePlayState,
  context: ActionResolutionContext,
): boolean => {
  if (condition.kind === 'all') {
    return condition.conditions.every((child) => evaluateCondition(child, state, context));
  }
  if (condition.kind === 'any') {
    return condition.conditions.some((child) => evaluateCondition(child, state, context));
  }
  if (condition.kind === 'not') {
    return !evaluateCondition(condition.condition, state, context);
  }
  if (condition.kind === 'item-tag') {
    return hasInventoryItemWithTag(state, context.items ?? [], condition.tag);
  }
  if (condition.kind === 'equipped-item-tag') {
    return hasEquippedItemWithTag(state, context.items ?? [], condition.tag);
  }
  const actual = readStateVariable(state, condition.variable, context);
  if (typeof actual === 'boolean' || typeof condition.value === 'boolean') {
    return condition.comparison === 'equal' && actual === condition.value;
  }
  if (typeof actual === 'string' || typeof condition.value === 'string') {
    return condition.comparison === 'equal' && actual === condition.value;
  }
  return compare(actual, condition.comparison, condition.value);
};

export const areActionRequirementsMet = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  if (!action.requirements) return true;
  return evaluateCondition(action.requirements, state, context);
};

export const isActionExhausted = (state: UniversePlayState, action: GameAction, now = Date.now()) => {
  if (action.maxCompletions === undefined) return false;
  if (action.respawnSeconds === undefined) {
    return (state.actionCompletions[action.id] ?? 0) >= action.maxCompletions;
  }
  const activeExhaustions = (state.actionExhaustions?.[action.id] ?? []).filter((expiresAt) => expiresAt > now).length;
  return activeExhaustions >= action.maxCompletions;
};

// An entity's own actions (other than its examine action) stay hidden
// until that entity has been examined at least once — the discoverable-
// entities gate. Entities always get an examine action (authored or
// compiler-synthesized — see contentDsl/compiler.ts's compileLocation), so
// `hasExamine` only ever protects against a hand-authored JSON entity that
// predates this and genuinely has none; such an entity is left ungated
// rather than permanently locked.
const isEntityDiscoveredForAction = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  if (action.entityId === undefined) return true;
  const examineActionId = `entity.${action.entityId}.examine`;
  if (action.id === examineActionId) return true;
  const entity = context.entities?.find((candidate) => candidate.id === action.entityId);
  const hasExamine = Boolean(entity?.actionIds?.includes(examineActionId));
  if (!hasExamine) return true;
  return (state.actionCompletions[examineActionId] ?? 0) > 0;
};

export const isActionVisible = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  now = Date.now(),
) => !isActionExhausted(state, action, now)
  && (!action.visibleWhen || evaluateCondition(action.visibleWhen, state, context))
  && isEntityDiscoveredForAction(state, action, context);

export const isActionAvailableAtCurrentLocation = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  if (action.itemId !== undefined) {
    // Item actions aren't location-scoped — they're available wherever the item is held.
    return true;
  }
  if (action.locationId !== undefined) {
    return action.locationId === state.currentLocationId;
  }
  const location = context.locations?.find((candidate) => candidate.id === state.currentLocationId);
  if ((location?.actions ?? []).includes(action.id)) {
    return true;
  }
  return (location?.entities ?? []).some((entityId) =>
    (context.entities ?? []).some((entity) => entity.id === entityId && (entity.actionIds ?? []).includes(action.id)),
  );
};

export const canStartAction = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
  now = Date.now(),
) => isActionVisible(state, action, context, now)
  && isActionAvailableAtCurrentLocation(state, action, context)
  && areActionRequirementsMet(state, action, context);
