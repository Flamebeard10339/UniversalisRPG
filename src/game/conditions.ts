import type { ActionResolutionContext, Condition, GameAction, NumericComparison, Requirement, UniversePlayState } from './types';
import { skillLevelFromXp } from './skills';

const compare = (actual: number, comparison: NumericComparison, expected: number) => {
  if (comparison === 'equal') return actual === expected;
  if (comparison === 'at-least') return actual >= expected;
  if (comparison === 'at-most') return actual <= expected;
  if (comparison === 'greater-than') return actual > expected;
  return actual < expected;
};

const getItemQuantity = (state: UniversePlayState, itemId: string) =>
  state.inventory[itemId] ?? state.resources[itemId] ?? 0;

const getResourceValue = (state: UniversePlayState, resourceId: string) =>
  state.resourcePools[resourceId]?.current ?? 0;

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
  if (condition.kind === 'flag') {
    return (state.flags[condition.flagId] ?? false) === condition.value;
  }
  if (condition.kind === 'item') {
    return compare(getItemQuantity(state, condition.itemId), condition.comparison, condition.value);
  }
  if (condition.kind === 'resource') {
    return compare(getResourceValue(state, condition.resourceId), condition.comparison, condition.value);
  }
  if (condition.kind === 'action-completions') {
    return compare(state.actionCompletions[condition.actionId] ?? 0, condition.comparison, condition.value);
  }

  const skill = context.skills.find((candidate) => candidate.id === condition.skillId);
  const level = skill
    ? Math.min(skill.maxLevel, skillLevelFromXp(state.skillXp[condition.skillId] ?? 0))
    : 0;
  return compare(level, condition.comparison, condition.value);
};

const legacyRequirementMet = (
  requirement: Requirement,
  state: UniversePlayState,
  context: ActionResolutionContext,
) => {
  if (requirement.kind === 'resource') {
    return getItemQuantity(state, requirement.resourceId) >= requirement.amount
      || getResourceValue(state, requirement.resourceId) >= requirement.amount;
  }

  const skill = context.skills.find((candidate) => candidate.id === requirement.skillId);
  return skill
    ? Math.min(skill.maxLevel, skillLevelFromXp(state.skillXp[requirement.skillId] ?? 0)) >= requirement.level
    : false;
};

export const areActionRequirementsMet = (
  state: UniversePlayState,
  action: GameAction,
  context: ActionResolutionContext,
) => {
  if (!action.requirements) return true;
  return Array.isArray(action.requirements)
    ? action.requirements.every((requirement) => legacyRequirementMet(requirement, state, context))
    : evaluateCondition(action.requirements, state, context);
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
