import type {
  ContentBundle,
  ContributionDraft,
  GameAction,
  ItemDefinition,
  LocaleDictionary,
  LocationNode,
  SkillDefinition,
  TravelEdgeDefinition,
  UniverseManifest,
  ValidationIssue,
} from './types';
import {
  actionDescriptionKey,
  actionFailureKey,
  actionSuccessKey,
  actionTitleKey,
  itemDescriptionKey,
  itemTitleKey,
  locationDescriptionKey,
  locationTitleKey,
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
  ];

  const locationIds = new Set(bundle.locations.map((location) => location.id));
  const skillIds = new Set(bundle.skills.map((skill) => skill.id));
  const itemIds = new Set((bundle.items ?? []).map((item) => item.id));
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
  ]),
  ...bundle.skills.flatMap((skill) => [
    skill.titleKey ?? skillTitleKey(skill.id),
    skill.descriptionKey ?? skillDescriptionKey(skill.id),
  ]),
  ...(bundle.items ?? []).flatMap((item) => [
    item.titleKey ?? itemTitleKey(item.id),
    item.descriptionKey ?? itemDescriptionKey(item.id),
  ]),
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
    locations: mergeById(bundle.locations, draft.locations),
    edges: mergeById(bundle.edges, draft.edges),
    actions: mergeById(bundle.actions, draft.actions),
    skills: mergeById(bundle.skills, draft.skills),
    items: mergeById(bundle.items ?? [], draft.items),
    locales: mergeLocales(bundle.locales, draft.locales),
  };
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
