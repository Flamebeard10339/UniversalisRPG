import type {
  ContentBundle,
  ContributionDraft,
  Condition,
  ActionResult,
  DialogueDefinition,
  DropTableDefinition,
  EnemyDefinition,
  EntityDefinition,
  EffectDefinition,
  ExperienceTrigger,
  GameAction,
  InteractionTypeDefinition,
  ItemDefinition,
  LocaleDictionary,
  LocationNode,
  RecipeDefinition,
  RecipeIngredient,
  ResourceDefinition,
  Reward,
  RewardAmount,
  SkillDefinition,
  StatDefinition,
  StatModifierDefinition,
  StateFlagDefinition,
  UniverseManifest,
  ValidationIssue,
} from './types';
import { ENEMY_STAT_KEYS, getEnemyStat } from './enemies';
import { collectionCategoryTitleKey, collectionTrackedItemIds } from './collectionLog';
import {
  actionDescriptionKey,
  actionFailureKey,
  actionKillKey,
  actionSuccessKey,
  actionTitleKey,
  entityTitleKey,
  itemDescriptionKey,
  itemTitleKey,
  locationDescriptionKey,
  locationExhaustedKey,
  locationTitleKey,
  effectTitleKey,
  interactionEntityHitKey,
  interactionEntityKillKey,
  interactionEntityMissKey,
  interactionPlayerHitKey,
  interactionPlayerKillKey,
  interactionPlayerMissKey,
  interactionTitleKey,
  resourceTitleKey,
  skillDescriptionKey,
  skillTitleKey,
  statDescriptionKey,
  statTitleKey,
  toKebabCase,
  universeDescriptionKey,
  universeTitleKey,
} from './contentIds';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasString = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === 'string' && String(value[key]).trim().length > 0;

const hasNumber = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === 'number' && Number.isFinite(value[key]);

const isKebabCaseId = (id: string) => id === toKebabCase(id);
const isDottedKebabCaseId = (id: string) => id.split('.').every((part) => part.length > 0 && isKebabCaseId(part));

const error = (path: string, message: string, params?: Record<string, string | number>): ValidationIssue => ({
  severity: 'error',
  path,
  message,
  params,
});

const warning = (path: string, message: string, params?: Record<string, string | number>): ValidationIssue => ({
  severity: 'warning',
  path,
  message,
  params,
});

const validateStringArray = (value: unknown) => value === undefined
  || (Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0));

const validateDisplayPaletteShape = (value: unknown) =>
  value === undefined ||
  (isRecord(value) && Object.values(value).every((color) => typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)));

const validateDisplayProfilesShape = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) &&
    value.every((profile) =>
      isRecord(profile) &&
      hasString(profile, 'id') &&
      (profile.titleKey === undefined || hasString(profile, 'titleKey')) &&
      validateDisplayPaletteShape(profile.colors) &&
      validateDisplayPaletteShape(profile.light) &&
      validateDisplayPaletteShape(profile.dark),
    ));

const validateExperienceCurveShape = (value: unknown) =>
  value === undefined ||
  (isRecord(value) &&
    (value['starting-experience'] === undefined || hasNumber(value, 'starting-experience')) &&
    (value['level-factor'] === undefined || hasNumber(value, 'level-factor')) &&
    (value.exponential === undefined || hasNumber(value, 'exponential')));

const validateResetStateShape = (value: unknown) => {
  if (!isRecord(value)
    || (value.locationId !== undefined && !hasString(value, 'locationId'))
    || (value.incrementVariable !== undefined && !hasString(value, 'incrementVariable'))
    || (value.incrementFlagId !== undefined && !hasString(value, 'incrementFlagId'))) return false;
  if (value.preserve === undefined) return true;
  if (!isRecord(value.preserve)) return false;
  return (value.preserve.inventory === undefined || typeof value.preserve.inventory === 'boolean')
    && validateStringArray(value.preserve.inventoryIds)
    && validateStringArray(value.preserve.resourceIds)
    && validateStringArray(value.preserve.variableIds)
    && validateStringArray(value.preserve.flagIds)
    && validateStringArray(value.preserve.actionCompletionIds)
    && (value.preserve.skillXp === undefined || typeof value.preserve.skillXp === 'boolean')
    && (value.preserve.collectionLog === undefined || typeof value.preserve.collectionLog === 'boolean')
    && (value.preserve.discoveredLocations === undefined || typeof value.preserve.discoveredLocations === 'boolean');
};

export const validateManifest = (value: unknown): value is UniverseManifest =>
  isRecord(value) &&
  hasNumber(value, 'schemaVersion') &&
  hasString(value, 'id') &&
  hasString(value, 'version') &&
  hasString(value, 'author') &&
  Array.isArray(value.locales) &&
  value.locales.every((locale) => typeof locale === 'string') &&
  Array.isArray(value.files) &&
  value.files.every((file) => typeof file === 'string') &&
  (value.modules === undefined || (Array.isArray(value.modules) && value.modules.every((moduleId) => typeof moduleId === 'string' && moduleId.trim().length > 0))) &&
  (value.basePlayer === undefined ||
    (isRecord(value.basePlayer) &&
      value.basePlayer.stats === undefined &&
      (value.basePlayer.inventory === undefined || (isRecord(value.basePlayer.inventory) && Object.values(value.basePlayer.inventory).every((amount) => typeof amount === 'number' && Number.isFinite(amount)))))) &&
  (value.combatBalance === undefined ||
    (isRecord(value.combatBalance) &&
      hasNumber(value.combatBalance, 'damage-scaler'))) &&
  validateExperienceCurveShape(value.experienceCurve) &&
  (value.experience === undefined || (Array.isArray(value.experience) && value.experience.every(validateExperienceTriggerShape))) &&
  validateDisplayProfilesShape(value.displayProfiles) &&
  (value.ui === undefined ||
    (isRecord(value.ui) &&
      (value.ui.floatingTextDurationSeconds === undefined || hasNumber(value.ui, 'floatingTextDurationSeconds')) &&
      (value.ui.loopActionsByDefault === undefined || typeof value.ui.loopActionsByDefault === 'boolean') &&
      (value.ui.travelPathMaxSeconds === undefined || hasNumber(value.ui, 'travelPathMaxSeconds')) &&
      (value.ui.travelPathMaxNodes === undefined || hasNumber(value.ui, 'travelPathMaxNodes')) &&
      (value.ui.connectivityMode === undefined || value.ui.connectivityMode === 'highly-connected' || value.ui.connectivityMode === 'sparse') &&
      (value.ui.distanceBetweenAdjacentTiles === undefined || hasNumber(value.ui, 'distanceBetweenAdjacentTiles'))));

const validateLocationsShape = (locations: unknown): locations is LocationNode[] =>
  Array.isArray(locations) &&
  locations.every(
    (location) =>
      isRecord(location) &&
      hasString(location, 'id') &&
      isRecord(location.position) &&
      typeof location.position.x === 'number' &&
      typeof location.position.y === 'number' &&
      (location.position.z === undefined || typeof location.position.z === 'number') &&
      (location.actions === undefined || validateStringArray(location.actions)) &&
      (location.entities === undefined || validateStringArray(location.entities)),
  );

const validateEntitiesShape = (entities: unknown): entities is EntityDefinition[] =>
  entities === undefined ||
  (Array.isArray(entities) &&
    entities.every((entity) =>
      isRecord(entity) &&
      hasString(entity, 'id') &&
      (entity.actionIds === undefined || validateStringArray(entity.actionIds)) &&
      (entity.actions === undefined || validateActionsShape(entity.actions)) &&
      (entity.collectionLog === undefined || (Array.isArray(entity.collectionLog) && entity.collectionLog.every((definition) =>
        isRecord(definition) &&
        hasString(definition, 'categoryId') &&
        hasString(definition, 'actionId') &&
        (definition.killTargetCount === undefined || (Number.isInteger(definition.killTargetCount) && Number(definition.killTargetCount) >= 1)) &&
        (definition.dropTableIds === undefined || validateStringArray(definition.dropTableIds)) &&
        (definition.itemIds === undefined || validateStringArray(definition.itemIds)),
      ))),
    ));

const comparisons = new Set(['equal', 'greater-than', 'less-than']);

const validateConditionShape = (value: unknown): value is Condition => {
  if (!isRecord(value) || !hasString(value, 'kind')) return false;
  if (value.kind === 'all' || value.kind === 'any') {
    return Array.isArray(value.conditions) && value.conditions.every(validateConditionShape);
  }
  if (value.kind === 'not') return validateConditionShape(value.condition);
  if (value.kind === 'item-tag' || value.kind === 'equipped-item-tag') return hasString(value, 'tag');
  return value.kind === 'state-variable'
    && hasString(value, 'variable')
    && (typeof value.value === 'number' || typeof value.value === 'boolean' || typeof value.value === 'string')
    && comparisons.has(String(value.comparison));
};

const validateRewardAmountShape = (value: unknown): value is RewardAmount =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (isRecord(value) && hasNumber(value, 'min') && hasNumber(value, 'max'));

const rewardAmountPositive = (amount: RewardAmount) =>
  typeof amount === 'number'
    ? amount > 0
    : amount.min > 0 && amount.max > 0 && amount.max >= amount.min;

const validateRewardShape = (value: unknown): value is Reward => {
  if (!isRecord(value) || !hasString(value, 'kind')) return false;
  if (value.kind === 'dropTable') return hasString(value, 'dropTableId') || validateDropEntriesShape(value.drops);
  return validateRewardAmountShape(value.amount)
    && ((value.kind === 'skillXp' && hasString(value, 'skillId'))
      || (value.kind === 'resource' && hasString(value, 'resourceId'))
      || (value.kind === 'item' && hasString(value, 'itemId')));
};

function validateDropEntriesShape(value: unknown): boolean {
  return Array.isArray(value) &&
    value.every((drop) =>
      isRecord(drop) &&
      hasNumber(drop, 'weight') &&
      (drop.reward === undefined || validateRewardShape(drop.reward)) &&
      (drop.dropTableId === undefined || hasString(drop, 'dropTableId')) &&
      (drop.drops === undefined || validateDropEntriesShape(drop.drops)),
    );
}

const experienceEvents = new Set(['action-complete', 'damage-dealt', 'damage-taken', 'health-regenerated', 'incoming-attack-missed']);

const validateExperienceTriggerShape = (value: unknown) => isRecord(value)
  && typeof value.event === 'string'
  && experienceEvents.has(value.event)
  && hasString(value, 'skillId')
  && (value.amount === undefined || hasNumber(value, 'amount'))
  && (value.amountPerUnit === undefined || hasNumber(value, 'amountPerUnit'))
  && (value.effectId === undefined || hasString(value, 'effectId'))
  && (value.enemyId === undefined || hasString(value, 'enemyId'))
  && (value.interactionTypeId === undefined || hasString(value, 'interactionTypeId'))
  && (value.resourceId === undefined || hasString(value, 'resourceId'))
  && (value.sourceStat === undefined || hasString(value, 'sourceStat'));

const validateActionResultShape = (value: unknown) => {
  if (!isRecord(value) || !hasString(value, 'kind')) return false;
  if (value.kind === 'item') return hasString(value, 'itemId') && hasNumber(value, 'amount');
  if (value.kind === 'resource') return hasString(value, 'resourceId') && hasNumber(value, 'amount');
  if (value.kind === 'skill-xp') return hasString(value, 'skillId') && hasNumber(value, 'amount');
  if (value.kind === 'state-variable') return hasString(value, 'variable') && (typeof value.value === 'boolean' || typeof value.value === 'number' || typeof value.value === 'string');
  if (value.kind === 'state-variable-delta') return hasString(value, 'variable') && hasNumber(value, 'amount');
  if (value.kind === 'flag') {
    return hasString(value, 'flagId')
      && typeof value.value === 'boolean'
      && (value.expiresAfterSeconds === undefined || (typeof value.expiresAfterSeconds === 'number' && value.expiresAfterSeconds > 0));
  }
  if (value.kind === 'relocate') return hasString(value, 'locationId');
  if (value.kind === 'dialogue') return hasString(value, 'dialogueId');
  if (value.kind === 'bank-deposit') return hasString(value, 'itemId') && hasNumber(value, 'amount');
  if (value.kind === 'bank-withdraw') return hasString(value, 'itemId') && hasNumber(value, 'amount');
  if (value.kind === 'set-spawn') return hasString(value, 'locationId');
  if (value.kind === 'open-modal') return hasString(value, 'modalId');
  return value.kind === 'chat'
    && hasString(value, 'messageKey')
    && (value.delaySeconds === undefined || (typeof value.delaySeconds === 'number' && value.delaySeconds >= 0 && value.delaySeconds <= 2));
};

const validateActionsShape = (actions: unknown): actions is GameAction[] =>
  Array.isArray(actions) &&
  actions.every(
    (action) =>
      isRecord(action) &&
      hasString(action, 'id') &&
      (action.locationId === undefined || hasString(action, 'locationId')) &&
      (action.role === undefined || action.role === 'optional' || action.role === 'progression' || action.role === 'utility' || action.role === 'travel') &&
      (action.instant === undefined || typeof action.instant === 'boolean') &&
      (action.instant || action.stationId !== undefined || action.role === 'travel' ? action.durationSeconds === undefined || hasNumber(action, 'durationSeconds') : hasNumber(action, 'durationSeconds')) &&
      Array.isArray(action.rewards) && action.rewards.every(validateRewardShape) &&
      (action.experience === undefined || (Array.isArray(action.experience) && action.experience.every(validateExperienceTriggerShape))) &&
      (action.results === undefined || (Array.isArray(action.results) && action.results.every(validateActionResultShape))) &&
      (action.visibleWhen === undefined || validateConditionShape(action.visibleWhen)) &&
      (action.requirements === undefined || validateConditionShape(action.requirements)) &&
      (action.maxCompletions === undefined || (Number.isInteger(action.maxCompletions) && Number(action.maxCompletions) >= 1)) &&
      (action.chance === undefined || (typeof action.chance === 'number' && action.chance >= 0 && action.chance <= 100)) &&
      (action.failureResults === undefined || (Array.isArray(action.failureResults) && action.failureResults.every(validateActionResultShape))) &&
      (action.stationId === undefined || hasString(action, 'stationId')),
  );

const validateSkillsShape = (skills: unknown): skills is SkillDefinition[] =>
  Array.isArray(skills) &&
  skills.every(
    (skill) =>
      isRecord(skill) &&
      hasString(skill, 'id') &&
      hasNumber(skill, 'maxLevel') &&
      (skill.statId === undefined || hasString(skill, 'statId')) &&
      (skill.addedPerLevel === undefined || hasNumber(skill, 'addedPerLevel')) &&
      (skill.increasedPerLevel === undefined || hasNumber(skill, 'increasedPerLevel')),
  );

const validateStatsShape = (stats: unknown): stats is StatDefinition[] =>
  Array.isArray(stats) && stats.every((stat) => isRecord(stat)
    && hasString(stat, 'id')
    && (stat.base === undefined || hasNumber(stat, 'base'))
    && stat.added === undefined
    && stat.increased === undefined
    && stat.skillId === undefined);

const validateItemsShape = (items: unknown): items is ItemDefinition[] =>
  items === undefined ||
  (Array.isArray(items) &&
    items.every(
      (item) =>
        isRecord(item) &&
        hasString(item, 'id') &&
        (item.actions === undefined || validateActionsShape(item.actions)),
    ));

const validateFlagsShape = (flags: unknown): flags is StateFlagDefinition[] =>
  flags === undefined || (Array.isArray(flags) && flags.every((flag) => isRecord(flag)
    && hasString(flag, 'id')
    && (flag.initialValue === undefined || typeof flag.initialValue === 'boolean' || typeof flag.initialValue === 'number' || typeof flag.initialValue === 'string')));

const validateResourceBehaviorShape = (value: unknown) => isRecord(value) && (
  value.kind === 'stop-action'
  || value.kind === 'complete-action'
  || value.kind === 'enemy-attack'
  || (value.kind === 'reset-state' && validateResetStateShape(value))
  || (value.kind === 'refill' && (value.value === 'min' || value.value === 'max' || typeof value.value === 'number'))
  || (value.kind === 'relocate' && hasString(value, 'locationId'))
  || (value.kind === 'chat' && hasString(value, 'messageKey'))
);

const validateResourceDefinitionsShape = (resources: unknown): resources is ResourceDefinition[] =>
  resources === undefined ||
  (Array.isArray(resources) &&
    resources.every(
      (resource) =>
        isRecord(resource) &&
        hasString(resource, 'id') &&
        (resource.owner === undefined || resource.owner === 'player' || resource.owner === 'enemy') &&
        hasString(resource, 'sourceStat') &&
        (resource.sourceEnemyStat === undefined || ['attack', 'defense', 'health', 'rate', 'regeneration', 'armorPenetration', 'torpidity', 'critChance', 'critMultiplier'].includes(String(resource.sourceEnemyStat))) &&
        (resource.max === undefined || (typeof resource.max === 'number' && Number.isFinite(resource.max) && resource.max >= 0)) &&
        (resource.display === undefined || resource.display === 'full' || resource.display === 'minimal' || resource.display === 'hidden') &&
        (resource.hidden === undefined || typeof resource.hidden === 'boolean') &&
        (resource.initialValue === undefined || resource.initialValue === 'empty' || resource.initialValue === 'full') &&
        (resource.onEmpty === undefined || (Array.isArray(resource.onEmpty) && resource.onEmpty.every(validateResourceBehaviorShape))) &&
        (resource.onFull === undefined || (Array.isArray(resource.onFull) && resource.onFull.every(validateResourceBehaviorShape))) &&
        (resource.effects === undefined || (Array.isArray(resource.effects) && resource.effects.every((effect) =>
          isRecord(effect) &&
          hasString(effect, 'id') &&
          hasString(effect, 'sourceStat') &&
          (effect.sourceEnemyStat === undefined || ['attack', 'defense', 'health', 'rate', 'regeneration', 'armorPenetration', 'torpidity', 'critChance', 'critMultiplier'].includes(String(effect.sourceEnemyStat))) &&
          (effect.locationId === undefined || typeof effect.locationId === 'string') &&
          (effect.rateUnit === undefined || effect.rateUnit === 'per-minute' || effect.rateUnit === 'per-second') &&
          (effect.activeWhen === undefined || validateConditionShape(effect.activeWhen)) &&
          (effect.resetResourceWhenInactive === undefined || typeof effect.resetResourceWhenInactive === 'boolean') &&
          (effect.experience === undefined || (Array.isArray(effect.experience) && effect.experience.every(validateExperienceTriggerShape)))))),
    ));

const validateEffectsShape = (effects: unknown): effects is EffectDefinition[] =>
  effects === undefined ||
  (Array.isArray(effects) &&
    effects.every(
      (effect) =>
        isRecord(effect) &&
        hasString(effect, 'id') &&
        hasString(effect, 'resourceId') &&
        hasString(effect, 'sourceStat') &&
        (effect.sourceEnemyStat === undefined || ['attack', 'defense', 'health', 'rate', 'regeneration', 'armorPenetration', 'torpidity', 'critChance', 'critMultiplier'].includes(String(effect.sourceEnemyStat))) &&
        (effect.locationId === undefined || typeof effect.locationId === 'string') &&
        (effect.rateUnit === undefined || effect.rateUnit === 'per-minute' || effect.rateUnit === 'per-second') &&
        (effect.activeWhen === undefined || validateConditionShape(effect.activeWhen)) &&
        (effect.resetResourceWhenInactive === undefined || typeof effect.resetResourceWhenInactive === 'boolean') &&
        (effect.experience === undefined || (Array.isArray(effect.experience) && effect.experience.every(validateExperienceTriggerShape)))
    ));

const validateInteractionTypesShape = (interactionTypes: unknown): interactionTypes is InteractionTypeDefinition[] =>
  interactionTypes === undefined ||
  (Array.isArray(interactionTypes) &&
    interactionTypes.every(
      (interactionType) =>
        isRecord(interactionType) &&
        hasString(interactionType, 'id') &&
        hasString(interactionType, 'sourceStatId') &&
        hasString(interactionType, 'targetStatId') &&
        typeof interactionType.targetPlayerHealth === 'boolean' &&
        (interactionType.experience === undefined || (Array.isArray(interactionType.experience) && interactionType.experience.every(validateExperienceTriggerShape))),
    ));

const validateEnemiesShape = (enemies: unknown): enemies is EnemyDefinition[] =>
  enemies === undefined ||
  (Array.isArray(enemies) &&
    enemies.every(
      (enemy) =>
        isRecord(enemy) &&
        hasString(enemy, 'id') &&
        hasString(enemy, 'interactionTypeId') &&
        (enemy.stats === undefined || (isRecord(enemy.stats) && Object.values(enemy.stats).every((value) => typeof value === 'number' && Number.isFinite(value)))) &&
        Array.isArray(enemy.rewards) && enemy.rewards.every(validateRewardShape),
    ));

const validateDropTablesShape = (dropTables: unknown): dropTables is DropTableDefinition[] =>
  dropTables === undefined ||
  (Array.isArray(dropTables) &&
    dropTables.every((dropTable) =>
      isRecord(dropTable) &&
      hasString(dropTable, 'id') &&
      (dropTable.mode === 'independent' || dropTable.mode === 'dependent') &&
      validateDropEntriesShape(dropTable.drops),
    ));

const validateRecipeIngredientsShape = (value: unknown): value is RecipeIngredient[] =>
  Array.isArray(value) && value.length > 0 && value.every((ingredient) =>
    isRecord(ingredient) &&
    hasString(ingredient, 'itemId') &&
    typeof ingredient.amount === 'number' &&
    ingredient.amount > 0);

const validateRecipesShape = (recipes: unknown): recipes is RecipeDefinition[] =>
  recipes === undefined ||
  (Array.isArray(recipes) &&
    recipes.every((recipe) =>
      isRecord(recipe) &&
      hasString(recipe, 'id') &&
      hasString(recipe, 'stationId') &&
      (recipe.skillId === undefined || typeof recipe.skillId === 'string') &&
      (recipe.xpAmount === undefined || typeof recipe.xpAmount === 'number') &&
      (recipe.durationSeconds === undefined || (typeof recipe.durationSeconds === 'number' && recipe.durationSeconds > 0)) &&
      (recipe.resultMessageKey === undefined || typeof recipe.resultMessageKey === 'string') &&
      (recipe.extraResults === undefined || (Array.isArray(recipe.extraResults) && recipe.extraResults.every(validateActionResultShape))) &&
      validateRecipeIngredientsShape(recipe.inputs) &&
      validateRecipeIngredientsShape(recipe.outputs)));

const validateStatModifiersShape = (statModifiers: unknown): statModifiers is StatModifierDefinition[] =>
  statModifiers === undefined ||
  (Array.isArray(statModifiers) &&
    statModifiers.every((modifier) =>
      isRecord(modifier) &&
      hasString(modifier, 'id') &&
      hasString(modifier, 'statId') &&
      typeof modifier.amount === 'number' &&
      (modifier.kind === 'added' || modifier.kind === 'increased') &&
      validateConditionShape(modifier.activeWhen)));

const validateDialogueOptionShape = (value: unknown) => isRecord(value)
  && hasString(value, 'id')
  && hasString(value, 'labelKey')
  && (value.conditions === undefined || validateConditionShape(value.conditions))
  && (value.results === undefined || (Array.isArray(value.results) && value.results.every(validateActionResultShape)))
  && (value.gotoNodeId === undefined || hasString(value, 'gotoNodeId'));

const validateDialoguesShape = (dialogues: unknown): dialogues is DialogueDefinition[] =>
  dialogues === undefined ||
  (Array.isArray(dialogues) &&
    dialogues.every((dialogue) =>
      isRecord(dialogue) &&
      hasString(dialogue, 'id') &&
      hasString(dialogue, 'startNodeId') &&
      Array.isArray(dialogue.nodes) &&
      dialogue.nodes.every((node) =>
        isRecord(node) &&
        hasString(node, 'id') &&
        (node.speakerId === undefined || hasString(node, 'speakerId')) &&
        (node.textKey === undefined || hasString(node, 'textKey')) &&
        (node.narratorKey === undefined || hasString(node, 'narratorKey')) &&
        (node.results === undefined || (Array.isArray(node.results) && node.results.every(validateActionResultShape))) &&
        (node.branches === undefined || (Array.isArray(node.branches) && node.branches.every((branch) => isRecord(branch) && validateConditionShape(branch.conditions) && hasString(branch, 'gotoNodeId')))) &&
        (node.gotoNodeId === undefined || hasString(node, 'gotoNodeId')) &&
        (node.options === undefined || (Array.isArray(node.options) && node.options.every(validateDialogueOptionShape))),
      ),
    ));

const validateCollectionLogsShape = (collectionLogs: unknown) =>
  collectionLogs === undefined ||
  (Array.isArray(collectionLogs) && collectionLogs.every((definition) =>
    isRecord(definition) &&
    hasString(definition, 'id') &&
    hasString(definition, 'categoryId') &&
    hasString(definition, 'entityId') &&
    hasString(definition, 'actionId') &&
    (definition.killTargetCount === undefined || (Number.isInteger(definition.killTargetCount) && Number(definition.killTargetCount) >= 1)) &&
    (definition.dropTableIds === undefined || validateStringArray(definition.dropTableIds)) &&
    (definition.itemIds === undefined || validateStringArray(definition.itemIds))));

export const validateContentShape = (bundle: Partial<ContentBundle>) => {
  const issues: ValidationIssue[] = [];

  if (!bundle.manifest || !validateManifest(bundle.manifest)) {
    issues.push(error('universe.json', 'validation.universeManifestMissing'));
  } else {
    if (bundle.manifest.combatBalance?.['damage-scaler'] !== undefined && bundle.manifest.combatBalance['damage-scaler'] <= 0) {
      issues.push(error('universe.json.combatBalance.damage-scaler', 'validation.damageScalerPositive'));
    }
    for (const key of ['starting-experience', 'level-factor', 'exponential'] as const) {
      if (bundle.manifest.experienceCurve?.[key] !== undefined && bundle.manifest.experienceCurve[key] <= 0) {
        issues.push(error(`universe.json.experienceCurve.${key}`, 'validation.experienceCurvePositive'));
      }
    }
    if (bundle.manifest.ui?.floatingTextDurationSeconds !== undefined && bundle.manifest.ui.floatingTextDurationSeconds <= 0) {
      issues.push(error('universe.json.ui.floatingTextDurationSeconds', 'validation.floatingTextDurationPositive'));
    }
    for (const [itemId, amount] of Object.entries(bundle.manifest.basePlayer?.inventory ?? {})) {
      if (amount < 0) {
        issues.push(error(`universe.json.basePlayer.inventory.${itemId}`, 'validation.inventoryAmountNonNegative'));
      }
    }
  }

  if (!validateLocationsShape(bundle.locations)) {
    issues.push(error('locations.json', 'validation.locationsShape'));
  }

  if (!validateEntitiesShape(bundle.entities)) {
    issues.push(error('entities.json', 'validation.entitiesShape'));
  }

  if (!validateActionsShape(bundle.actions)) {
    issues.push(error('actions.json', 'validation.actionsShape'));
  }

  if (!validateSkillsShape(bundle.skills)) {
    issues.push(error('skills.json', 'validation.skillsShape'));
  }

  if (!validateStatsShape(bundle.stats)) {
    issues.push(error('stats.json', 'validation.statsShape'));
  }

  if (!validateItemsShape(bundle.items)) {
    issues.push(error('items.json', 'validation.itemsShape'));
  }

  if (!validateFlagsShape(bundle.flags)) {
    issues.push(error('flags.json', 'validation.flagsShape'));
  }

  if (!validateResourceDefinitionsShape(bundle.resourceDefinitions)) {
    issues.push(error('resources.json', 'validation.resourcesShape'));
  }

  if (!validateEffectsShape(bundle.effects)) {
    issues.push(error('effects.json', 'validation.effectsShape'));
  }

  if (!validateInteractionTypesShape(bundle.interactionTypes)) {
    issues.push(error('interaction-types.json', 'validation.interactionTypesShape'));
  }

  if (!validateEnemiesShape(bundle.enemies)) {
    issues.push(error('enemies.json', 'validation.enemiesShape'));
  }

  if (!validateDropTablesShape(bundle.dropTables)) {
    issues.push(error('drop-tables.json', 'validation.dropTablesShape'));
  }

  if (!validateCollectionLogsShape(bundle.collectionLogs)) {
    issues.push(error('collection-log.json', 'validation.collectionLogShape'));
  }

  if (!validateDialoguesShape(bundle.dialogues)) {
    issues.push(error('dialogues.json', 'validation.dialoguesShape'));
  }

  if (!validateRecipesShape(bundle.recipes)) {
    issues.push(error('recipes.json', 'validation.recipesShape'));
  }

  if (!validateStatModifiersShape(bundle.statModifiers)) {
    issues.push(error('stat-modifiers.json', 'validation.statModifiersShape'));
  }

  return issues;
};

const findDuplicateIds = <T extends { id: string }>(items: T[], path: string) => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.id)) {
      issues.push(error(`${path}.${item.id}`, 'validation.duplicateId', { id: item.id }));
    }
    seen.add(item.id);
  }

  return issues;
};

const findDuplicateStrings = (items: string[] | undefined, path: string) => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const item of items ?? []) {
    if (seen.has(item)) {
      issues.push(error(path, 'validation.duplicateId', { id: item }));
    }
    seen.add(item);
  }

  return issues;
};

export const validateContentReferences = (bundle: ContentBundle) => {
  const issues: ValidationIssue[] = [
    ...findDuplicateIds(bundle.locations, 'locations'),
    ...findDuplicateIds(bundle.entities ?? [], 'entities'),
    ...findDuplicateIds(bundle.actions, 'actions'),
    ...findDuplicateIds(bundle.skills, 'skills'),
    ...findDuplicateIds(bundle.stats, 'stats'),
    ...findDuplicateIds(bundle.items ?? [], 'items'),
    ...findDuplicateIds(bundle.flags ?? [], 'flags'),
    ...findDuplicateIds(bundle.resourceDefinitions ?? [], 'resources'),
    ...findDuplicateIds(bundle.effects ?? [], 'effects'),
    ...findDuplicateIds(bundle.interactionTypes ?? [], 'interactionTypes'),
    ...findDuplicateIds(bundle.enemies ?? [], 'enemies'),
    ...findDuplicateIds(bundle.dropTables ?? [], 'dropTables'),
    ...findDuplicateIds(bundle.collectionLogs ?? [], 'collectionLogs'),
    ...findDuplicateIds(bundle.dialogues ?? [], 'dialogues'),
  ];

  const locationIds = new Set(bundle.locations.map((location) => location.id));
  const entityIds = new Set((bundle.entities ?? []).map((entity) => entity.id));
  const entityActionIds = new Set((bundle.entities ?? []).flatMap((entity) => entity.actionIds ?? []));
  const actionIds = new Set(bundle.actions.map((action) => action.id));
  const skillIds = new Set(bundle.skills.map((skill) => skill.id));
  const statIds = new Set(bundle.stats.map((stat) => stat.id));
  const itemIds = new Set((bundle.items ?? []).map((item) => item.id));
  const flagIds = new Set((bundle.flags ?? []).map((flag) => flag.id));
  const resourceIds = new Set((bundle.resourceDefinitions ?? []).map((resource) => resource.id));
  const interactionTypeIds = new Set((bundle.interactionTypes ?? []).map((interactionType) => interactionType.id));
  const enemyIds = new Set((bundle.enemies ?? []).map((enemy) => enemy.id));
  const dropTableIds = new Set((bundle.dropTables ?? []).map((dropTable) => dropTable.id));
  const dropTables = new Map((bundle.dropTables ?? []).map((dropTable) => [dropTable.id, dropTable]));
  const dialogueIds = new Set((bundle.dialogues ?? []).map((dialogue) => dialogue.id));
  const locale = bundle.locales[bundle.manifest.locales[0]] ?? {};

  const knownStateVariables = () => new Set([
    ...Array.from(flagIds, (id) => `flag:${id}`),
    ...Array.from(itemIds, (id) => `item:${id}`),
    ...Array.from(resourceIds, (id) => `resource:${id}`),
    ...Array.from(skillIds, (id) => `skill-level:${id}`),
    ...Array.from(statIds, (id) => `stat:${id}`),
    ...bundle.actions.map((action) => `action-completions:${action.id}`),
    ...(bundle.entities ?? []).flatMap((entity) => (entity.actions ?? []).map((action) => `action-completions:${action.id}`)),
    ...(bundle.items ?? []).flatMap((item) => (item.actions ?? []).map((action) => `action-completions:${action.id}`)),
    'location',
    'active-action',
    'active-interaction',
  ]);

  const validateConditionReferences = (condition: Condition, path: string) => {
    if (condition.kind === 'all' || condition.kind === 'any') {
      condition.conditions.forEach((child, index) => validateConditionReferences(child, `${path}.conditions.${index}`));
    } else if (condition.kind === 'not') {
      validateConditionReferences(condition.condition, `${path}.condition`);
    } else if (condition.kind === 'item-tag' || condition.kind === 'equipped-item-tag') {
      const hasTag = (bundle.items ?? []).some((item) => (item.tags ?? '').split(',').some((tag) => tag.trim().split(/\s|\(/)[0] === condition.tag));
      if (!hasTag) issues.push(error(path, 'validation.unknownItemTag', { id: condition.tag }));
    } else if (condition.kind === 'state-variable') {
      if (!knownStateVariables().has(condition.variable)) issues.push(error(path, 'validation.unknownStateVariable', { id: condition.variable }));
    }
  };

  const validateDropEntries = (drops: DropTableDefinition['drops'], path: string, stack: string[]) => {
    if (drops.length === 0) issues.push(error(path, 'validation.dropTableEmpty'));
    for (const [index, drop] of drops.entries()) {
      const dropPath = `${path}.${index}`;
      if (drop.weight <= 0) issues.push(error(`${dropPath}.weight`, 'validation.dropTableWeightPositive'));
      if (drop.reward) validateRewardReferences(drop.reward, `${dropPath}.reward`, stack);
      if (drop.dropTableId) validateRewardReferences({ kind: 'dropTable', dropTableId: drop.dropTableId }, `${dropPath}.dropTableId`, stack);
      if (drop.drops) validateDropEntries(drop.drops, `${dropPath}.drops`, stack);
    }
  };

  const validateDropTableEntries = (dropTable: DropTableDefinition, path: string, stack: string[]) => {
    if (dropTable.drops.length === 0) issues.push(error(path, 'validation.dropTableEmpty'));
    validateDropEntries(dropTable.drops, `${path}.drops`, stack);
  };

  const validateRewardReferences = (reward: Reward, path: string, stack: string[] = []) => {
    if (reward.kind === 'dropTable') {
      if (reward.drops) {
        validateDropEntries(reward.drops, `${path}.drops`, stack);
      }
      if (!reward.dropTableId) return;
      if (!dropTableIds.has(reward.dropTableId)) {
        issues.push(error(path, 'validation.unknownDropTable', { id: reward.dropTableId }));
        return;
      }
      if (stack.includes(reward.dropTableId)) {
        issues.push(error(path, 'validation.dropTableCycle', { id: reward.dropTableId }));
        return;
      }
      validateDropTableEntries(dropTables.get(reward.dropTableId)!, `dropTables.${reward.dropTableId}`, [...stack, reward.dropTableId]);
      return;
    }
    if (reward.kind === 'skillXp' && !skillIds.has(reward.skillId)) {
      issues.push(error(path, 'validation.unknownSkill', { id: reward.skillId }));
    }
    if (reward.kind === 'resource' && !itemIds.has(reward.resourceId) && !resourceIds.has(reward.resourceId)) {
      issues.push(error(path, 'validation.unknownResource', { id: reward.resourceId }));
    }
    if (reward.kind === 'item' && !itemIds.has(reward.itemId)) {
      issues.push(error(path, 'validation.unknownItem', { id: reward.itemId }));
    }
    if (!rewardAmountPositive(reward.amount)) {
      issues.push(error(path, 'validation.rewardAmountPositive'));
    }
  };

  const validateExperienceTriggerReferences = (trigger: ExperienceTrigger, path: string) => {
    if (!skillIds.has(trigger.skillId)) issues.push(error(path, 'validation.unknownSkill', { id: trigger.skillId }));
    if (trigger.resourceId && !resourceIds.has(trigger.resourceId)) issues.push(error(path, 'validation.unknownResource', { id: trigger.resourceId }));
    if (trigger.effectId && !(bundle.effects ?? []).some((effect) => effect.id === trigger.effectId)) issues.push(error(path, 'validation.unknownEffect', { id: trigger.effectId }));
    if (trigger.enemyId && !enemyIds.has(trigger.enemyId)) issues.push(error(path, 'validation.unknownEnemy', { id: trigger.enemyId }));
    if (trigger.interactionTypeId && !interactionTypeIds.has(trigger.interactionTypeId)) issues.push(error(path, 'validation.unknownInteractionType', { id: trigger.interactionTypeId }));
    if (trigger.sourceStat && !statIds.has(trigger.sourceStat)) issues.push(error(path, 'validation.unknownStat', { id: trigger.sourceStat }));
    if (trigger.amount !== undefined && trigger.amount <= 0) issues.push(error(path, 'validation.experienceAmountPositive'));
    if (trigger.amountPerUnit !== undefined && trigger.amountPerUnit <= 0) issues.push(error(path, 'validation.experienceAmountPositive'));
  };

  for (const [index, trigger] of (bundle.manifest.experience ?? []).entries()) {
    validateExperienceTriggerReferences(trigger, `universe.json.experience.${index}`);
  }

  if (!bundle.locations.some((location) => location.starting)) {
    issues.push(error('locations', 'validation.startingLocationMissing'));
  }

  for (const entity of bundle.entities ?? []) {
    if (!isKebabCaseId(entity.id)) {
      issues.push(error(`entities.${entity.id}.id`, 'validation.entityIdKebab'));
    }
    for (const actionId of entity.actionIds ?? []) {
      if (!actionIds.has(actionId)) {
        issues.push(error(`entities.${entity.id}.actionIds`, 'validation.unknownAction', { id: actionId }));
      }
    }
    for (const [index, definition] of (entity.collectionLog ?? []).entries()) {
      const path = `entities.${entity.id}.collectionLog.${index}`;
      if (!(entity.actionIds ?? []).includes(definition.actionId)) {
        issues.push(error(`${path}.actionId`, 'validation.unknownAction', { id: definition.actionId }));
      }
      if (!actionIds.has(definition.actionId)) {
        issues.push(error(`${path}.actionId`, 'validation.unknownAction', { id: definition.actionId }));
      }
      if (definition.killTargetCount !== undefined && definition.killTargetCount < 1) {
        issues.push(error(`${path}.killTargetCount`, 'validation.collectionTargetPositive'));
      }
      for (const dropTableId of definition.dropTableIds ?? []) {
        if (!dropTableIds.has(dropTableId)) issues.push(error(`${path}.dropTableIds`, 'validation.unknownDropTable', { id: dropTableId }));
      }
      for (const itemId of definition.itemIds ?? []) {
        if (!itemIds.has(itemId)) issues.push(error(`${path}.itemIds`, 'validation.unknownItem', { id: itemId }));
      }
      for (const itemId of collectionTrackedItemIds(definition, bundle)) {
        if (!itemIds.has(itemId)) issues.push(error(`${path}.dropTableIds`, 'validation.unknownItem', { id: itemId }));
      }
    }
  }

  for (const definition of bundle.collectionLogs ?? []) {
    const path = `collectionLogs.${definition.id}`;
    if (!isKebabCaseId(definition.id)) issues.push(error(`${path}.id`, 'validation.collectionLogIdKebab'));
    if (!entityIds.has(definition.entityId)) issues.push(error(`${path}.entityId`, 'validation.unknownEntity', { id: definition.entityId }));
    if (!actionIds.has(definition.actionId)) issues.push(error(`${path}.actionId`, 'validation.unknownAction', { id: definition.actionId }));
    if (definition.killTargetCount !== undefined && definition.killTargetCount < 1) {
      issues.push(error(`${path}.killTargetCount`, 'validation.collectionTargetPositive'));
    }
    for (const dropTableId of definition.dropTableIds ?? []) {
      if (!dropTableIds.has(dropTableId)) issues.push(error(`${path}.dropTableIds`, 'validation.unknownDropTable', { id: dropTableId }));
    }
    for (const itemId of definition.itemIds ?? []) {
      if (!itemIds.has(itemId)) issues.push(error(`${path}.itemIds`, 'validation.unknownItem', { id: itemId }));
    }
    for (const itemId of collectionTrackedItemIds(definition, bundle)) {
      if (!itemIds.has(itemId)) issues.push(error(`${path}.dropTableIds`, 'validation.unknownItem', { id: itemId }));
    }
  }

  for (const action of bundle.actions) {
    if (!isDottedKebabCaseId(action.id)) {
      issues.push(error(`actions.${action.id}.id`, 'validation.actionIdKebab'));
    }
    if (action.locationId === undefined && action.itemId === undefined && !entityActionIds.has(action.id)) {
      issues.push(error(`actions.${action.id}.locationId`, 'validation.actionLocationOrEntityRequired'));
    }
    if (action.locationId !== undefined && !locationIds.has(action.locationId)) {
      issues.push(error(`actions.${action.id}.locationId`, 'validation.unknownLocation', { id: action.locationId }));
    }
    if ((action.results ?? []).filter((result) => result.kind === 'chat').length > 2) {
      issues.push(error(`actions.${action.id}.results`, 'validation.tooManySequentialMessages'));
    }
    if (!action.instant && action.stationId === undefined && action.role !== 'travel' && (action.durationSeconds ?? 0) <= 0) {
      issues.push(error(`actions.${action.id}.durationSeconds`, 'validation.actionDurationPositive'));
    }
    if (action.role === 'travel' && action.durationSeconds !== undefined) {
      issues.push(warning(`actions.${action.id}.durationSeconds`, 'validation.travelDurationUnused'));
    }
    if (action.interactionTypeId && !interactionTypeIds.has(action.interactionTypeId)) {
      issues.push(error(`actions.${action.id}.interactionTypeId`, 'validation.unknownInteractionType', { id: action.interactionTypeId }));
    }
    if (action.enemyId && !enemyIds.has(action.enemyId)) {
      issues.push(error(`actions.${action.id}.enemyId`, 'validation.unknownEnemy', { id: action.enemyId }));
    }
    if (action.maxCompletions !== undefined && (!Number.isInteger(action.maxCompletions) || action.maxCompletions < 1)) {
      issues.push(error(`actions.${action.id}.maxCompletions`, 'validation.actionMaxCompletionsPositive'));
    }
    if (action.visibleWhen) {
      validateConditionReferences(action.visibleWhen, `actions.${action.id}.visibleWhen`);
    }
    if (action.requirements && !Array.isArray(action.requirements)) {
      validateConditionReferences(action.requirements, `actions.${action.id}.requirements`);
    }
    action.rewards.forEach((reward, index) => validateRewardReferences(reward, `actions.${action.id}.rewards.${index}`));
    for (const [index, trigger] of (action.experience ?? []).entries()) {
      validateExperienceTriggerReferences(trigger, `actions.${action.id}.experience.${index}`);
    }
    for (const [index, result] of (action.results ?? []).entries()) {
      const path = `actions.${action.id}.results.${index}`;
      if (result.kind === 'item' && !itemIds.has(result.itemId)) issues.push(error(path, 'validation.unknownItem', { id: result.itemId }));
      if (result.kind === 'resource' && !resourceIds.has(result.resourceId)) issues.push(error(path, 'validation.unknownResource', { id: result.resourceId }));
      if (result.kind === 'skill-xp' && !skillIds.has(result.skillId)) issues.push(error(path, 'validation.unknownSkill', { id: result.skillId }));
      if (result.kind === 'state-variable' && !knownStateVariables().has(result.variable)) issues.push(error(path, 'validation.unknownStateVariable', { id: result.variable }));
      if (result.kind === 'state-variable-delta' && !knownStateVariables().has(result.variable)) issues.push(error(path, 'validation.unknownStateVariable', { id: result.variable }));
      if (result.kind === 'state-variable' && result.variable === 'location' && result.value !== 'starting-location' && !locationIds.has(String(result.value))) issues.push(error(path, 'validation.unknownLocation', { id: String(result.value) }));
      if (result.kind === 'flag' && !flagIds.has(result.flagId)) issues.push(error(path, 'validation.unknownFlag', { id: result.flagId }));
      if (result.kind === 'relocate' && result.locationId !== 'starting-location' && !locationIds.has(result.locationId)) issues.push(error(path, 'validation.unknownLocation', { id: result.locationId }));
      if (result.kind === 'dialogue' && !dialogueIds.has(result.dialogueId)) issues.push(error(path, 'validation.unknownDialogue', { id: result.dialogueId }));
      if ('amount' in result && result.amount === 0) issues.push(error(path, 'validation.resultAmountNonZero'));
    }
  }

  for (const dropTable of bundle.dropTables ?? []) {
    if (!isKebabCaseId(dropTable.id)) issues.push(error(`dropTables.${dropTable.id}.id`, 'validation.dropTableIdKebab'));
    validateDropTableEntries(dropTable, `dropTables.${dropTable.id}`, [dropTable.id]);
  }

  for (const recipe of bundle.recipes ?? []) {
    const path = `recipes.${recipe.id}`;
    if (recipe.skillId && !skillIds.has(recipe.skillId)) issues.push(error(`${path}.skillId`, 'validation.unknownSkill', { id: recipe.skillId }));
    for (const ingredient of [...recipe.inputs, ...recipe.outputs]) {
      if (!itemIds.has(ingredient.itemId)) issues.push(error(`${path}.itemId`, 'validation.unknownItem', { id: ingredient.itemId }));
    }
  }

  for (const modifier of bundle.statModifiers ?? []) {
    if (!statIds.has(modifier.statId)) issues.push(error(`statModifiers.${modifier.id}.statId`, 'validation.unknownStat', { id: modifier.statId }));
  }

  const validateResultReferences = (result: ActionResult, path: string) => {
    if (result.kind === 'item' && !itemIds.has(result.itemId)) issues.push(error(path, 'validation.unknownItem', { id: result.itemId }));
    if (result.kind === 'resource' && !resourceIds.has(result.resourceId)) issues.push(error(path, 'validation.unknownResource', { id: result.resourceId }));
    if (result.kind === 'skill-xp' && !skillIds.has(result.skillId)) issues.push(error(path, 'validation.unknownSkill', { id: result.skillId }));
    if ((result.kind === 'state-variable' || result.kind === 'state-variable-delta') && !knownStateVariables().has(result.variable)) issues.push(error(path, 'validation.unknownStateVariable', { id: result.variable }));
    if (result.kind === 'state-variable' && result.variable === 'location' && result.value !== 'starting-location' && !locationIds.has(String(result.value))) issues.push(error(path, 'validation.unknownLocation', { id: String(result.value) }));
    if (result.kind === 'flag' && !flagIds.has(result.flagId)) issues.push(error(path, 'validation.unknownFlag', { id: result.flagId }));
    if (result.kind === 'relocate' && result.locationId !== 'starting-location' && !locationIds.has(result.locationId)) issues.push(error(path, 'validation.unknownLocation', { id: result.locationId }));
    if (result.kind === 'dialogue' && !dialogueIds.has(result.dialogueId)) issues.push(error(path, 'validation.unknownDialogue', { id: result.dialogueId }));
    if ('amount' in result && result.amount === 0) issues.push(error(path, 'validation.resultAmountNonZero'));
  };

  for (const dialogue of bundle.dialogues ?? []) {
    const nodeIds = new Set(dialogue.nodes.map((node) => node.id));
    if (!isKebabCaseId(dialogue.id)) issues.push(error(`dialogues.${dialogue.id}.id`, 'validation.dialogueIdKebab'));
    if (!nodeIds.has(dialogue.startNodeId)) issues.push(error(`dialogues.${dialogue.id}.startNodeId`, 'validation.unknownDialogueNode', { id: dialogue.startNodeId }));
    for (const node of dialogue.nodes) {
      const nodePath = `dialogues.${dialogue.id}.nodes.${node.id}`;
      if (node.gotoNodeId && !nodeIds.has(node.gotoNodeId)) issues.push(error(`${nodePath}.gotoNodeId`, 'validation.unknownDialogueNode', { id: node.gotoNodeId }));
      for (const [index, branch] of (node.branches ?? []).entries()) {
        validateConditionReferences(branch.conditions, `${nodePath}.branches.${index}.conditions`);
        if (!nodeIds.has(branch.gotoNodeId)) issues.push(error(`${nodePath}.branches.${index}.gotoNodeId`, 'validation.unknownDialogueNode', { id: branch.gotoNodeId }));
      }
      for (const [index, result] of (node.results ?? []).entries()) validateResultReferences(result, `${nodePath}.results.${index}`);
      for (const [index, option] of (node.options ?? []).entries()) {
        if (option.conditions) validateConditionReferences(option.conditions, `${nodePath}.options.${index}.conditions`);
        if (option.gotoNodeId && !nodeIds.has(option.gotoNodeId)) issues.push(error(`${nodePath}.options.${index}.gotoNodeId`, 'validation.unknownDialogueNode', { id: option.gotoNodeId }));
        for (const [resultIndex, result] of (option.results ?? []).entries()) validateResultReferences(result, `${nodePath}.options.${index}.results.${resultIndex}`);
      }
    }
  }

  for (const location of bundle.locations) {
    if (!isKebabCaseId(location.id)) {
      issues.push(error(`locations.${location.id}.id`, 'validation.locationIdKebab'));
    }
    issues.push(...findDuplicateStrings(location.entities, `locations.${location.id}.entities`));
    for (const entityId of location.entities ?? []) {
      if (!entityIds.has(entityId)) {
        issues.push(error(`locations.${location.id}.entities`, 'validation.unknownEntity', { id: entityId }));
      }
    }
    issues.push(...findDuplicateStrings(location.actions, `locations.${location.id}.actions`));
    for (const actionId of location.actions ?? []) {
      if (!actionIds.has(actionId)) {
        issues.push(error(`locations.${location.id}.actions`, 'validation.unknownAction', { id: actionId }));
      }
    }
  }

  for (const skill of bundle.skills) {
    if (!isKebabCaseId(skill.id)) {
      issues.push(error(`skills.${skill.id}.id`, 'validation.skillIdKebab'));
    }
    if (skill.statId && !statIds.has(skill.statId)) issues.push(error(`skills.${skill.id}.statId`, 'validation.unknownStat', { id: skill.statId }));
  }

  for (const stat of bundle.stats) {
    if (!isKebabCaseId(stat.id)) issues.push(error(`stats.${stat.id}.id`, 'validation.statIdKebab'));
  }

  for (const resource of bundle.resourceDefinitions ?? []) {
    if (!isKebabCaseId(resource.id)) {
      issues.push(error(`resources.${resource.id}.id`, 'validation.resourceIdKebab'));
    }
    if (!statIds.has(resource.sourceStat)) {
      issues.push(error(`resources.${resource.id}.sourceStat`, 'validation.unknownStat', { id: resource.sourceStat }));
    }
    for (const behavior of [...(resource.onEmpty ?? []), ...(resource.onFull ?? [])]) {
      if (behavior.kind === 'relocate' && behavior.locationId !== 'starting-location' && !locationIds.has(behavior.locationId)) {
        issues.push(error(`resources.${resource.id}`, 'validation.unknownLocation', { id: behavior.locationId }));
      }
      if (behavior.kind === 'reset-state') {
        if (behavior.locationId && behavior.locationId !== 'starting-location' && !locationIds.has(behavior.locationId)) issues.push(error(`resources.${resource.id}`, 'validation.unknownLocation', { id: behavior.locationId }));
        if (behavior.incrementVariable && !knownStateVariables().has(behavior.incrementVariable)) issues.push(error(`resources.${resource.id}`, 'validation.unknownStateVariable', { id: behavior.incrementVariable }));
        if (behavior.incrementFlagId && !flagIds.has(behavior.incrementFlagId)) issues.push(error(`resources.${resource.id}`, 'validation.unknownFlag', { id: behavior.incrementFlagId }));
        for (const id of behavior.preserve?.inventoryIds ?? []) if (!itemIds.has(id)) issues.push(error(`resources.${resource.id}`, 'validation.unknownItem', { id }));
        for (const id of behavior.preserve?.resourceIds ?? []) if (!resourceIds.has(id)) issues.push(error(`resources.${resource.id}`, 'validation.unknownResource', { id }));
        for (const id of behavior.preserve?.variableIds ?? []) if (!knownStateVariables().has(id)) issues.push(error(`resources.${resource.id}`, 'validation.unknownStateVariable', { id }));
        for (const id of behavior.preserve?.flagIds ?? []) if (!flagIds.has(id)) issues.push(error(`resources.${resource.id}`, 'validation.unknownFlag', { id }));
        for (const id of behavior.preserve?.actionCompletionIds ?? []) if (!bundle.actions.some((action) => action.id === id)) issues.push(error(`resources.${resource.id}`, 'validation.unknownAction', { id }));
      }
    }
  }

  for (const effect of bundle.effects ?? []) {
    if (!isKebabCaseId(effect.id)) {
      issues.push(error(`effects.${effect.id}.id`, 'validation.effectIdKebab'));
    }
    if (!resourceIds.has(effect.resourceId)) {
      issues.push(error(`effects.${effect.id}.resourceId`, 'validation.unknownResource', { id: effect.resourceId }));
    }
    if (!statIds.has(effect.sourceStat)) {
      issues.push(error(`effects.${effect.id}.sourceStat`, 'validation.unknownStat', { id: effect.sourceStat }));
    }
    if (effect.locationId && !locationIds.has(effect.locationId)) {
      issues.push(error(`effects.${effect.id}.locationId`, 'validation.unknownLocation', { id: effect.locationId }));
    }
    if (effect.activeWhen) {
      validateConditionReferences(effect.activeWhen, `effects.${effect.id}.activeWhen`);
    }
    for (const [index, trigger] of (effect.experience ?? []).entries()) {
      validateExperienceTriggerReferences(trigger, `effects.${effect.id}.experience.${index}`);
    }
  }

  for (const interactionType of bundle.interactionTypes ?? []) {
    if (!isKebabCaseId(interactionType.id)) {
      issues.push(error(`interactionTypes.${interactionType.id}.id`, 'validation.interactionTypeIdKebab'));
    }
    if (!statIds.has(interactionType.sourceStatId)) {
      issues.push(error(`interactionTypes.${interactionType.id}.sourceStatId`, 'validation.unknownStat', { id: interactionType.sourceStatId }));
    }
    if (!statIds.has(interactionType.targetStatId)) {
      issues.push(error(`interactionTypes.${interactionType.id}.targetStatId`, 'validation.unknownStat', { id: interactionType.targetStatId }));
    }
    for (const [index, trigger] of (interactionType.experience ?? []).entries()) {
      validateExperienceTriggerReferences(trigger, `interactionTypes.${interactionType.id}.experience.${index}`);
    }
  }

  for (const enemy of bundle.enemies ?? []) {
    if (!isKebabCaseId(enemy.id)) {
      issues.push(error(`enemies.${enemy.id}.id`, 'validation.enemyIdKebab'));
    }
    if (!interactionTypeIds.has(enemy.interactionTypeId)) {
      issues.push(error(`enemies.${enemy.id}.interactionTypeId`, 'validation.unknownInteractionType', { id: enemy.interactionTypeId }));
    }
    if (getEnemyStat(enemy, 'health') <= 0) {
      issues.push(error(`enemies.${enemy.id}.health`, 'validation.healthPositive'));
    }
    if (getEnemyStat(enemy, 'attack') <= 0) {
      issues.push(error(`enemies.${enemy.id}.attack`, 'validation.attackPositive'));
    }
    if (getEnemyStat(enemy, 'defense') < 0) {
      issues.push(error(`enemies.${enemy.id}.defense`, 'validation.defenseNonNegative'));
    }
    if (getEnemyStat(enemy, 'rate') < 0) {
      issues.push(error(`enemies.${enemy.id}.rate`, 'validation.rateNonNegative'));
    }
    if (getEnemyStat(enemy, 'regeneration') < 0 || getEnemyStat(enemy, 'armorPenetration') < 0 || getEnemyStat(enemy, 'torpidity') < 0) {
      issues.push(error(`enemies.${enemy.id}`, 'validation.enemyModifiersNonNegative'));
    }
    if (getEnemyStat(enemy, 'critChance') < 0 || getEnemyStat(enemy, 'critChance') > 100) {
      issues.push(error(`enemies.${enemy.id}.critChance`, 'validation.critChanceRange'));
    }
    if (getEnemyStat(enemy, 'critMultiplier') < 1) {
      issues.push(error(`enemies.${enemy.id}.critMultiplier`, 'validation.critMultiplierMinimum'));
    }
    if (enemy.offensiveTags !== undefined && typeof enemy.offensiveTags !== 'string') {
      issues.push(error(`enemies.${enemy.id}.offensiveTags`, 'validation.itemTagsString'));
    }
    if (enemy.defensiveTags !== undefined && typeof enemy.defensiveTags !== 'string') {
      issues.push(error(`enemies.${enemy.id}.defensiveTags`, 'validation.itemTagsString'));
    }
    for (const key of Object.keys(enemy.stats ?? {})) {
      if (!(ENEMY_STAT_KEYS as string[]).includes(key)) {
        issues.push(error(`enemies.${enemy.id}.stats.${key}`, 'validation.unknownEnemyStat', { id: key }));
      }
    }
    enemy.rewards.forEach((reward, index) => validateRewardReferences(reward, `enemies.${enemy.id}.rewards.${index}`));
  }

  for (const item of bundle.items ?? []) {
    if (!isKebabCaseId(item.id)) {
      issues.push(error(`items.${item.id}.id`, 'validation.itemIdKebab'));
    }
    if (item.maxQuantity !== undefined && item.maxQuantity < 1) {
      issues.push(error(`items.${item.id}.maxQuantity`, 'validation.itemMaxPositive'));
    }
    if (item.tags !== undefined && typeof item.tags !== 'string') {
      issues.push(error(`items.${item.id}.tags`, 'validation.itemTagsString'));
    }
    if (item.offensiveTags !== undefined && typeof item.offensiveTags !== 'string') {
      issues.push(error(`items.${item.id}.offensiveTags`, 'validation.itemTagsString'));
    }
    if (item.defensiveTags !== undefined && typeof item.defensiveTags !== 'string') {
      issues.push(error(`items.${item.id}.defensiveTags`, 'validation.itemTagsString'));
    }
  }

  for (const flag of bundle.flags ?? []) {
    if (!isDottedKebabCaseId(flag.id)) {
      issues.push(error(`flags.${flag.id}.id`, 'validation.flagIdKebab'));
    }
  }

  for (const key of collectLocalizationKeys(bundle)) {
    if (!locale[key]) {
      issues.push(warning(`locales.${bundle.manifest.locales[0]}.${key}`, 'validation.missingLocalization'));
    }
  }

  return issues;
};

export const validateContentBundle = (bundle: ContentBundle): ValidationIssue[] => [
  ...validateContentShape(bundle),
  ...validateContentReferences(bundle),
];

export const collectLocalizationKeys = (bundle: ContentBundle) => [
  universeTitleKey(bundle.manifest.id),
  universeDescriptionKey(bundle.manifest.id),
  ...bundle.locations.flatMap((location) => [
    locationTitleKey(location.id),
    locationDescriptionKey(location.id),
    bundle.actions.some((action) => action.locationId === location.id && action.role === 'optional')
      ? locationExhaustedKey(location.id)
      : null,
  ]),
  ...(bundle.entities ?? []).flatMap((entity) => [
    entityTitleKey(entity.id),
    ...(entity.collectionLog ?? []).map((definition) => collectionCategoryTitleKey(definition.categoryId)),
  ]),
  ...bundle.actions.flatMap((action) => [
    actionTitleKey(action.id),
    actionDescriptionKey(action.id),
    actionSuccessKey(action.id),
    actionFailureKey(action.id),
    action.enemyId ? actionKillKey(action.id) : null,
  ]),
  ...bundle.skills.flatMap((skill) => [
    skillTitleKey(skill.id),
    skillDescriptionKey(skill.id),
  ]),
  ...bundle.stats.flatMap((stat) => [statTitleKey(stat.id), statDescriptionKey(stat.id)]),
  ...(bundle.items ?? []).flatMap((item) => [
    itemTitleKey(item.id),
    itemDescriptionKey(item.id),
  ]),
  ...bundle.actions.flatMap((action) => (action.results ?? []).flatMap((result) => result.kind === 'chat' ? [result.messageKey] : [])),
  ...(bundle.dialogues ?? []).flatMap((dialogue) => dialogue.nodes.flatMap((node) => [
    node.textKey,
    node.narratorKey,
    ...(node.options ?? []).map((option) => option.labelKey),
  ])),
  ...(bundle.interactionTypes ?? []).flatMap((interactionType) => [
    interactionTitleKey(interactionType.id),
    interactionPlayerHitKey(interactionType.id),
    interactionPlayerMissKey(interactionType.id),
    interactionPlayerKillKey(interactionType.id),
    interactionEntityHitKey(interactionType.id),
    interactionEntityMissKey(interactionType.id),
    interactionEntityKillKey(interactionType.id),
  ]),
  ...(bundle.resourceDefinitions ?? []).map((resource) => resourceTitleKey(resource.id)),
  ...(bundle.effects ?? []).map((effect) => effectTitleKey(effect.id)),
  ...(bundle.resourceDefinitions ?? []).flatMap((resource) => [
    ...(resource.onEmpty ?? []),
    ...(resource.onFull ?? []),
  ].flatMap((behavior) => behavior.kind === 'chat' ? [behavior.messageKey] : [])),
].filter((key): key is string => Boolean(key));

export const validateLocaleDictionary = (locale: unknown) => {
  if (!isRecord(locale)) {
    return [error('locales', 'validation.localeShape')];
  }

  return Object.entries(locale).flatMap(([key, value]) =>
    typeof value !== 'string' || key.trim().length === 0 || value.trim().length === 0
      ? [error(`locales.${key}`, typeof value === 'string' ? 'validation.localeEmpty' : 'validation.localeShape')]
      : [],
  );
};

export const mergeDraftIntoBundle = (bundle: ContentBundle, draft: ContributionDraft | null): ContentBundle => {
  if (!draft || draft.universeId !== bundle.manifest.id) {
    return bundle;
  }

  return {
    ...bundle,
    manifest: draft.basePlayer || draft.combatBalance || draft.experienceCurve || draft.experience || draft.displayProfiles || draft.ui
      ? {
          ...bundle.manifest,
          ...(draft.basePlayer ? { basePlayer: draft.basePlayer } : {}),
          ...(draft.combatBalance ? { combatBalance: draft.combatBalance } : {}),
          ...(draft.experienceCurve ? { experienceCurve: draft.experienceCurve } : {}),
          ...(draft.experience ? { experience: draft.experience } : {}),
          ...(draft.displayProfiles ? { displayProfiles: draft.displayProfiles } : {}),
          ...(draft.ui ? { ui: draft.ui } : {}),
        }
      : bundle.manifest,
    locations: mergeById(removeById(bundle.locations, draft.removed?.locations ?? []), draft.locations),
    entities: mergeById(removeById(bundle.entities ?? [], draft.removed?.entities ?? []), draft.entities ?? []),
    actions: mergeById(removeById(bundle.actions, draft.removed?.actions ?? []), draft.actions),
    skills: mergeById(removeById(bundle.skills, draft.removed?.skills ?? []), draft.skills),
    stats: mergeById(removeById(bundle.stats, draft.removed?.stats ?? []), draft.stats),
    items: mergeById(removeById(bundle.items ?? [], draft.removed?.items ?? []), draft.items),
    flags: mergeById(removeById(bundle.flags ?? [], draft.removed?.flags ?? []), draft.flags ?? []),
    resourceDefinitions: mergeById(removeById(bundle.resourceDefinitions ?? [], draft.removed?.resources ?? []), draft.resourceDefinitions ?? []),
    effects: mergeById(removeById(bundle.effects ?? [], draft.removed?.effects ?? []), draft.effects ?? []),
    interactionTypes: mergeById(removeById(bundle.interactionTypes ?? [], draft.removed?.interactionTypes ?? []), draft.interactionTypes ?? []),
    enemies: mergeById(removeById(bundle.enemies ?? [], draft.removed?.enemies ?? []), draft.enemies ?? []),
    dropTables: mergeById(removeById(bundle.dropTables ?? [], draft.removed?.dropTables ?? []), draft.dropTables ?? []),
    dialogues: mergeById(removeById(bundle.dialogues ?? [], draft.removed?.dialogues ?? []), draft.dialogues ?? []),
    locales: mergeLocales(bundle.locales, draft.locales),
  };
};

export const mergeValidDraftIntoBundle = (bundle: ContentBundle, draft: ContributionDraft | null) => {
  const merged = mergeDraftIntoBundle(bundle, draft);
  if (!draft || draft.universeId !== bundle.manifest.id || merged === bundle) {
    return { bundle, issues: [] as ValidationIssue[] };
  }

  const issues = validateContentBundle(merged).map((validationIssue) => ({
    ...validationIssue,
    path: `draft.${validationIssue.path}`,
  }));
  if (issues.some((validationIssue) => validationIssue.severity === 'error')) {
    return { bundle, issues };
  }

  return { bundle: merged, issues };
};

export const mergeDraftModulesIntoBundle = (bundle: ContentBundle, draft: ContributionDraft | null): ContentBundle => {
  if (!draft || draft.universeId !== bundle.manifest.id) {
    return bundle;
  }

  // A draft module is allowed to share an id with a packaged one — that's
  // how editing a core/shipped module works (mergeById below overrides by
  // id, last write wins), not just adding brand-new ones. This was
  // previously restricted to non-packaged ids only, which silently dropped
  // every override of an existing module (e.g. any DSL edit to a shipped
  // module like tutorial-island-guide-house never reached the live bundle).
  const draftRemovedModules = new Set(draft.removed?.modules ?? []);
  const localDraftModules = (draft.modules ?? []).filter((module) => !draftRemovedModules.has(module.id));

  return {
    ...bundle,
    modules: mergeById(bundle.modules ?? [], localDraftModules),
    modulePacks: mergeById(bundle.modulePacks ?? [], draft.modulePacks ?? []),
  };
};

const removeById = <T extends { id: string }>(items: T[], removedIds: string[]) => {
  const removed = new Set(removedIds);
  return items.filter((item) => !removed.has(item.id));
};

const mergeById = <T extends { id: string }>(base: T[], draft: T[]) => {
  const merged = new Map(base.map((item) => [item.id, item]));

  for (const item of draft) {
    merged.set(item.id, item);
  }

  return [...merged.values()];
};

const mergeLocales = (
  base: Record<string, LocaleDictionary>,
  draft: Record<string, LocaleDictionary>,
): Record<string, LocaleDictionary> => {
  const merged = { ...base };

  for (const [locale, dictionary] of Object.entries(draft)) {
    merged[locale] = {
      ...(merged[locale] ?? {}),
      ...dictionary,
    };
  }

  return merged;
};
