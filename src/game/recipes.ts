import type { ActionResolutionContext, Condition, GameAction, RecipeDefinition, UniversePlayState } from './types';

const NO_RECIPE_SELECTED: Condition = { kind: 'state-variable', variable: 'flag:__no-recipe-selected__', comparison: 'equal', value: true };

const atLeast = (itemId: string, amount: number): Condition => ({
  kind: 'state-variable',
  variable: `item:${itemId}`,
  comparison: 'greater-than',
  value: amount - 1,
});

export const recipesForStation = (context: ActionResolutionContext, stationId: string): RecipeDefinition[] =>
  (context.recipes ?? []).filter((recipe) => recipe.stationId === stationId);

export const canCraftRecipe = (state: UniversePlayState, recipe: RecipeDefinition) =>
  recipe.inputs.every((input) => (state.inventory[input.itemId] ?? 0) >= input.amount);

export const availableRecipesForStation = (
  state: UniversePlayState,
  stationId: string,
  context: ActionResolutionContext,
): RecipeDefinition[] => recipesForStation(context, stationId).filter((recipe) => canCraftRecipe(state, recipe));

export const resolveStationAction = (
  action: GameAction,
  recipeId: string | undefined,
  context: ActionResolutionContext,
): GameAction => {
  if (!action.stationId) return action;
  const recipe = recipesForStation(context, action.stationId).find((candidate) => candidate.id === recipeId);

  if (!recipe) {
    return { ...action, rewards: [], results: [], requirements: NO_RECIPE_SELECTED };
  }

  return {
    ...action,
    durationSeconds: recipe.durationSeconds ?? action.durationSeconds ?? 2,
    requirements: { kind: 'all', conditions: recipe.inputs.map((input) => atLeast(input.itemId, input.amount)) },
    rewards: recipe.skillId ? [{ kind: 'skillXp', skillId: recipe.skillId, amount: recipe.xpAmount ?? 0 }] : [],
    results: [
      ...recipe.inputs.map((input) => ({ kind: 'item' as const, itemId: input.itemId, amount: -input.amount })),
      ...recipe.outputs.map((output) => ({ kind: 'item' as const, itemId: output.itemId, amount: output.amount })),
      ...(recipe.resultMessageKey ? [{ kind: 'chat' as const, messageKey: recipe.resultMessageKey }] : []),
      ...(recipe.extraResults ?? []),
    ],
  };
};
