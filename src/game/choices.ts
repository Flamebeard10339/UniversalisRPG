// Shared "what can the player do right now" derivation, used by both the headless
// playtest CLI (scripts/playtestEngine.ts) and the live in-browser test harness
// (src/game/testHarness.ts). Keeping exactly one implementation is deliberate: two
// real production bugs (missing recipes/statModifiers in a hand-built context, a
// dropped recipeId on action-loop restart) were only ever visible in the real app
// because the headless engine built its own separate, correct context — a second
// copy of this logic would silently recreate that class of bug.
import { areActionRequirementsMet, evaluateCondition, isActionVisible, canStartAction } from './conditions';
import { getActionDescriptionText, getActionTitleText } from './actionLocalization';
import { entityTitleKey, locationExamineKey, locationTitleKey, itemTitleKey } from './contentIds';
import { availableRecipesForStation, resolveStationAction } from './recipes';
import { isPureTravelAction } from './travel';
import type { Translator } from './i18n';
import type {
  ActionResolutionContext,
  ContentBundle,
  DialogueOption,
  GameAction,
  UniversePlayState,
} from './types';

export type Choice = {
  choiceId: string;
  kind: 'action' | 'entity-action' | 'item-action' | 'dialogue-option';
  entityId?: string;
  itemId?: string;
  title: string;
  description?: string;
  requirementsMet: boolean;
};

export const ACTION_PREFIX = 'action:';
export const DIALOGUE_PREFIX = 'dialogue-option:';
export const RECIPE_SEPARATOR = '@';

export const currentDialogueNode = (bundle: ContentBundle, state: UniversePlayState) => {
  if (!state.activeDialogue) return null;
  const dialogue = (bundle.dialogues ?? []).find((candidate) => candidate.id === state.activeDialogue?.dialogueId);
  return dialogue?.nodes.find((node) => node.id === state.activeDialogue?.nodeId) ?? null;
};

export const visibleChoices = (
  bundle: ContentBundle,
  context: ActionResolutionContext,
  state: UniversePlayState,
  t: Translator,
): Choice[] => {
  const dialogueNode = currentDialogueNode(bundle, state);
  if (dialogueNode) {
    const options = (dialogueNode.options ?? [])
      .filter((option: DialogueOption) => !option.conditions || evaluateCondition(option.conditions, state, context));
    if (options.length > 0) {
      return options.map((option) => ({
        choiceId: `${DIALOGUE_PREFIX}${option.id}`,
        kind: 'dialogue-option' as const,
        title: t(option.labelKey),
        requirementsMet: true,
      }));
    }
    // Mirrors DialoguePanel.tsx: a node with no options always renders a single
    // "Continue" button, whether or not it has a gotoNodeId.
    return [{
      choiceId: `${DIALOGUE_PREFIX}continue`,
      kind: 'dialogue-option' as const,
      title: t('dialogue.continue', 'Continue'),
      requirementsMet: true,
    }];
  }

  const currentLocation = bundle.locations.find((location) => location.id === state.currentLocationId);
  const entities = (currentLocation?.entities ?? [])
    .map((entityId) => (bundle.entities ?? []).find((entity) => entity.id === entityId))
    .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity));
  const entityActionIds = new Set(entities.flatMap((entity) => entity.actionIds ?? []));

  const describe = (action: GameAction, kind: Choice['kind'], entityId?: string): Choice[] => {
    if (!action.stationId) {
      return [{
        choiceId: `${ACTION_PREFIX}${action.id}`,
        kind,
        entityId,
        title: getActionTitleText(action, bundle, t),
        description: getActionDescriptionText(action, bundle, t),
        requirementsMet: canStartAction(state, action, context),
      }];
    }

    return availableRecipesForStation(state, action.stationId, context).map((recipe) => {
      const resolved = resolveStationAction(action, recipe.id, context);
      const itemId = recipe.inputs[0]?.itemId;
      return {
        choiceId: `${ACTION_PREFIX}${action.id}${RECIPE_SEPARATOR}${recipe.id}`,
        kind,
        entityId,
        title: itemId ? t(itemTitleKey(itemId), itemId) : getActionTitleText(action, bundle, t),
        description: getActionDescriptionText(action, bundle, t),
        requirementsMet: canStartAction(state, resolved, context),
      };
    });
  };

  const locationActions = bundle.actions
    .filter((action) => action.locationId === state.currentLocationId && !entityActionIds.has(action.id))
    .filter((action) => !isPureTravelAction(action))
    .filter((action) => isActionVisible(state, action, context))
    .flatMap((action) => describe(action, 'action'));

  const entityChoices = entities.flatMap((entity) =>
    (entity.actionIds ?? [])
      .map((actionId) => bundle.actions.find((action) => action.id === actionId))
      .filter((action): action is GameAction => Boolean(action))
      .filter((action) => isActionVisible(state, action, context))
      .flatMap((action) => describe(action, 'entity-action', entity.id)));

  const heldItemIds = Object.entries(state.inventory ?? {})
    .filter(([, amount]) => amount > 0)
    .map(([itemId]) => itemId);
  const itemChoices = heldItemIds.flatMap((itemId) =>
    bundle.actions
      .filter((action) => action.itemId === itemId)
      .filter((action) => isActionVisible(state, action, context) && areActionRequirementsMet(state, action, context))
      .map((action) => ({
        choiceId: `${ACTION_PREFIX}${action.id}`,
        kind: 'item-action' as const,
        itemId,
        title: getActionTitleText(action, bundle, t),
        description: getActionDescriptionText(action, bundle, t),
        requirementsMet: true,
      })));

  return [...locationActions, ...entityChoices, ...itemChoices];
};

export const describeLocation = (bundle: ContentBundle, state: UniversePlayState, t: Translator) => {
  const location = bundle.locations.find((candidate) => candidate.id === state.currentLocationId);
  const entityNames = (location?.entities ?? []).map((entityId) => t(entityTitleKey(entityId), entityId));
  return {
    id: state.currentLocationId,
    title: location ? t(locationTitleKey(location.id), location.id) : state.currentLocationId,
    description: location ? t(locationExamineKey(location.id), '') : '',
    entityCount: location?.entities?.length ?? 0,
    entityNames,
  };
};
