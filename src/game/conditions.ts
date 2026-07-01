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

export const isActionExhausted = (state: UniversePlayState, action: GameAction) =>
  action.maxCompletions !== undefined
  && (state.actionCompletions[action.id] ?? 0) >= action.maxCompletions;

export const isActionVisible = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => !isActionExhausted(state, action)
  && (!action.visibleWhen || evaluateCondition(action.visibleWhen, state, context));

export const canStartAction = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => isActionVisible(state, action, context)
  && areActionRequirementsMet(state, action, context);
