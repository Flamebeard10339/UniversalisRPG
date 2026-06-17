import type {
  ContentBundle,
  ContributionDraft,
  GameAction,
  LocaleDictionary,
  LocationNode,
  SkillDefinition,
  TravelEdgeDefinition,
  UniverseManifest,
  ValidationIssue,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasString = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === 'string' && String(value[key]).trim().length > 0;

const hasNumber = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === 'number' && Number.isFinite(value[key]);

const error = (path: string, message: string): ValidationIssue => ({
  severity: 'error',
  path,
  message,
});

const warning = (path: string, message: string): ValidationIssue => ({
  severity: 'warning',
  path,
  message,
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
      hasString(location, 'titleKey') &&
      hasString(location, 'descriptionKey') &&
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
      hasString(action, 'titleKey') &&
      hasString(action, 'descriptionKey') &&
      hasNumber(action, 'durationSeconds') &&
      Array.isArray(action.rewards),
  );

const validateSkillsShape = (skills: unknown): skills is SkillDefinition[] =>
  Array.isArray(skills) &&
  skills.every(
    (skill) =>
      isRecord(skill) &&
      hasString(skill, 'id') &&
      hasString(skill, 'titleKey') &&
      hasString(skill, 'descriptionKey') &&
      hasNumber(skill, 'maxLevel'),
  );

export const validateContentShape = (bundle: Partial<ContentBundle>) => {
  const issues: ValidationIssue[] = [];

  if (!bundle.manifest || !validateManifest(bundle.manifest)) {
    issues.push(error('universe.json', 'Universe manifest is missing required fields.'));
  }

  if (!validateLocationsShape(bundle.locations)) {
    issues.push(error('locations.json', 'Locations must be an array of location objects.'));
  }

  if (!validateEdgesShape(bundle.edges)) {
    issues.push(error('edges.json', 'Edges must be an array of travel edge objects.'));
  }

  if (!validateActionsShape(bundle.actions)) {
    issues.push(error('actions.json', 'Actions must be an array of action objects.'));
  }

  if (!validateSkillsShape(bundle.skills)) {
    issues.push(error('skills.json', 'Skills must be an array of skill objects.'));
  }

  return issues;
};

const findDuplicateIds = <T extends { id: string }>(items: T[], path: string) => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.id)) {
      issues.push(error(`${path}.${item.id}`, `Duplicate id "${item.id}".`));
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
  ];

  const locationIds = new Set(bundle.locations.map((location) => location.id));
  const skillIds = new Set(bundle.skills.map((skill) => skill.id));
  const locale = bundle.locales[bundle.manifest.locales[0]] ?? {};

  if (!bundle.locations.some((location) => location.starting)) {
    issues.push(error('locations', 'At least one location must be marked as starting.'));
  }

  for (const edge of bundle.edges) {
    if (!locationIds.has(edge.source)) {
      issues.push(error(`edges.${edge.id}.source`, `Unknown source location "${edge.source}".`));
    }
    if (!locationIds.has(edge.target)) {
      issues.push(error(`edges.${edge.id}.target`, `Unknown target location "${edge.target}".`));
    }
    if (edge.travelTimeSeconds <= 0) {
      issues.push(error(`edges.${edge.id}.travelTimeSeconds`, 'Travel time must be positive.'));
    }
  }

  for (const action of bundle.actions) {
    if (!locationIds.has(action.locationId)) {
      issues.push(error(`actions.${action.id}.locationId`, `Unknown location "${action.locationId}".`));
    }
    if (action.durationSeconds <= 0) {
      issues.push(error(`actions.${action.id}.durationSeconds`, 'Action duration must be positive.'));
    }
    for (const reward of action.rewards) {
      if (reward.kind === 'skillXp' && !skillIds.has(reward.skillId)) {
        issues.push(error(`actions.${action.id}.rewards`, `Unknown skill "${reward.skillId}".`));
      }
      if (reward.amount <= 0) {
        issues.push(error(`actions.${action.id}.rewards`, 'Reward amounts must be positive.'));
      }
    }
  }

  for (const key of collectLocalizationKeys(bundle)) {
    if (!locale[key]) {
      issues.push(warning(`locales.${bundle.manifest.locales[0]}.${key}`, 'Missing localization string.'));
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
  ...bundle.locations.flatMap((location) => [location.titleKey, location.descriptionKey]),
  ...bundle.actions.flatMap((action) => [action.titleKey, action.descriptionKey]),
  ...bundle.skills.flatMap((skill) => [skill.titleKey, skill.descriptionKey]),
].filter((key): key is string => Boolean(key));

export const validateLocaleDictionary = (locale: LocaleDictionary) =>
  Object.entries(locale).flatMap(([key, value]) =>
    key.trim().length === 0 || value.trim().length === 0
      ? [error(`locales.${key}`, 'Locale keys and values cannot be empty.')]
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
