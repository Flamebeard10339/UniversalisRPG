import type {
  ContentBundle,
  ContributionDraft,
  Condition,
  EnemyDefinition,
  EffectDefinition,
  GameAction,
  InteractionTypeDefinition,
  ItemDefinition,
  LocaleDictionary,
  LocationNode,
  ResourceDefinition,
  SkillDefinition,
  StatDefinition,
  StateFlagDefinition,
  TravelEdgeDefinition,
  UniverseManifest,
  ValidationIssue,
} from './types';
import { ENEMY_STAT_KEYS, getEnemyStat } from './enemies';
import {
  actionDescriptionKey,
  actionFailureKey,
  actionKillKey,
  actionSuccessKey,
  actionTitleKey,
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

const validateResetStateShape = (value: unknown) => {
  if (!isRecord(value)
    || (value.locationId !== undefined && !hasString(value, 'locationId'))
    || (value.incrementFlagId !== undefined && !hasString(value, 'incrementFlagId'))) return false;
  if (value.preserve === undefined) return true;
  if (!isRecord(value.preserve)) return false;
  return validateStringArray(value.preserve.inventoryIds)
    && validateStringArray(value.preserve.resourceIds)
    && validateStringArray(value.preserve.flagIds)
    && validateStringArray(value.preserve.actionCompletionIds)
    && (value.preserve.skillXp === undefined || typeof value.preserve.skillXp === 'boolean')
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
  (value.basePlayer === undefined ||
    (isRecord(value.basePlayer) &&
      (value.basePlayer.stats === undefined || (isRecord(value.basePlayer.stats) && Object.values(value.basePlayer.stats).every((stat) => typeof stat === 'number' && Number.isFinite(stat)))) &&
      (value.basePlayer.inventory === undefined || (isRecord(value.basePlayer.inventory) && Object.values(value.basePlayer.inventory).every((amount) => typeof amount === 'number' && Number.isFinite(amount)))))) &&
  (value.combatBalance === undefined ||
    (isRecord(value.combatBalance) &&
      hasNumber(value.combatBalance, 'expectedHitsToKill') &&
      hasNumber(value.combatBalance, 'combatSpread'))) &&
  (value.ui === undefined ||
    (isRecord(value.ui) &&
      (value.ui.floatingTextDurationSeconds === undefined || hasNumber(value.ui, 'floatingTextDurationSeconds')) &&
      (value.ui.loopActionsByDefault === undefined || typeof value.ui.loopActionsByDefault === 'boolean')));

const validateLocationsShape = (locations: unknown): locations is LocationNode[] =>
  Array.isArray(locations) &&
  locations.every(
    (location) =>
      isRecord(location) &&
      hasString(location, 'id') &&
      isRecord(location.position) &&
      typeof location.position.x === 'number' &&
      typeof location.position.y === 'number',
  );

const validateEdgesShape = (edges: unknown): edges is TravelEdgeDefinition[] =>
  Array.isArray(edges) &&
  edges.every(
    (edge) =>
      isRecord(edge) &&
      hasString(edge, 'id') &&
      hasString(edge, 'source') &&
      hasString(edge, 'target') &&
      hasNumber(edge, 'travelTimeSeconds'),
  );

const comparisons = new Set(['equal', 'greater-than', 'less-than']);

const validateConditionShape = (value: unknown): value is Condition => {
  if (!isRecord(value) || !hasString(value, 'kind')) return false;
  if (value.kind === 'all' || value.kind === 'any') {
    return Array.isArray(value.conditions) && value.conditions.every(validateConditionShape);
  }
  if (value.kind === 'not') return validateConditionShape(value.condition);
  return value.kind === 'state-variable'
    && hasString(value, 'variable')
    && (typeof value.value === 'number' || typeof value.value === 'boolean')
    && comparisons.has(String(value.comparison));
};

const validateRewardShape = (value: unknown) => isRecord(value)
  && hasNumber(value, 'amount')
  && ((value.kind === 'skillXp' && hasString(value, 'skillId'))
    || (value.kind === 'resource' && hasString(value, 'resourceId'))
    || (value.kind === 'item' && hasString(value, 'itemId')));

const validateActionResultShape = (value: unknown) => {
  if (!isRecord(value) || !hasString(value, 'kind')) return false;
  if (value.kind === 'item') return hasString(value, 'itemId') && hasNumber(value, 'amount');
  if (value.kind === 'resource') return hasString(value, 'resourceId') && hasNumber(value, 'amount');
  if (value.kind === 'skill-xp') return hasString(value, 'skillId') && hasNumber(value, 'amount');
  if (value.kind === 'flag') return hasString(value, 'flagId') && typeof value.value === 'boolean';
  if (value.kind === 'relocate') return hasString(value, 'locationId');
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
      hasString(action, 'locationId') &&
      (action.role === undefined || action.role === 'optional' || action.role === 'progression' || action.role === 'utility') &&
      hasNumber(action, 'durationSeconds') &&
      Array.isArray(action.rewards) && action.rewards.every(validateRewardShape) &&
      (action.results === undefined || (Array.isArray(action.results) && action.results.every(validateActionResultShape))) &&
      (action.visibleWhen === undefined || validateConditionShape(action.visibleWhen)) &&
      (action.requirements === undefined || validateConditionShape(action.requirements)) &&
      (action.maxCompletions === undefined || (Number.isInteger(action.maxCompletions) && Number(action.maxCompletions) >= 1)),
  );

const validateSkillsShape = (skills: unknown): skills is SkillDefinition[] =>
  Array.isArray(skills) &&
  skills.every(
    (skill) =>
      isRecord(skill) &&
      hasString(skill, 'id') &&
      hasNumber(skill, 'maxLevel'),
  );

const validateStatsShape = (stats: unknown): stats is StatDefinition[] =>
  Array.isArray(stats) && stats.every((stat) => isRecord(stat)
    && hasString(stat, 'id')
    && (stat.base === undefined || hasNumber(stat, 'base'))
    && (stat.added === undefined || hasNumber(stat, 'added'))
    && (stat.increased === undefined || hasNumber(stat, 'increased'))
    && (stat.skillId === undefined || hasString(stat, 'skillId')));

const validateItemsShape = (items: unknown): items is ItemDefinition[] =>
  items === undefined ||
  (Array.isArray(items) &&
    items.every(
      (item) =>
        isRecord(item) &&
        hasString(item, 'id'),
    ));

const validateFlagsShape = (flags: unknown): flags is StateFlagDefinition[] =>
  flags === undefined || (Array.isArray(flags) && flags.every((flag) => isRecord(flag)
    && hasString(flag, 'id')
    && (flag.initialValue === undefined || typeof flag.initialValue === 'boolean' || typeof flag.initialValue === 'number')));

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
        (resource.onFull === undefined || (Array.isArray(resource.onFull) && resource.onFull.every(validateResourceBehaviorShape))),
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
        (effect.resetResourceWhenInactive === undefined || typeof effect.resetResourceWhenInactive === 'boolean'),
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
        typeof interactionType.targetPlayerHealth === 'boolean',
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
        Array.isArray(enemy.rewards),
    ));

export const validateContentShape = (bundle: Partial<ContentBundle>) => {
  const issues: ValidationIssue[] = [];

  if (!bundle.manifest || !validateManifest(bundle.manifest)) {
    issues.push(error('universe.json', 'validation.universeManifestMissing'));
  } else {
    if (bundle.manifest.combatBalance?.expectedHitsToKill !== undefined && bundle.manifest.combatBalance.expectedHitsToKill <= 0) {
      issues.push(error('universe.json.combatBalance.expectedHitsToKill', 'validation.expectedHitsPositive'));
    }
    if (bundle.manifest.combatBalance?.combatSpread !== undefined && bundle.manifest.combatBalance.combatSpread < 0) {
      issues.push(error('universe.json.combatBalance.combatSpread', 'validation.combatSpreadNonNegative'));
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

  if (!validateEdgesShape(bundle.edges)) {
    issues.push(error('edges.json', 'validation.edgesShape'));
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

export const validateContentReferences = (bundle: ContentBundle) => {
  const issues: ValidationIssue[] = [
    ...findDuplicateIds(bundle.locations, 'locations'),
    ...findDuplicateIds(bundle.edges, 'edges'),
    ...findDuplicateIds(bundle.actions, 'actions'),
    ...findDuplicateIds(bundle.skills, 'skills'),
    ...findDuplicateIds(bundle.stats, 'stats'),
    ...findDuplicateIds(bundle.items ?? [], 'items'),
    ...findDuplicateIds(bundle.flags ?? [], 'flags'),
    ...findDuplicateIds(bundle.resourceDefinitions ?? [], 'resources'),
    ...findDuplicateIds(bundle.effects ?? [], 'effects'),
    ...findDuplicateIds(bundle.interactionTypes ?? [], 'interactionTypes'),
    ...findDuplicateIds(bundle.enemies ?? [], 'enemies'),
  ];

  const locationIds = new Set(bundle.locations.map((location) => location.id));
  const skillIds = new Set(bundle.skills.map((skill) => skill.id));
  const statIds = new Set(bundle.stats.map((stat) => stat.id));
  const itemIds = new Set((bundle.items ?? []).map((item) => item.id));
  const flagIds = new Set((bundle.flags ?? []).map((flag) => flag.id));
  const resourceIds = new Set((bundle.resourceDefinitions ?? []).map((resource) => resource.id));
  const interactionTypeIds = new Set((bundle.interactionTypes ?? []).map((interactionType) => interactionType.id));
  const enemyIds = new Set((bundle.enemies ?? []).map((enemy) => enemy.id));
  const locale = bundle.locales[bundle.manifest.locales[0]] ?? {};

  const validateConditionReferences = (condition: Condition, path: string) => {
    if (condition.kind === 'all' || condition.kind === 'any') {
      condition.conditions.forEach((child, index) => validateConditionReferences(child, `${path}.conditions.${index}`));
    } else if (condition.kind === 'not') {
      validateConditionReferences(condition.condition, `${path}.condition`);
    } else if (condition.kind === 'state-variable') {
      const knownVariables = new Set([
        ...Array.from(flagIds, (id) => `flag:${id}`),
        ...Array.from(itemIds, (id) => `item:${id}`),
        ...Array.from(resourceIds, (id) => `resource:${id}`),
        ...Array.from(skillIds, (id) => `skill-level:${id}`),
        ...Array.from(statIds, (id) => `stat:${id}`),
        ...bundle.actions.map((action) => `action-completions:${action.id}`),
        'active-action',
        'active-interaction',
      ]);
      if (!knownVariables.has(condition.variable)) issues.push(error(path, 'validation.unknownStateVariable', { id: condition.variable }));
    }
  };

  if (!bundle.locations.some((location) => location.starting)) {
    issues.push(error('locations', 'validation.startingLocationMissing'));
  }

  for (const edge of bundle.edges) {
    const duplicatePair = bundle.edges.find(
      (candidate) =>
        candidate.id !== edge.id &&
        ((candidate.source === edge.source && candidate.target === edge.target) ||
          (candidate.source === edge.target && candidate.target === edge.source)),
    );

    if (duplicatePair) {
      issues.push(error(`edges.${edge.id}`, 'validation.duplicateEdge', { source: edge.source, target: edge.target }));
    }
    if (!locationIds.has(edge.source)) {
      issues.push(error(`edges.${edge.id}.source`, 'validation.unknownSourceLocation', { id: edge.source }));
    }
    if (!locationIds.has(edge.target)) {
      issues.push(error(`edges.${edge.id}.target`, 'validation.unknownTargetLocation', { id: edge.target }));
    }
    if (edge.travelTimeSeconds <= 0) {
      issues.push(error(`edges.${edge.id}.travelTimeSeconds`, 'validation.travelTimePositive'));
    }
  }

  for (const action of bundle.actions) {
    if (!isKebabCaseId(action.id)) {
      issues.push(error(`actions.${action.id}.id`, 'validation.actionIdKebab'));
    }
    if (!locationIds.has(action.locationId)) {
      issues.push(error(`actions.${action.id}.locationId`, 'validation.unknownLocation', { id: action.locationId }));
    }
    if ((action.results ?? []).filter((result) => result.kind === 'chat').length > 2) {
      issues.push(error(`actions.${action.id}.results`, 'validation.tooManySequentialMessages'));
    }
    if (action.durationSeconds <= 0) {
      issues.push(error(`actions.${action.id}.durationSeconds`, 'validation.actionDurationPositive'));
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
    for (const reward of action.rewards) {
      if (reward.kind === 'skillXp' && !skillIds.has(reward.skillId)) {
        issues.push(error(`actions.${action.id}.rewards`, 'validation.unknownSkill', { id: reward.skillId }));
      }
      if (reward.kind === 'resource' && !itemIds.has(reward.resourceId) && !resourceIds.has(reward.resourceId)) {
        issues.push(error(`actions.${action.id}.rewards`, 'validation.unknownResource', { id: reward.resourceId }));
      }
      if (reward.kind === 'item' && !itemIds.has(reward.itemId)) {
        issues.push(error(`actions.${action.id}.rewards`, 'validation.unknownItem', { id: reward.itemId }));
      }
      if (reward.amount <= 0) {
        issues.push(error(`actions.${action.id}.rewards`, 'validation.rewardAmountPositive'));
      }
    }
    for (const [index, result] of (action.results ?? []).entries()) {
      const path = `actions.${action.id}.results.${index}`;
      if (result.kind === 'item' && !itemIds.has(result.itemId)) issues.push(error(path, 'validation.unknownItem', { id: result.itemId }));
      if (result.kind === 'resource' && !resourceIds.has(result.resourceId)) issues.push(error(path, 'validation.unknownResource', { id: result.resourceId }));
      if (result.kind === 'skill-xp' && !skillIds.has(result.skillId)) issues.push(error(path, 'validation.unknownSkill', { id: result.skillId }));
      if (result.kind === 'flag' && !flagIds.has(result.flagId)) issues.push(error(path, 'validation.unknownFlag', { id: result.flagId }));
      if (result.kind === 'relocate' && result.locationId !== 'starting-location' && !locationIds.has(result.locationId)) issues.push(error(path, 'validation.unknownLocation', { id: result.locationId }));
      if ('amount' in result && result.amount === 0) issues.push(error(path, 'validation.resultAmountNonZero'));
    }
  }

  for (const location of bundle.locations) {
    if (!isKebabCaseId(location.id)) {
      issues.push(error(`locations.${location.id}.id`, 'validation.locationIdKebab'));
    }
  }

  for (const skill of bundle.skills) {
    if (!isKebabCaseId(skill.id)) {
      issues.push(error(`skills.${skill.id}.id`, 'validation.skillIdKebab'));
    }
  }

  for (const stat of bundle.stats) {
    if (!isKebabCaseId(stat.id)) issues.push(error(`stats.${stat.id}.id`, 'validation.statIdKebab'));
    if (stat.skillId && !skillIds.has(stat.skillId)) issues.push(error(`stats.${stat.id}.skillId`, 'validation.unknownSkill', { id: stat.skillId }));
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
        if (behavior.incrementFlagId && !flagIds.has(behavior.incrementFlagId)) issues.push(error(`resources.${resource.id}`, 'validation.unknownFlag', { id: behavior.incrementFlagId }));
        for (const id of behavior.preserve?.inventoryIds ?? []) if (!itemIds.has(id)) issues.push(error(`resources.${resource.id}`, 'validation.unknownItem', { id }));
        for (const id of behavior.preserve?.resourceIds ?? []) if (!resourceIds.has(id)) issues.push(error(`resources.${resource.id}`, 'validation.unknownResource', { id }));
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
    for (const key of Object.keys(enemy.stats ?? {})) {
      if (!(ENEMY_STAT_KEYS as string[]).includes(key)) {
        issues.push(error(`enemies.${enemy.id}.stats.${key}`, 'validation.unknownEnemyStat', { id: key }));
      }
    }
    for (const reward of enemy.rewards) {
      if (reward.kind === 'skillXp' && !skillIds.has(reward.skillId)) {
        issues.push(error(`enemies.${enemy.id}.rewards`, 'validation.unknownSkill', { id: reward.skillId }));
      }
      if (reward.kind === 'resource' && !itemIds.has(reward.resourceId) && !resourceIds.has(reward.resourceId)) {
        issues.push(error(`enemies.${enemy.id}.rewards`, 'validation.unknownResource', { id: reward.resourceId }));
      }
      if (reward.kind === 'item' && !itemIds.has(reward.itemId)) {
        issues.push(error(`enemies.${enemy.id}.rewards`, 'validation.unknownItem', { id: reward.itemId }));
      }
      if (reward.amount <= 0) {
        issues.push(error(`enemies.${enemy.id}.rewards`, 'validation.rewardAmountPositive'));
      }
    }
  }

  for (const item of bundle.items ?? []) {
    if (!isKebabCaseId(item.id)) {
      issues.push(error(`items.${item.id}.id`, 'validation.itemIdKebab'));
    }
    if (item.maxQuantity !== undefined && item.maxQuantity < 1) {
      issues.push(error(`items.${item.id}.maxQuantity`, 'validation.itemMaxPositive'));
    }
  }

  for (const flag of bundle.flags ?? []) {
    if (!isKebabCaseId(flag.id)) {
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

export const validateLocaleDictionary = (locale: LocaleDictionary) =>
  Object.entries(locale).flatMap(([key, value]) =>
    key.trim().length === 0 || value.trim().length === 0
      ? [error(`locales.${key}`, 'validation.localeEmpty')]
      : [],
  );

export const mergeDraftIntoBundle = (bundle: ContentBundle, draft: ContributionDraft | null): ContentBundle => {
  if (!draft || draft.universeId !== bundle.manifest.id) {
    return bundle;
  }

  return {
    ...bundle,
    manifest: draft.basePlayer || draft.combatBalance || draft.ui
      ? {
          ...bundle.manifest,
          ...(draft.basePlayer ? { basePlayer: draft.basePlayer } : {}),
          ...(draft.combatBalance ? { combatBalance: draft.combatBalance } : {}),
          ...(draft.ui ? { ui: draft.ui } : {}),
        }
      : bundle.manifest,
    locations: mergeById(removeById(bundle.locations, draft.removed?.locations ?? []), draft.locations),
    edges: mergeById(removeById(bundle.edges, draft.removed?.edges ?? []), draft.edges),
    actions: mergeById(removeById(bundle.actions, draft.removed?.actions ?? []), draft.actions),
    skills: mergeById(removeById(bundle.skills, draft.removed?.skills ?? []), draft.skills),
    stats: mergeById(removeById(bundle.stats, draft.removed?.stats ?? []), draft.stats),
    items: mergeById(removeById(bundle.items ?? [], draft.removed?.items ?? []), draft.items),
    flags: mergeById(removeById(bundle.flags ?? [], draft.removed?.flags ?? []), draft.flags ?? []),
    resourceDefinitions: mergeById(removeById(bundle.resourceDefinitions ?? [], draft.removed?.resources ?? []), draft.resourceDefinitions ?? []),
    effects: mergeById(removeById(bundle.effects ?? [], draft.removed?.effects ?? []), draft.effects ?? []),
    interactionTypes: mergeById(removeById(bundle.interactionTypes ?? [], draft.removed?.interactionTypes ?? []), draft.interactionTypes ?? []),
    enemies: mergeById(removeById(bundle.enemies ?? [], draft.removed?.enemies ?? []), draft.enemies ?? []),
    locales: mergeLocales(bundle.locales, draft.locales),
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
