import type {
  ContentBundle,
  ContributionDraft,
  EnemyDefinition,
  EffectDefinition,
  GameAction,
  InteractionTypeDefinition,
  ItemDefinition,
  LocaleDictionary,
  LocationNode,
  ResourceDefinition,
  SkillDefinition,
  TravelEdgeDefinition,
  UniverseManifest,
  ValidationIssue,
} from './types';
import {
  actionDescriptionKey,
  actionFailureKey,
  actionKillKey,
  actionSuccessKey,
  actionTitleKey,
  itemDescriptionKey,
  itemTitleKey,
  locationDescriptionKey,
  locationTitleKey,
  effectTitleKey,
  interactionEntityHitKey,
  interactionEntityKillKey,
  interactionEntityMissKey,
  interactionPlayerHitKey,
  interactionPlayerKillKey,
  interactionPlayerMissKey,
  resourceTitleKey,
  skillDescriptionKey,
  skillTitleKey,
  toKebabCase,
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

export const validateManifest = (value: unknown): value is UniverseManifest =>
  isRecord(value) &&
  hasNumber(value, 'schemaVersion') &&
  hasString(value, 'id') &&
  hasString(value, 'titleKey') &&
  hasString(value, 'version') &&
  hasString(value, 'author') &&
  Array.isArray(value.locales) &&
  value.locales.every((locale) => typeof locale === 'string') &&
  Array.isArray(value.files) &&
  value.files.every((file) => typeof file === 'string');

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

const validateActionsShape = (actions: unknown): actions is GameAction[] =>
  Array.isArray(actions) &&
  actions.every(
    (action) =>
      isRecord(action) &&
      hasString(action, 'id') &&
      hasString(action, 'locationId') &&
      hasNumber(action, 'durationSeconds') &&
      Array.isArray(action.rewards),
  );

const validateSkillsShape = (skills: unknown): skills is SkillDefinition[] =>
  Array.isArray(skills) &&
  skills.every(
    (skill) =>
      isRecord(skill) &&
      hasString(skill, 'id') &&
      hasNumber(skill, 'maxLevel'),
  );

const validateItemsShape = (items: unknown): items is ItemDefinition[] =>
  items === undefined ||
  (Array.isArray(items) &&
    items.every(
      (item) =>
        isRecord(item) &&
        hasString(item, 'id'),
    ));

const validateResourceDefinitionsShape = (resources: unknown): resources is ResourceDefinition[] =>
  resources === undefined ||
  (Array.isArray(resources) &&
    resources.every(
      (resource) =>
        isRecord(resource) &&
        hasString(resource, 'id') &&
        hasNumber(resource, 'minValue') &&
        hasNumber(resource, 'baseMaxValue'),
    ));

const validateEffectsShape = (effects: unknown): effects is EffectDefinition[] =>
  effects === undefined ||
  (Array.isArray(effects) &&
    effects.every(
      (effect) =>
        isRecord(effect) &&
        hasString(effect, 'id') &&
        hasString(effect, 'resourceId') &&
        hasNumber(effect, 'ratePerMinute') &&
        (effect.source === 'player' || effect.source === 'location'),
    ));

const validateInteractionTypesShape = (interactionTypes: unknown): interactionTypes is InteractionTypeDefinition[] =>
  interactionTypes === undefined ||
  (Array.isArray(interactionTypes) &&
    interactionTypes.every(
      (interactionType) =>
        isRecord(interactionType) &&
        hasString(interactionType, 'id') &&
        hasString(interactionType, 'sourceSkillId') &&
        hasString(interactionType, 'targetSkillId') &&
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
        hasNumber(enemy, 'attack') &&
        hasNumber(enemy, 'defense') &&
        hasNumber(enemy, 'health') &&
        hasNumber(enemy, 'rate') &&
        hasNumber(enemy, 'regeneration') &&
        hasNumber(enemy, 'armorPenetration') &&
        hasNumber(enemy, 'torpidity') &&
        hasNumber(enemy, 'critChance') &&
        hasNumber(enemy, 'critMultiplier') &&
        Array.isArray(enemy.rewards),
    ));

export const validateContentShape = (bundle: Partial<ContentBundle>) => {
  const issues: ValidationIssue[] = [];

  if (!bundle.manifest || !validateManifest(bundle.manifest)) {
    issues.push(error('universe.json', 'validation.universeManifestMissing'));
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

  if (!validateItemsShape(bundle.items)) {
    issues.push(error('items.json', 'validation.itemsShape'));
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
    ...findDuplicateIds(bundle.items ?? [], 'items'),
    ...findDuplicateIds(bundle.resourceDefinitions ?? [], 'resources'),
    ...findDuplicateIds(bundle.effects ?? [], 'effects'),
    ...findDuplicateIds(bundle.interactionTypes ?? [], 'interactionTypes'),
    ...findDuplicateIds(bundle.enemies ?? [], 'enemies'),
  ];

  const locationIds = new Set(bundle.locations.map((location) => location.id));
  const skillIds = new Set(bundle.skills.map((skill) => skill.id));
  const itemIds = new Set((bundle.items ?? []).map((item) => item.id));
  const resourceIds = new Set((bundle.resourceDefinitions ?? []).map((resource) => resource.id));
  const interactionTypeIds = new Set((bundle.interactionTypes ?? []).map((interactionType) => interactionType.id));
  const enemyIds = new Set((bundle.enemies ?? []).map((enemy) => enemy.id));
  const locale = bundle.locales[bundle.manifest.locales[0]] ?? {};

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
    if (action.durationSeconds <= 0) {
      issues.push(error(`actions.${action.id}.durationSeconds`, 'validation.actionDurationPositive'));
    }
    if (action.interactionTypeId && !interactionTypeIds.has(action.interactionTypeId)) {
      issues.push(error(`actions.${action.id}.interactionTypeId`, 'validation.unknownInteractionType', { id: action.interactionTypeId }));
    }
    if (action.enemyId && !enemyIds.has(action.enemyId)) {
      issues.push(error(`actions.${action.id}.enemyId`, 'validation.unknownEnemy', { id: action.enemyId }));
    }
    if (action.sourceSkillId && !skillIds.has(action.sourceSkillId)) {
      issues.push(error(`actions.${action.id}.sourceSkillId`, 'validation.unknownSkill', { id: action.sourceSkillId }));
    }
    if (action.targetSkillId && !skillIds.has(action.targetSkillId)) {
      issues.push(error(`actions.${action.id}.targetSkillId`, 'validation.unknownSkill', { id: action.targetSkillId }));
    }
    if (action.health !== undefined && action.health <= 0) {
      issues.push(error(`actions.${action.id}.health`, 'validation.healthPositive'));
    }
    if (action.rate !== undefined && action.rate < 0) {
      issues.push(error(`actions.${action.id}.rate`, 'validation.rateNonNegative'));
    }
    for (const reward of action.rewards) {
      if (reward.kind === 'skillXp' && !skillIds.has(reward.skillId)) {
        issues.push(error(`actions.${action.id}.rewards`, 'validation.unknownSkill', { id: reward.skillId }));
      }
      if (reward.kind === 'resource' && itemIds.size > 0 && !itemIds.has(reward.resourceId)) {
        issues.push(error(`actions.${action.id}.rewards`, 'validation.unknownItem', { id: reward.resourceId }));
      }
      if (reward.amount <= 0) {
        issues.push(error(`actions.${action.id}.rewards`, 'validation.rewardAmountPositive'));
      }
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
    if (skill.rate !== undefined && skill.rate <= 0) {
      issues.push(error(`skills.${skill.id}.rate`, 'validation.ratePositive'));
    }
  }

  for (const resource of bundle.resourceDefinitions ?? []) {
    if (!isKebabCaseId(resource.id)) {
      issues.push(error(`resources.${resource.id}.id`, 'validation.resourceIdKebab'));
    }
    if (resource.minValue >= resource.baseMaxValue) {
      issues.push(error(`resources.${resource.id}.minValue`, 'validation.resourceMinLessThanMax'));
    }
    if (resource.initialValue !== undefined && (resource.initialValue < resource.minValue || resource.initialValue > resource.baseMaxValue)) {
      issues.push(error(`resources.${resource.id}.initialValue`, 'validation.resourceInitialInBounds'));
    }
    if (resource.maxSkillId && !skillIds.has(resource.maxSkillId)) {
      issues.push(error(`resources.${resource.id}.maxSkillId`, 'validation.unknownSkill', { id: resource.maxSkillId }));
    }
  }

  for (const effect of bundle.effects ?? []) {
    if (!isKebabCaseId(effect.id)) {
      issues.push(error(`effects.${effect.id}.id`, 'validation.effectIdKebab'));
    }
    if (!resourceIds.has(effect.resourceId)) {
      issues.push(error(`effects.${effect.id}.resourceId`, 'validation.unknownResource', { id: effect.resourceId }));
    }
    if (effect.rateSkillId && !skillIds.has(effect.rateSkillId)) {
      issues.push(error(`effects.${effect.id}.rateSkillId`, 'validation.unknownSkill', { id: effect.rateSkillId }));
    }
    if (effect.source === 'location' && effect.locationId && !locationIds.has(effect.locationId)) {
      issues.push(error(`effects.${effect.id}.locationId`, 'validation.unknownLocation', { id: effect.locationId }));
    }
  }

  for (const interactionType of bundle.interactionTypes ?? []) {
    if (!isKebabCaseId(interactionType.id)) {
      issues.push(error(`interactionTypes.${interactionType.id}.id`, 'validation.interactionTypeIdKebab'));
    }
    if (!skillIds.has(interactionType.sourceSkillId)) {
      issues.push(error(`interactionTypes.${interactionType.id}.sourceSkillId`, 'validation.unknownSkill', { id: interactionType.sourceSkillId }));
    }
    if (!skillIds.has(interactionType.targetSkillId)) {
      issues.push(error(`interactionTypes.${interactionType.id}.targetSkillId`, 'validation.unknownSkill', { id: interactionType.targetSkillId }));
    }
  }

  for (const enemy of bundle.enemies ?? []) {
    if (!isKebabCaseId(enemy.id)) {
      issues.push(error(`enemies.${enemy.id}.id`, 'validation.enemyIdKebab'));
    }
    if (!interactionTypeIds.has(enemy.interactionTypeId)) {
      issues.push(error(`enemies.${enemy.id}.interactionTypeId`, 'validation.unknownInteractionType', { id: enemy.interactionTypeId }));
    }
    if (enemy.health <= 0) {
      issues.push(error(`enemies.${enemy.id}.health`, 'validation.healthPositive'));
    }
    if (enemy.attack <= 0) {
      issues.push(error(`enemies.${enemy.id}.attack`, 'validation.attackPositive'));
    }
    if (enemy.defense < 0) {
      issues.push(error(`enemies.${enemy.id}.defense`, 'validation.defenseNonNegative'));
    }
    if (enemy.rate < 0) {
      issues.push(error(`enemies.${enemy.id}.rate`, 'validation.rateNonNegative'));
    }
    if (enemy.regeneration < 0 || enemy.armorPenetration < 0 || enemy.torpidity < 0) {
      issues.push(error(`enemies.${enemy.id}`, 'validation.enemyModifiersNonNegative'));
    }
    if (enemy.critChance < 0 || enemy.critChance > 100) {
      issues.push(error(`enemies.${enemy.id}.critChance`, 'validation.critChanceRange'));
    }
    if (enemy.critMultiplier < 1) {
      issues.push(error(`enemies.${enemy.id}.critMultiplier`, 'validation.critMultiplierMinimum'));
    }
    for (const reward of enemy.rewards) {
      if (reward.kind === 'skillXp' && !skillIds.has(reward.skillId)) {
        issues.push(error(`enemies.${enemy.id}.rewards`, 'validation.unknownSkill', { id: reward.skillId }));
      }
      if (reward.kind === 'resource' && itemIds.size > 0 && !itemIds.has(reward.resourceId)) {
        issues.push(error(`enemies.${enemy.id}.rewards`, 'validation.unknownItem', { id: reward.resourceId }));
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
  bundle.manifest.titleKey,
  bundle.manifest.descriptionKey,
  ...bundle.locations.flatMap((location) => [
    location.titleKey ?? locationTitleKey(location.id),
    location.descriptionKey ?? locationDescriptionKey(location.id),
  ]),
  ...bundle.actions.flatMap((action) => [
    action.titleKey ?? actionTitleKey(action.id),
    action.descriptionKey ?? actionDescriptionKey(action.id),
    actionSuccessKey(action.id),
    actionFailureKey(action.id),
    action.enemyId ? actionKillKey(action.id) : null,
  ]),
  ...bundle.skills.flatMap((skill) => [
    skill.titleKey ?? skillTitleKey(skill.id),
    skill.descriptionKey ?? skillDescriptionKey(skill.id),
  ]),
  ...(bundle.items ?? []).flatMap((item) => [
    item.titleKey ?? itemTitleKey(item.id),
    item.descriptionKey ?? itemDescriptionKey(item.id),
  ]),
  ...(bundle.interactionTypes ?? []).flatMap((interactionType) => [
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
    locations: mergeById(removeById(bundle.locations, draft.removed?.locations ?? []), draft.locations),
    edges: mergeById(removeById(bundle.edges, draft.removed?.edges ?? []), draft.edges),
    actions: mergeById(removeById(bundle.actions, draft.removed?.actions ?? []), draft.actions),
    skills: mergeById(removeById(bundle.skills, draft.removed?.skills ?? []), draft.skills),
    items: mergeById(removeById(bundle.items ?? [], draft.removed?.items ?? []), draft.items),
    resourceDefinitions: bundle.resourceDefinitions ?? [],
    effects: bundle.effects ?? [],
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
