import type {
  ContentBundle,
  ContentModule,
  ContentModulePack,
  DialogueDefinition,
  GameAction,
  LocaleDictionary,
  ModuleDataEntry,
  ModuleDataRemoveEntry,
  ModuleDataSection,
  ModuleDataSectionObject,
  ModuleDataUpdates,
  ModuleDataUpdatesObject,
  ModuleObjectPatch,
  ValidationIssue,
} from './types';
import {
  actionDescriptionKey,
  actionFailureKey,
  actionKillKey,
  actionSuccessKey,
  actionTitleKey,
  effectTitleKey,
  entityTitleKey,
  interactionEntityHitKey,
  interactionEntityKillKey,
  interactionEntityMissKey,
  interactionPlayerHitKey,
  interactionPlayerKillKey,
  interactionPlayerMissKey,
  interactionTitleKey,
  itemDescriptionKey,
  itemTitleKey,
  locationDescriptionKey,
  locationExhaustedKey,
  locationTitleKey,
  resourceTitleKey,
  skillDescriptionKey,
  skillTitleKey,
  statDescriptionKey,
  statTitleKey,
} from './contentIds';
import { isTravelAction, travelActionLocalizationKeys } from './actionLocalization';
import { validateContentBundle, validateContentShape, validateLocaleDictionary } from './validators';
import { collectionCategoryTitleKey } from './collectionLog';
import { normalizeContentBundleStructure } from './contentNormalization';
import { applyJsonPatch } from './jsonPatch';
import { getModObjectType } from './modObjectRegistry';

// Dependency
// Each dependency is a string that consists of up to three parts: "<prefix> internal-mod-name <equality-operator> <version>".

// Example: "? some-other-mod >= 4.2.0"

// The equality operator (<, <=, =, >= or >) combined with the version allows to define dependencies that require certain mod versions, but it is not required. Incompatibility does not support versions; if incompatibility is used, version is ignored. If a version is used for an optional dependency, the mod is considered incompatible (and disabled) if the dependency is present but does not fulfill the version requirement.

// The possible prefixes are:

// ! for incompatibility
// ? for an optional dependency
// + for a recommended dependency
// (?) for a hidden optional dependency
// ~ for a dependency that does not affect load order
// no prefix for a hard requirement for the other mod
type ModuleDependency = {
  id: string;
  prefix: '' | '!' | '+' | '?' | '~';
  versionOperator?: '<' | '<=' | '=' | '>=' | '>';
  version?: string;
};

type ModuleResolution = {
  bundle: ContentBundle;
  enabledModuleIds: string[];
  issues: ValidationIssue[];
};

type AppliedModules = {
  bundle: ContentBundle;
  ordered: ContentModule[];
  disabled: Set<string>;
  issues: ValidationIssue[];
};

const dependencyPattern = /^([!+?~])?\s*([a-z0-9][a-z0-9.-]*)(?:\s*(<=|>=|=|<|>)\s*([0-9]+(?:\.[0-9]+){0,2}))?\s*$/;
const moduleVersionPattern = /^(?:[0-9]|[1-9][0-9]{1,4})\.(?:[0-9]|[1-9][0-9]{1,4})\.(?:[0-9]|[1-9][0-9]{1,4})$/;
const gameVersionPattern = /^(?:[0-9]|[1-9][0-9]{1,4})\.(?:[0-9]|[1-9][0-9]{1,4})$/;

const issue = (severity: ValidationIssue['severity'], path: string, message: string, params?: Record<string, string | number>): ValidationIssue => ({
  severity,
  path,
  message,
  params,
});

export const parseModuleDependency = (value: string): ModuleDependency | null => {
  const match = value.match(dependencyPattern);
  if (!match) return null;
  return {
    prefix: (match[1] ?? '') as ModuleDependency['prefix'],
    id: match[2],
    versionOperator: match[3] as ModuleDependency['versionOperator'],
    version: match[4],
  };
};

const moduleSort = (modules: ContentModule[]) => [...modules].sort((a, b) => a.id.localeCompare(b.id));

const versionPartsInRange = (value: string) =>
  value.split('.').every((part) => {
    const numericPart = Number(part);
    return Number.isInteger(numericPart) && numericPart >= 0 && numericPart <= 65535;
  });

const isModuleVersion = (value: string) => moduleVersionPattern.test(value) && versionPartsInRange(value);

const isGameVersion = (value: string | number) => {
  const version = typeof value === 'number' && Number.isInteger(value) ? `${value}.0` : String(value);
  return gameVersionPattern.test(version) && versionPartsInRange(version);
};

const parseVersionParts = (value: string) => value.split('.').map((part) => Number(part));

const compareVersions = (left: string, right: string) => {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }
  return 0;
};

const dependencyVersionMatches = (module: ContentModule | undefined, dependency: ModuleDependency) => {
  if (!module || !dependency.version) return Boolean(module);
  const comparison = compareVersions(module.version, dependency.version);
  if (dependency.versionOperator === '<') return comparison < 0;
  if (dependency.versionOperator === '<=') return comparison <= 0;
  if (dependency.versionOperator === '=') return comparison === 0;
  if (dependency.versionOperator === '>=') return comparison >= 0;
  if (dependency.versionOperator === '>') return comparison > 0;
  return true;
};

export const validateModuleShape = (module: unknown, filename?: string): module is ContentModule => {
  if (!module || typeof module !== 'object' || Array.isArray(module)) return false;
  const value = module as Record<string, unknown>;
  return typeof value.id === 'string' &&
    (!filename || value.id === filename.replace(/\.json$/i, '')) &&
    typeof value.version === 'string' &&
    typeof value.universe === 'string' &&
    typeof value.author === 'string' &&
    (typeof value.game_version === 'string' || typeof value.game_version === 'number') &&
    (value.dependencies === undefined || (Array.isArray(value.dependencies) && value.dependencies.every((dependency) => typeof dependency === 'string')));
};

const moduleDataTypeToKey: Record<string, keyof ModuleDataSectionObject> = {
  action: 'actions',
  actions: 'actions',
  dialogue: 'dialogues',
  dialogues: 'dialogues',
  quest: 'quests',
  quests: 'quests',
  recipe: 'recipes',
  recipes: 'recipes',
  displayProfile: 'displayProfiles',
  displayProfiles: 'displayProfiles',
  collectionLog: 'collectionLogs',
  collectionLogs: 'collectionLogs',
  dropTable: 'dropTables',
  dropTables: 'dropTables',
  entity: 'entities',
  entities: 'entities',
  effect: 'effects',
  effects: 'effects',
  enemy: 'enemies',
  enemies: 'enemies',
  flag: 'flags',
  flags: 'flags',
  interactionType: 'interactionTypes',
  interactionTypes: 'interactionTypes',
  item: 'items',
  items: 'items',
  location: 'locations',
  locations: 'locations',
  resource: 'resources',
  resources: 'resources',
  resourceDefinition: 'resourceDefinitions',
  resourceDefinitions: 'resourceDefinitions',
  skill: 'skills',
  skills: 'skills',
  stat: 'stats',
  stats: 'stats',
};

const normalizeModuleDataEntry = (entry: ModuleDataEntry) => {
  const { type: _type, ...value } = entry;
  return value;
};

const normalizeModuleDataSection = (section?: ModuleDataSection): ModuleDataSectionObject => {
  if (!section) return {};
  if (!Array.isArray(section)) return section;
  const normalized: ModuleDataSectionObject = {};
  for (const entry of section) {
    const key = moduleDataTypeToKey[entry.type];
    if (!key) continue;
    const values = ((normalized[key] ?? []) as Record<string, unknown>[]).concat(normalizeModuleDataEntry(entry));
    (normalized as Record<keyof ModuleDataSectionObject, Record<string, unknown>[] | undefined>)[key] = values;
  }
  return normalized;
};

const moduleDataUpdatesObject = (updates?: ModuleDataUpdates): ModuleDataUpdatesObject | undefined =>
  updates && !Array.isArray(updates) ? updates : undefined;

type ModuleRemovalMap = NonNullable<ModuleDataUpdatesObject['remove']>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const removableModuleDataKeys = new Set([
  'locations',
  'entities',
  'actions',
  'skills',
  'stats',
  'items',
  'flags',
  'resources',
  'effects',
  'interactionTypes',
  'enemies',
  'dropTables',
  'collectionLogs',
  'dialogues',
  'dialogueOptions',
  'quests',
  'recipes',
  'displayProfiles',
  'locales',
]);

const isModuleRemoveEntry = (entry: unknown): entry is ModuleDataRemoveEntry =>
  isRecord(entry) &&
  entry.type === 'remove' &&
  typeof entry.target === 'string' &&
  typeof entry.id === 'string' &&
  (entry.path === undefined || typeof entry.path === 'string');

const mergeUniqueStrings = (left: string[] = [], right: string[] = []) =>
  Array.from(new Set([...left, ...right]));

const mergeModuleRemovals = (...removals: Array<ModuleRemovalMap | undefined>): ModuleRemovalMap => {
  const next: ModuleRemovalMap = {};
  for (const removal of removals) {
    for (const [key, value] of Object.entries(removal ?? {})) {
      if (key === 'dialogueOptions' && isRecord(value)) {
        const current = next.dialogueOptions ?? {};
        next.dialogueOptions = {
          ...current,
          ...Object.fromEntries(Object.entries(value).map(([path, ids]) => [
            path,
            mergeUniqueStrings(current[path], Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []),
          ])),
        };
      } else if (Array.isArray(value)) {
        (next as Record<string, string[] | undefined>)[key] = mergeUniqueStrings(
          (next as Record<string, string[] | undefined>)[key],
          value.filter((id): id is string => typeof id === 'string'),
        );
      }
    }
  }
  return next;
};

const typedRemovalsToObject = (updates?: ModuleDataUpdates): ModuleRemovalMap => {
  if (!Array.isArray(updates)) return {};
  return mergeModuleRemovals(...updates.filter(isModuleRemoveEntry).map((entry) => {
    if (entry.target === 'dialogueOptions') {
      return entry.path ? { dialogueOptions: { [entry.path]: [entry.id] } } : {};
    }
    return { [entry.target]: [entry.id] };
  }));
};

const moduleRemovals = (updates?: ModuleDataUpdates) =>
  mergeModuleRemovals(moduleDataUpdatesObject(updates)?.remove, typedRemovalsToObject(updates));

const sectionResources = (section?: ModuleDataSection) => {
  const normalized = normalizeModuleDataSection(section);
  return [
    ...(normalized.resourceDefinitions ?? []),
    ...(normalized.resources ?? []),
  ];
};

const emptySectionBundle = (bundle: ContentBundle, section?: ModuleDataSection): Partial<ContentBundle> => ({
  manifest: {
    ...bundle.manifest,
    displayProfiles: normalizeModuleDataSection(section).displayProfiles,
  },
  locations: normalizeModuleDataSection(section).locations ?? [],
  entities: normalizeModuleDataSection(section).entities ?? [],
  actions: normalizeModuleDataSection(section).actions ?? [],
  skills: normalizeModuleDataSection(section).skills ?? [],
  stats: normalizeModuleDataSection(section).stats ?? [],
  items: normalizeModuleDataSection(section).items ?? [],
  flags: normalizeModuleDataSection(section).flags ?? [],
  resourceDefinitions: sectionResources(section),
  effects: normalizeModuleDataSection(section).effects ?? [],
  interactionTypes: normalizeModuleDataSection(section).interactionTypes ?? [],
  enemies: normalizeModuleDataSection(section).enemies ?? [],
  dropTables: normalizeModuleDataSection(section).dropTables ?? [],
  collectionLogs: normalizeModuleDataSection(section).collectionLogs ?? [],
  dialogues: normalizeModuleDataSection(section).dialogues ?? [],
  quests: normalizeModuleDataSection(section).quests ?? [],
  recipes: normalizeModuleDataSection(section).recipes ?? [],
  locales: bundle.locales,
});

const prefixIssuePath = (moduleId: string, section: string, validationIssue: ValidationIssue): ValidationIssue => ({
  ...validationIssue,
  path: `modules.${moduleId}.${section}.${validationIssue.path}`,
});

const validateModuleDataSection = (bundle: ContentBundle, module: ContentModule, section: 'data' | 'data-updates') => {
  const data = section === 'data' ? module.data : module['data-updates'];
  if (!data) return [];
  const typeIssues = Array.isArray(data)
    ? data.flatMap((entry, index) => {
      if (section === 'data-updates' && isModuleRemoveEntry(entry)) return [];
      return isRecord(entry) && typeof entry.type === 'string' && moduleDataTypeToKey[entry.type]
          ? []
          : [issue('error', `modules.${module.id}.${section}.${index}.type`, 'validation.moduleDataTypeInvalid', {
              id: isRecord(entry) && typeof entry.type === 'string' ? entry.type : String(index),
            })];
    })
    : [];
  return [
    ...typeIssues,
    ...(section === 'data'
      ? validateContentShape(emptySectionBundle(bundle, data))
      : validateContentShape(applyDataUpdates(bundle, data))
    ).map((validationIssue) => prefixIssuePath(module.id, section, validationIssue)),
  ];
};

const validateModuleDataUpdatesShape = (module: ContentModule): ValidationIssue[] => {
  const updates = moduleDataUpdatesObject(module['data-updates']);
  const issues: ValidationIssue[] = [];

  for (const [index, patch] of (updates?.patches ?? []).entries()) {
    if (!isRecord(patch) ||
      typeof patch.targetModId !== 'string' ||
      typeof patch.objectType !== 'string' ||
      typeof patch.objectId !== 'string' ||
      !Array.isArray(patch.ops) ||
      patch.ops.some((op) =>
        !isRecord(op) ||
        (op.op !== 'add' && op.op !== 'replace' && op.op !== 'remove') ||
        typeof op.path !== 'string' ||
        ((op.op === 'add' || op.op === 'replace') && !('value' in op)),
      )) {
      issues.push(issue('error', `modules.${module.id}.data-updates.patches.${index}`, 'validation.modulePatchInvalid', { id: String(index) }));
    }
  }

  if (updates?.remove !== undefined) {
    if (!isRecord(updates.remove)) {
      issues.push(issue('error', `modules.${module.id}.data-updates.remove`, 'validation.moduleRemoveInvalid'));
    } else {
      for (const [key, value] of Object.entries(updates.remove)) {
        const validValue = key === 'dialogueOptions'
          ? isRecord(value) && Object.entries(value).every(([path, ids]) => path.trim().length > 0 && Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.trim().length > 0))
          : Array.isArray(value) && value.every((id) => typeof id === 'string' && id.trim().length > 0);
        if (!removableModuleDataKeys.has(key) || !validValue) {
          issues.push(issue('error', `modules.${module.id}.data-updates.remove.${key}`, 'validation.moduleRemoveInvalid', { id: key }));
        }
      }
    }
  }

  if (Array.isArray(module['data-updates'])) {
    module['data-updates'].forEach((entry, index) => {
      if (!isRecord(entry) || entry.type !== 'remove') return;
      const validTarget = typeof entry.target === 'string' && removableModuleDataKeys.has(entry.target);
      const validId = typeof entry.id === 'string' && entry.id.trim().length > 0;
      const validPath = entry.target === 'dialogueOptions'
        ? typeof entry.path === 'string' && entry.path.trim().length > 0
        : entry.path === undefined || typeof entry.path === 'string';
      if (!validTarget || !validId || !validPath) {
        issues.push(issue('error', `modules.${module.id}.data-updates.${index}.remove`, 'validation.moduleRemoveInvalid', {
          id: typeof entry.target === 'string' ? entry.target : String(index),
        }));
      }
    });
  }

  for (const [locale, dictionary] of Object.entries(updates?.locale ?? {})) {
    issues.push(...validateLocaleDictionary(dictionary).map((validationIssue) => ({
      ...validationIssue,
      path: `modules.${module.id}.data-updates.locale.${locale}.${validationIssue.path}`,
    })));
  }

  return issues;
};

const moduleShapeIssueId = (module: unknown, index: number) =>
  module && typeof module === 'object' && !Array.isArray(module) && typeof (module as Record<string, unknown>).id === 'string'
    ? String((module as Record<string, unknown>).id)
    : `module-${index + 1}`;

const partitionValidModuleShapes = (modules: unknown[]) => {
  const issues: ValidationIssue[] = [];
  const valid: ContentModule[] = [];
  const seenIds = new Set<string>();

  modules.forEach((module, index) => {
    const id = moduleShapeIssueId(module, index);
    if (!validateModuleShape(module)) {
      issues.push(issue('error', `modules.${id}`, 'validation.moduleShapeInvalid', { id }));
      return;
    }
    if (seenIds.has(module.id)) {
      issues.push(issue('error', `modules.${module.id}`, 'validation.moduleDuplicate', { id: module.id }));
      return;
    }
    seenIds.add(module.id);
    valid.push(module);
  });

  return { valid, issues };
};

const localizationKeysFromAction = (action: GameAction) => [
  actionTitleKey(action.id),
  actionDescriptionKey(action.id),
  actionSuccessKey(action.id),
  actionFailureKey(action.id),
  action.enemyId ? actionKillKey(action.id) : null,
  ...(action.results ?? []).flatMap((result) => result.kind === 'chat' ? [result.messageKey] : []),
];

const generatedLocalizationKeysFromAction = (action: GameAction) =>
  isTravelAction(action) ? travelActionLocalizationKeys(action) : [];

const localizationKeysFromDialogues = (dialogues: DialogueDefinition[] = []) =>
  dialogues.flatMap((dialogue) => (Array.isArray(dialogue.nodes) ? dialogue.nodes : []).flatMap((node) => [
    node.textKey,
    node.narratorKey,
    ...((Array.isArray(node.options) ? node.options : []).map((option) => option.labelKey)),
  ]));

const hasId = (value: { id?: unknown }): value is { id: string } => typeof value.id === 'string' && value.id.trim().length > 0;

type ExistingModuleDataIds = Partial<Record<keyof ModuleDataSectionObject | 'resources', Set<string>>>;

const existingDataIdsFromBundle = (bundle: ContentBundle): ExistingModuleDataIds => ({
  locations: new Set(bundle.locations.map((item) => item.id)),
  entities: new Set((bundle.entities ?? []).map((item) => item.id)),
  actions: new Set(bundle.actions.map((item) => item.id)),
  skills: new Set(bundle.skills.map((item) => item.id)),
  stats: new Set(bundle.stats.map((item) => item.id)),
  items: new Set((bundle.items ?? []).map((item) => item.id)),
  flags: new Set((bundle.flags ?? []).map((item) => item.id)),
  resources: new Set((bundle.resourceDefinitions ?? []).map((item) => item.id)),
  resourceDefinitions: new Set((bundle.resourceDefinitions ?? []).map((item) => item.id)),
  effects: new Set((bundle.effects ?? []).map((item) => item.id)),
  interactionTypes: new Set((bundle.interactionTypes ?? []).map((item) => item.id)),
  enemies: new Set((bundle.enemies ?? []).map((item) => item.id)),
  dropTables: new Set((bundle.dropTables ?? []).map((item) => item.id)),
  collectionLogs: new Set((bundle.collectionLogs ?? []).map((item) => item.id)),
  dialogues: new Set((bundle.dialogues ?? []).map((item) => item.id)),
  quests: new Set((bundle.quests ?? []).map((item) => item.id)),
  recipes: new Set((bundle.recipes ?? []).map((item) => item.id)),
  displayProfiles: new Set((bundle.manifest.displayProfiles ?? []).map((item) => item.id)),
});

const newLocalizationRows = <T extends { id?: unknown }>(
  rows: T[] | undefined,
  key: keyof ExistingModuleDataIds,
  existingIds?: ExistingModuleDataIds,
) => (rows ?? [])
  .filter((row): row is T & { id: string } => hasId(row))
  .filter((row) => !existingIds?.[key]?.has(row.id));

const localizationKeysFromSection = (section?: ModuleDataSection, existingIds?: ExistingModuleDataIds) => [
  ...newLocalizationRows(normalizeModuleDataSection(section).locations, 'locations', existingIds).flatMap((location) => [
    locationTitleKey(location.id),
    locationDescriptionKey(location.id),
    locationExhaustedKey(location.id),
  ]),
  ...newLocalizationRows(normalizeModuleDataSection(section).entities, 'entities', existingIds).flatMap((entity) => [
    entityTitleKey(entity.id),
    ...((entity as { collectionLog?: Array<{ categoryId?: string }> }).collectionLog ?? [])
      .map((definition) => definition.categoryId ? collectionCategoryTitleKey(definition.categoryId) : null),
  ]),
  ...((normalizeModuleDataSection(section).collectionLogs ?? []) as Array<{ categoryId?: string }>).map((definition) =>
    definition.categoryId ? collectionCategoryTitleKey(definition.categoryId) : null,
  ),
  ...newLocalizationRows(normalizeModuleDataSection(section).actions, 'actions', existingIds).flatMap(localizationKeysFromAction),
  ...newLocalizationRows(normalizeModuleDataSection(section).skills, 'skills', existingIds).flatMap((skill) => [skillTitleKey(skill.id), skillDescriptionKey(skill.id)]),
  ...newLocalizationRows(normalizeModuleDataSection(section).stats, 'stats', existingIds).flatMap((stat) => [statTitleKey(stat.id), statDescriptionKey(stat.id)]),
  ...newLocalizationRows(normalizeModuleDataSection(section).items, 'items', existingIds).flatMap((item) => [itemTitleKey(item.id), itemDescriptionKey(item.id)]),
  ...newLocalizationRows(normalizeModuleDataSection(section).interactionTypes, 'interactionTypes', existingIds).flatMap((interactionType) => [
    interactionTitleKey(interactionType.id),
    interactionPlayerHitKey(interactionType.id),
    interactionPlayerMissKey(interactionType.id),
    interactionPlayerKillKey(interactionType.id),
    interactionEntityHitKey(interactionType.id),
    interactionEntityMissKey(interactionType.id),
    interactionEntityKillKey(interactionType.id),
  ]),
  ...newLocalizationRows(sectionResources(section), 'resources', existingIds).flatMap((resource) => [
    resourceTitleKey(resource.id),
    ...(resource.onEmpty ?? []).flatMap((behavior) => typeof behavior === 'object' && behavior !== null && behavior.kind === 'chat' ? [behavior.messageKey] : []),
    ...(resource.onFull ?? []).flatMap((behavior) => typeof behavior === 'object' && behavior !== null && behavior.kind === 'chat' ? [behavior.messageKey] : []),
  ]),
  ...newLocalizationRows(normalizeModuleDataSection(section).effects, 'effects', existingIds).map((effect) => effectTitleKey(effect.id)),
  ...localizationKeysFromDialogues(normalizeModuleDataSection(section).dialogues),
  ...newLocalizationRows(normalizeModuleDataSection(section).quests, 'quests', existingIds).flatMap((quest) => [
    quest.titleKey,
    ...quest.stages.flatMap((stage) => [stage.descriptionKey, stage.hintKey]),
  ]),
  ...(normalizeModuleDataSection(section).displayProfiles ?? []).map((profile) => profile.titleKey),
].filter((key): key is string => Boolean(key));

export const collectModuleLocalizationKeys = (module: ContentModule, bundle?: ContentBundle) =>
  Array.from(new Set([
    ...localizationKeysFromSection(module.data, bundle ? existingDataIdsFromBundle(bundle) : undefined),
    ...localizationKeysFromSection(module['data-updates'], bundle ? existingDataIdsFromBundle(bundle) : undefined),
  ]));

const moduleLocaleDictionary = (module: ContentModule, locale: string): LocaleDictionary => ({
  ...(module.locale?.[locale] ?? {}),
  ...(moduleDataUpdatesObject(module['data-updates'])?.locale?.[locale] ?? {}),
});

export const bundleWithModuleData = (bundle: ContentBundle, modules: ContentModule[]) => {
  let next = bundle;
  for (const module of modules) {
    if (validateModuleDataSection(bundle, module, 'data').some((validationIssue) => validationIssue.severity === 'error')) {
      continue;
    }
    next = {
      ...applyDataSection(next, module.data),
      locales: mergeLocales(next.locales, module.locale),
    };
  }
  return next;
};

const validateContentModule = (
  bundle: ContentBundle,
  module: ContentModule,
  currentLocale = bundle.manifest.locales[0] ?? 'en',
  localizationBundle = bundle,
): ValidationIssue[] => {
  const normalizedData = normalizeModuleDataSection(module.data);
  const normalizedUpdates = normalizeModuleDataSection(module['data-updates']);
  const generatedLocalizationKeys = new Set([
    ...(normalizedData.actions ?? []).flatMap(generatedLocalizationKeysFromAction),
    ...(normalizedUpdates.actions ?? []).flatMap(generatedLocalizationKeysFromAction),
  ]);

  return [
    ...(!isModuleVersion(module.version)
      ? [issue('error', `modules.${module.id}.version`, 'validation.moduleVersionInvalid', { id: module.id })]
      : []),
    ...(!isGameVersion(module.game_version)
      ? [issue('error', `modules.${module.id}.game_version`, 'validation.moduleGameVersionInvalid', { id: module.id })]
      : []),
    ...validateModuleDataSection(bundle, module, 'data'),
    ...validateModuleDataSection(bundle, module, 'data-updates'),
    ...validateModuleDataUpdatesShape(module),
    ...collectModuleLocalizationKeys(module, localizationBundle).flatMap((key) =>
      moduleLocaleDictionary(module, currentLocale)[key] || generatedLocalizationKeys.has(key)
        ? []
        : [issue('warning', `modules.${module.id}.locale.${currentLocale}.${key}`, 'validation.missingLocalization')],
    ),
    ...Object.entries(module.locale ?? {}).flatMap(([locale, dictionary]) =>
      validateLocaleDictionary(dictionary).map((validationIssue) => ({
        ...validationIssue,
        path: `modules.${module.id}.locale.${locale}.${validationIssue.path}`,
      })),
    ),
  ];
};

const moduleDataCollisionKeys: Array<keyof ModuleDataSectionObject> = [
  'locations',
  'entities',
  'actions',
  'skills',
  'stats',
  'items',
  'flags',
  'effects',
  'interactionTypes',
  'enemies',
  'dropTables',
  'collectionLogs',
  'dialogues',
  'quests',
  'recipes',
  'displayProfiles',
];

const bundleIdsForDataKey = (bundle: ContentBundle, key: keyof ModuleDataSectionObject) => {
  if (key === 'displayProfiles') return (bundle.manifest.displayProfiles ?? []).map((item) => item.id);
  return (((bundle as unknown as Record<keyof ModuleDataSectionObject, Array<{ id: string }> | undefined>)[key]) ?? []).map((item) => item.id);
};

const validateModuleDataCollisions = (bundle: ContentBundle, modules: ContentModule[]): ValidationIssue[] => {
  const seen = Object.fromEntries(moduleDataCollisionKeys.map((key) => [key, new Set(bundleIdsForDataKey(bundle, key))])) as Record<keyof ModuleDataSectionObject, Set<string>>;
  seen.resources = new Set((bundle.resourceDefinitions ?? []).map((item) => item.id));
  seen.resourceDefinitions = seen.resources;
  const issues: ValidationIssue[] = [];

  for (const module of modules) {
    const data = normalizeModuleDataSection(module.data);
    for (const key of moduleDataCollisionKeys) {
      const rows = (data[key] as Array<{ id?: unknown }> | undefined) ?? [];
      for (const row of rows) {
        if (!hasId(row)) continue;
        if (seen[key]?.has(row.id)) {
          issues.push(issue('error', `modules.${module.id}.data.${key}.${row.id}`, 'validation.duplicateId', { id: row.id }));
        }
        seen[key]?.add(row.id);
      }
    }
    for (const row of sectionResources(data) as Array<{ id?: unknown }>) {
      if (!hasId(row)) continue;
      if (seen.resources?.has(row.id)) {
        issues.push(issue('error', `modules.${module.id}.data.resources.${row.id}`, 'validation.duplicateId', { id: row.id }));
      }
      seen.resources?.add(row.id);
    }
  }

  return issues;
};

const validateModuleDataUpdateDuplicates = (module: ContentModule): ValidationIssue[] => {
  const data = normalizeModuleDataSection(module['data-updates']);
  const seen = Object.fromEntries(moduleDataCollisionKeys.map((key) => [key, new Set<string>()])) as Record<keyof ModuleDataSectionObject, Set<string>>;
  seen.resources = new Set<string>();
  seen.resourceDefinitions = seen.resources;
  const issues: ValidationIssue[] = [];

  for (const key of moduleDataCollisionKeys) {
    const rows = (data[key] as Array<{ id?: unknown }> | undefined) ?? [];
    for (const row of rows) {
      if (!hasId(row)) continue;
      if (seen[key]?.has(row.id)) {
        issues.push(issue('error', `modules.${module.id}.data-updates.${key}.${row.id}`, 'validation.duplicateId', { id: row.id }));
      }
      seen[key]?.add(row.id);
    }
  }
  for (const row of sectionResources(data) as Array<{ id?: unknown }>) {
    if (!hasId(row)) continue;
    if (seen.resources?.has(row.id)) {
      issues.push(issue('error', `modules.${module.id}.data-updates.resources.${row.id}`, 'validation.duplicateId', { id: row.id }));
    }
    seen.resources?.add(row.id);
  }

  return issues;
};

const validateModuleDataUpdateTargets = (bundle: ContentBundle, module: ContentModule): ValidationIssue[] => {
  const data = normalizeModuleDataSection(module['data-updates']);
  const patches = moduleDataUpdatesObject(module['data-updates'])?.patches ?? [];
  const existingIds = existingDataIdsFromBundle(bundle);
  const issues: ValidationIssue[] = [];

  for (const key of moduleDataCollisionKeys) {
    const rows = (data[key] as Array<{ id?: unknown }> | undefined) ?? [];
    for (const row of rows) {
      if (!hasId(row) || existingIds[key]?.has(row.id)) continue;
      issues.push(issue('error', `modules.${module.id}.data-updates.${key}.${row.id}`, 'validation.moduleUpdateTargetMissing', { id: row.id }));
    }
  }
  for (const row of sectionResources(data) as Array<{ id?: unknown }>) {
    if (!hasId(row) || existingIds.resources?.has(row.id)) continue;
    issues.push(issue('error', `modules.${module.id}.data-updates.resources.${row.id}`, 'validation.moduleUpdateTargetMissing', { id: row.id }));
  }

  const patchIds = new Map<string, Set<string>>();
  const patchTypeIds = (objectType: string) => {
    const current = patchIds.get(objectType);
    if (current) return current;
    const entry = getModObjectType(objectType);
    const ids = new Set(entry ? entry.read(bundle).map((item) => item.id) : []);
    patchIds.set(objectType, ids);
    return ids;
  };

  for (const [index, patch] of patches.entries()) {
    const entry = getModObjectType(patch.objectType);
    if (!entry) {
      issues.push(issue('error', `modules.${module.id}.data-updates.patches.${index}.objectType`, 'validation.moduleDataTypeInvalid', { id: patch.objectType }));
      continue;
    }
    const ids = patchTypeIds(patch.objectType);
    const exists = ids.has(patch.objectId);
    const createsObject = patch.ops.some((op) => op.op === 'add' && op.path === '');
    const removesObject = patch.ops.some((op) => op.op === 'remove' && op.path === '');
    if (!exists && !createsObject) {
      issues.push(issue('error', `modules.${module.id}.data-updates.patches.${index}`, 'validation.moduleUpdateTargetMissing', { id: patch.objectId }));
    }
    if (exists && createsObject) {
      issues.push(issue('error', `modules.${module.id}.data-updates.patches.${index}`, 'validation.duplicateId', { id: patch.objectId }));
    }
    if (removesObject) ids.delete(patch.objectId);
    else if (exists || createsObject) ids.add(patch.objectId);
  }

  return issues;
};

const validateModuleSemanticChanges = (bundle: ContentBundle, module: ContentModule): ValidationIssue[] => {
  const shapeIssues = [
    ...validateModuleDataSection(bundle, module, 'data'),
    ...validateModuleDataSection(bundle, module, 'data-updates'),
  ];
  if (shapeIssues.some((validationIssue) => validationIssue.severity === 'error')) return [];

  const withData = {
    ...applyDataSection(bundle, module.data),
    locales: mergeLocales(bundle.locales, module.locale),
  };
  const beforeIssues = new Set(validateContentBundle(normalizeContentBundleStructure(withData))
    .filter((validationIssue) => validationIssue.severity === 'error')
    .map((validationIssue) => `${validationIssue.path}:${validationIssue.message}:${JSON.stringify(validationIssue.params ?? {})}`));
  const withUpdates = applyDataUpdates(withData, module['data-updates']);
  const semanticIssues = validateContentBundle(normalizeContentBundleStructure(withUpdates))
    .filter((validationIssue) =>
      (validationIssue.severity === 'error' && !beforeIssues.has(`${validationIssue.path}:${validationIssue.message}:${JSON.stringify(validationIssue.params ?? {})}`)) ||
      moduleChangesContentPath(module, validationIssue, typeof validationIssue.params?.id === 'string' ? validationIssue.params.id : '') ||
      moduleOwnsContentPath(module, validationIssue) ||
      (typeof validationIssue.params?.id === 'string' && removedIdsByModule(module).has(validationIssue.params.id)),
    );
  const conflictKeys = Array.from(new Set(semanticIssues
    .filter((validationIssue) => validationIssue.severity === 'error')
    .map((validationIssue) => typeof validationIssue.params?.id === 'string'
      ? validationIssue.params.id
      : contentPathKey(validationIssue) ?? removedIdsForValidationCollection(module, validationIssue)[0] ?? module.id)));
  return conflictKeys.map((key) => issue('error', `modules.${module.id}`, 'validation.moduleConflictDisabled', { id: module.id, key }));
};

const validateModulePacks = (packs: ContentModulePack[], moduleIds: Set<string>, seenPackIds = new Set<string>()): ValidationIssue[] =>
  packs.flatMap((pack) => {
    const issues: ValidationIssue[] = [];
    if (!pack || typeof pack !== 'object' || Array.isArray(pack) || typeof pack.id !== 'string') {
      return [issue('warning', 'modulePacks', 'validation.modulePacksInvalid')];
    }
    if (seenPackIds.has(pack.id)) {
      issues.push(issue('warning', `modulePacks.${pack.id}`, 'validation.modulePackDuplicate', { id: pack.id }));
    }
    seenPackIds.add(pack.id);
    const packModules = Array.isArray(pack.modules) ? pack.modules : [];
    for (const moduleId of packModules) {
      if (typeof moduleId !== 'string') {
        issues.push(issue('warning', `modulePacks.${pack.id}.modules`, 'validation.modulePacksInvalid'));
        continue;
      }
      if (!moduleIds.has(moduleId)) {
        issues.push(issue('warning', `modulePacks.${pack.id}.modules.${moduleId}`, 'validation.modulePackUnknownModule', { id: moduleId, pack: pack.id }));
      }
    }
    return [...issues, ...validateModulePacks(Array.isArray(pack.packs) ? pack.packs : [], moduleIds, seenPackIds)];
  });

const mergeById = <T extends { id: string }>(base: T[], additions: T[] = []) => {
  const merged = new Map(base.map((item) => [item.id, item]));
  for (const item of additions) merged.set(item.id, item);
  return [...merged.values()];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && Object.getPrototypeOf(value) === Object.prototype;

const mergePatchValue = (base: unknown, patch: unknown): unknown => {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = key in next ? mergePatchValue(next[key], value) : value;
  }
  return next;
};

const mergePatchById = <T extends { id: string }>(base: T[], patches: Array<Partial<T> & { id: string }> = []) => {
  const merged = new Map(base.map((item) => [item.id, item]));
  for (const patch of patches) {
    const current = merged.get(patch.id);
    if (current) merged.set(patch.id, mergePatchValue(current, patch) as T);
  }
  return [...merged.values()];
};

const removeById = <T extends { id: string }>(base: T[], removed: string[] = []) => {
  const removedIds = new Set(removed);
  return base.filter((item) => !removedIds.has(item.id));
};

const removeDialogueOptions = (dialogues: DialogueDefinition[] = [], removals: Record<string, string[]> = {}) => {
  const removalsByDialogue = new Map<string, Map<string, Set<string>>>();
  for (const [path, optionIds] of Object.entries(removals)) {
    const [dialogueId, ...nodeParts] = path.split('.');
    const nodeId = nodeParts.join('.');
    if (!dialogueId || !nodeId) continue;
    const nodeRemovals = removalsByDialogue.get(dialogueId) ?? new Map<string, Set<string>>();
    nodeRemovals.set(nodeId, new Set(optionIds));
    removalsByDialogue.set(dialogueId, nodeRemovals);
  }

  return dialogues.map((dialogue) => {
    const nodeRemovals = removalsByDialogue.get(dialogue.id);
    if (!nodeRemovals) return dialogue;
    return {
      ...dialogue,
      nodes: dialogue.nodes.map((node) => {
        const optionIds = nodeRemovals.get(node.id);
        return optionIds ? { ...node, options: (node.options ?? []).filter((option) => !optionIds.has(option.id)) } : node;
      }),
    };
  });
};

const mergeLocales = (
  base: Record<string, LocaleDictionary>,
  additions?: Record<string, LocaleDictionary>,
  removals: string[] = [],
) => {
  const next: Record<string, LocaleDictionary> = Object.fromEntries(
    Object.entries(base).map(([locale, dictionary]) => [locale, { ...dictionary }]),
  );
  for (const key of removals) {
    for (const dictionary of Object.values(next)) delete dictionary[key];
  }
  for (const [locale, dictionary] of Object.entries(additions ?? {})) {
    next[locale] = { ...(next[locale] ?? {}), ...dictionary };
  }
  return next;
};

const applyDataSection = (bundle: ContentBundle, data?: ModuleDataSection): ContentBundle => {
  if (!data) return bundle;
  const section = normalizeModuleDataSection(data);
  return {
    ...bundle,
    manifest: section.displayProfiles
      ? { ...bundle.manifest, displayProfiles: mergeById(bundle.manifest.displayProfiles ?? [], section.displayProfiles) }
      : bundle.manifest,
    locations: mergeById(bundle.locations, section.locations),
    entities: mergeById(bundle.entities ?? [], section.entities),
    actions: mergeById(bundle.actions, section.actions),
    skills: mergeById(bundle.skills, section.skills),
    stats: mergeById(bundle.stats, section.stats),
    items: mergeById(bundle.items ?? [], section.items),
    flags: mergeById(bundle.flags ?? [], section.flags),
    resourceDefinitions: mergeById(bundle.resourceDefinitions ?? [], sectionResources(section)),
    effects: mergeById(bundle.effects ?? [], section.effects),
    interactionTypes: mergeById(bundle.interactionTypes ?? [], section.interactionTypes),
    enemies: mergeById(bundle.enemies ?? [], section.enemies),
    dropTables: mergeById(bundle.dropTables ?? [], section.dropTables),
    collectionLogs: mergeById(bundle.collectionLogs ?? [], section.collectionLogs),
    dialogues: mergeById(bundle.dialogues ?? [], section.dialogues),
    quests: mergeById(bundle.quests ?? [], section.quests),
    recipes: mergeById(bundle.recipes ?? [], section.recipes),
  };
};

const applyDataUpdateSection = (bundle: ContentBundle, data?: ModuleDataSection): ContentBundle => {
  if (!data) return bundle;
  const section = normalizeModuleDataSection(data);
  return {
    ...bundle,
    manifest: section.displayProfiles
      ? { ...bundle.manifest, displayProfiles: mergePatchById(bundle.manifest.displayProfiles ?? [], section.displayProfiles) }
      : bundle.manifest,
    locations: mergePatchById(bundle.locations, section.locations),
    entities: mergePatchById(bundle.entities ?? [], section.entities),
    actions: mergePatchById(bundle.actions, section.actions),
    skills: mergePatchById(bundle.skills, section.skills),
    stats: mergePatchById(bundle.stats, section.stats),
    items: mergePatchById(bundle.items ?? [], section.items),
    flags: mergePatchById(bundle.flags ?? [], section.flags),
    resourceDefinitions: mergePatchById(bundle.resourceDefinitions ?? [], sectionResources(section)),
    effects: mergePatchById(bundle.effects ?? [], section.effects),
    interactionTypes: mergePatchById(bundle.interactionTypes ?? [], section.interactionTypes),
    enemies: mergePatchById(bundle.enemies ?? [], section.enemies),
    dropTables: mergePatchById(bundle.dropTables ?? [], section.dropTables),
    collectionLogs: mergePatchById(bundle.collectionLogs ?? [], section.collectionLogs),
    dialogues: mergePatchById(bundle.dialogues ?? [], section.dialogues),
    quests: mergePatchById(bundle.quests ?? [], section.quests),
    recipes: mergePatchById(bundle.recipes ?? [], section.recipes),
  };
};

const applyObjectPatches = (bundle: ContentBundle, patches: ModuleObjectPatch[] = []) => {
  let next = bundle;
  for (const patch of patches) {
    const entry = getModObjectType(patch.objectType);
    if (!entry) continue;
    const rows = entry.read(next);
    const current = rows.find((row) => row.id === patch.objectId);
    const patched = applyJsonPatch(current, patch.ops) as { id?: string } | undefined;
    if (!patched) {
      next = entry.write(next, rows.filter((row) => row.id !== patch.objectId));
      continue;
    }
    const row = { ...patched, id: patch.objectId } as { id: string };
    next = entry.write(
      next,
      current
        ? rows.map((candidate) => (candidate.id === patch.objectId ? row : candidate))
        : [...rows, row],
    );
  }
  return next;
};

const applyDataUpdates = (bundle: ContentBundle, updates?: ModuleDataUpdates): ContentBundle => {
  if (!updates) return bundle;
  const updateObject = moduleDataUpdatesObject(updates);
  const removed = moduleRemovals(updates);
  const withoutRemoved = {
    ...bundle,
    manifest: removed.displayProfiles
      ? { ...bundle.manifest, displayProfiles: removeById(bundle.manifest.displayProfiles ?? [], removed.displayProfiles) }
      : bundle.manifest,
    locations: removeById(bundle.locations, removed.locations),
    entities: removeById(bundle.entities ?? [], removed.entities),
    actions: removeById(bundle.actions, removed.actions),
    skills: removeById(bundle.skills, removed.skills),
    stats: removeById(bundle.stats, removed.stats),
    items: removeById(bundle.items ?? [], removed.items),
    flags: removeById(bundle.flags ?? [], removed.flags),
    resourceDefinitions: removeById(bundle.resourceDefinitions ?? [], removed.resources),
    effects: removeById(bundle.effects ?? [], removed.effects),
    interactionTypes: removeById(bundle.interactionTypes ?? [], removed.interactionTypes),
    enemies: removeById(bundle.enemies ?? [], removed.enemies),
    dropTables: removeById(bundle.dropTables ?? [], removed.dropTables),
    collectionLogs: removeById(bundle.collectionLogs ?? [], removed.collectionLogs),
    dialogues: removeDialogueOptions(removeById(bundle.dialogues ?? [], removed.dialogues), removed.dialogueOptions),
    quests: removeById(bundle.quests ?? [], removed.quests),
    recipes: removeById(bundle.recipes ?? [], removed.recipes),
    locales: mergeLocales(bundle.locales, updateObject?.locale, removed.locales),
  };
  return applyObjectPatches(applyDataUpdateSection(withoutRemoved, updates), updateObject?.patches);
};

const resolveEnabledSet = (modules: ContentModule[], requestedEnabledIds?: string[]) => {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const moduleIds = new Set(modules.map((module) => module.id));
  const enabled = new Set(requestedEnabledIds ?? modules.map((module) => module.id));
  for (const id of [...enabled]) if (!moduleIds.has(id)) enabled.delete(id);

  let changed = true;
  while (changed) {
    changed = false;
    for (const module of modules) {
      if (!enabled.has(module.id)) continue;
      for (const dependencyText of module.dependencies ?? []) {
        const dependency = parseModuleDependency(dependencyText);
        if (!dependency) continue;
        if (dependency.prefix === '+') {
          if (dependencyVersionMatches(byId.get(dependency.id), dependency) && !enabled.has(dependency.id)) {
            enabled.add(dependency.id);
            changed = true;
          }
        }
      }
    }
  }

  return enabled;
};

const orderModules = (modules: ContentModule[], enabled: Set<string>) => {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const issues: ValidationIssue[] = [];
  const ordered: ContentModule[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const disabled = new Set<string>();
  const stack: string[] = [];

  const disableCycle = (moduleId: string) => {
    const cycleStart = stack.indexOf(moduleId);
    const cycleIds = cycleStart >= 0 ? stack.slice(cycleStart) : [moduleId];
    for (const id of cycleIds) {
      disabled.add(id);
      issues.push(issue('warning', `modules.${id}.dependencies`, 'validation.moduleCircularDependency', { id }));
    }
  };

  const visit = (module: ContentModule) => {
    if (visited.has(module.id) || disabled.has(module.id)) return;
    if (visiting.has(module.id)) {
      disableCycle(module.id);
      return;
    }

    visiting.add(module.id);
    stack.push(module.id);
    for (const dependencyText of module.dependencies ?? []) {
      const dependency = parseModuleDependency(dependencyText);
      if (!dependency) {
        issues.push(issue('warning', `modules.${module.id}.dependencies`, 'validation.moduleDependencyInvalid', { id: dependencyText }));
        continue;
      }
      if (dependency.prefix === '!' && enabled.has(dependency.id)) {
        const dependencyModule = byId.get(dependency.id);
        if (dependencyVersionMatches(dependencyModule, dependency)) {
          disabled.add(module.id);
          issues.push(issue('warning', `modules.${module.id}.dependencies`, 'validation.moduleIncompatible', { id: dependency.id }));
        }
      }
      if (dependency.prefix === '' || dependency.prefix === '+' || dependency.prefix === '?') {
        const dependencyModule = byId.get(dependency.id);
        if (!dependencyModule || !enabled.has(dependency.id)) {
          if (dependency.prefix === '?') continue;
          disabled.add(module.id);
          issues.push(issue('warning', `modules.${module.id}.dependencies`, 'validation.moduleMissingDependency', { id: dependency.id }));
          continue;
        }
        if (!dependencyVersionMatches(dependencyModule, dependency)) {
          if (dependency.prefix === '?') continue;
          disabled.add(module.id);
          issues.push(issue('warning', `modules.${module.id}.dependencies`, 'validation.moduleDependencyVersionMismatch', {
            id: dependency.id,
            version: dependency.version ?? '',
          }));
          continue;
        }
        visit(dependencyModule);
        if (disabled.has(dependency.id)) disabled.add(module.id);
      }
    }
    stack.pop();
    visiting.delete(module.id);
    visited.add(module.id);
    if (!disabled.has(module.id)) ordered.push(module);
  };

  for (const module of moduleSort(modules).filter((item) => enabled.has(item.id))) visit(module);
  return { ordered: ordered.filter((module) => !disabled.has(module.id)), disabled, issues };
};

const applyOrderedModules = (bundle: ContentBundle, relevantModules: ContentModule[], ordered: ContentModule[]) => {
  let next: ContentBundle = { ...bundle, modules: relevantModules };
  for (const module of ordered) next = applyDataSection(next, module.data);
  for (const module of ordered) {
    next = {
      ...applyDataUpdates(next, module['data-updates']),
      locales: mergeLocales(next.locales, module.locale),
    };
  }
  return normalizeContentBundleStructure(next);
};

const removedIdsByModule = (module: ContentModule) =>
  new Set(Object.entries(moduleRemovals(module['data-updates'])).flatMap(([key, value]) =>
    key === 'dialogueOptions' && isRecord(value)
      ? Object.values(value).flatMap((ids) => Array.isArray(ids) ? ids : [])
      : Array.isArray(value) ? value : [],
  ));

const referencesIdValue = (value: unknown, id: string, key = ''): boolean => {
  if (typeof value === 'string') return key !== 'id' && value === id;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => referencesIdValue(item, id, key));
  return Object.entries(value).some(([childKey, childValue]) => referencesIdValue(childValue, id, childKey));
};

const moduleReferencesId = (module: ContentModule, id: string) =>
  referencesIdValue(module.data, id) ||
  (Array.isArray(module['data-updates'])
    ? referencesIdValue(module['data-updates'].filter((entry) => !isModuleRemoveEntry(entry)), id)
    : referencesIdValue({ ...moduleDataUpdatesObject(module['data-updates']), remove: undefined }, id));

const isProtectedCoreModule = (module: Pick<ContentModule, 'id'>) =>
  module.id === 'base-core';

const pathContentKeys: Record<string, keyof ModuleDataSectionObject> = {
  locations: 'locations',
  entities: 'entities',
  actions: 'actions',
  skills: 'skills',
  stats: 'stats',
  items: 'items',
  flags: 'flags',
  resources: 'resources',
  effects: 'effects',
  interactionTypes: 'interactionTypes',
  enemies: 'enemies',
  dropTables: 'dropTables',
  collectionLogs: 'collectionLogs',
  dialogues: 'dialogues',
};

const contentPathFromValidationIssue = (validationIssue: ValidationIssue) => {
  const path = validationIssue.path.replace(/^modules:/, '');
  const [collection, id] = path.split('.');
  const key = pathContentKeys[collection];
  return key && id ? { key, id } : null;
};

const collectionKeyFromValidationIssue = (validationIssue: ValidationIssue) => {
  const [collection] = validationIssue.path.replace(/^modules:/, '').split('.');
  return pathContentKeys[collection];
};

const contentPathKey = (validationIssue: ValidationIssue) => {
  const contentPath = contentPathFromValidationIssue(validationIssue);
  return contentPath?.id;
};

const rowsForModuleKey = (module: ContentModule, key: keyof ModuleDataSectionObject) => [
  ...((normalizeModuleDataSection(module.data)[key] as Array<{ id?: unknown }> | undefined) ?? []),
  ...((normalizeModuleDataSection(module['data-updates'])[key] as Array<{ id?: unknown }> | undefined) ?? []),
  ...((moduleDataUpdatesObject(module['data-updates'])?.patches ?? [])
    .filter((patch) => getModObjectType(patch.objectType)?.dataKey === key)
    .map((patch) => ({ id: patch.objectId, ops: patch.ops }))),
];

const moduleChangesContentPath = (module: ContentModule, validationIssue: ValidationIssue, missingId: string) => {
  const contentPath = contentPathFromValidationIssue(validationIssue);
  if (!contentPath) return false;
  return rowsForModuleKey(module, contentPath.key)
    .some((row) => row.id === contentPath.id && referencesIdValue(row, missingId));
};

const moduleOwnsContentPath = (module: ContentModule, validationIssue: ValidationIssue) => {
  const contentPath = contentPathFromValidationIssue(validationIssue);
  if (!contentPath) return false;
  return rowsForModuleKey(module, contentPath.key).some((row) => row.id === contentPath.id);
};

const removedIdsForValidationCollection = (module: ContentModule, validationIssue: ValidationIssue) => {
  const key = collectionKeyFromValidationIssue(validationIssue);
  if (!key) return [];
  const removed = moduleRemovals(module['data-updates']);
  const removalKey = key === 'resourceDefinitions' ? 'resources' : key;
  const values = (removed as Record<string, unknown>)[removalKey];
  return Array.isArray(values) ? values.filter((id): id is string => typeof id === 'string') : [];
};

const findConflictModuleIds = (ordered: ContentModule[], validationIssues: ValidationIssue[]) => {
  const conflictIds = new Set<string>();
  const conflictKeys = new Map<string, string>();
  const errors = validationIssues.filter((validationIssue) => validationIssue.severity === 'error');

  for (const validationIssue of errors) {
    const missingId = typeof validationIssue.params?.id === 'string' ? String(validationIssue.params.id) : null;
    const culprit = missingId
      ? [...ordered].reverse().find((module) => removedIdsByModule(module).has(missingId)) ??
        [...ordered].reverse().find((module) => moduleChangesContentPath(module, validationIssue, missingId)) ??
        [...ordered].reverse().find((module) => moduleOwnsContentPath(module, validationIssue)) ??
        [...ordered].reverse().find((module) => moduleReferencesId(module, missingId))
      : [...ordered].reverse().find((module) => removedIdsForValidationCollection(module, validationIssue).length > 0) ??
        [...ordered].reverse().find((module) => moduleOwnsContentPath(module, validationIssue));
    if (culprit) {
      conflictIds.add(culprit.id);
      conflictKeys.set(culprit.id, missingId ?? contentPathKey(validationIssue) ?? removedIdsForValidationCollection(culprit, validationIssue)[0] ?? culprit.id);
    }
  }

  if (conflictIds.size === 0 && validationIssues.some((validationIssue) => validationIssue.severity === 'error')) {
    const lastUpdater = [...ordered].reverse().find((module) => module['data-updates'] || module.data);
    if (lastUpdater) {
      conflictIds.add(lastUpdater.id);
      conflictKeys.set(lastUpdater.id, lastUpdater.id);
    }
  }

  return { conflictIds, conflictKeys };
};

const resolveAndApplyModules = (
  bundle: ContentBundle,
  relevantModules: ContentModule[],
  validModules: ContentModule[],
  enabledModuleIds: string[] | undefined,
  initiallyDisabled: Set<string>,
): AppliedModules => {
  const conflictDisabled = new Set<string>();
  const conflictIssues: ValidationIssue[] = [];
  let latest: AppliedModules | null = null;

  for (let attempt = 0; attempt <= validModules.length; attempt += 1) {
    const availableModules = validModules.filter((module) => !conflictDisabled.has(module.id));
    const enabled = resolveEnabledSet(availableModules, enabledModuleIds);
    const { ordered, disabled, issues } = orderModules(availableModules, enabled);
    for (const id of initiallyDisabled) disabled.add(id);
    for (const id of conflictDisabled) disabled.add(id);

    const next = applyOrderedModules(bundle, relevantModules, ordered);
    const validationIssues = validateContentBundle(next).map((validationIssue) => ({
      ...validationIssue,
      path: `modules:${validationIssue.path}`,
    }));
    latest = { bundle: next, ordered, disabled, issues: [...conflictIssues, ...issues, ...validationIssues] };

    const { conflictIds, conflictKeys } = findConflictModuleIds(ordered, validationIssues);
    const hasNonCoreConflict = [...conflictIds].some((id) => {
      const module = ordered.find((candidate) => candidate.id === id);
      return module && !isProtectedCoreModule(module);
    });
    const newConflictIds = [...conflictIds].filter((id) => {
      const module = ordered.find((candidate) => candidate.id === id);
      return !conflictDisabled.has(id) && (!hasNonCoreConflict || !module || !isProtectedCoreModule(module));
    });
    if (validationIssues.every((validationIssue) => validationIssue.severity !== 'error') || newConflictIds.length === 0) {
      return latest;
    }

    for (const id of newConflictIds) {
      conflictDisabled.add(id);
      conflictIssues.push(issue('warning', `modules.${id}`, 'validation.moduleConflictDisabled', { id, key: conflictKeys.get(id) ?? id }));
    }
  }

  return latest ?? {
    bundle: { ...bundle, modules: relevantModules },
    ordered: [],
    disabled: new Set(initiallyDisabled),
    issues: [],
  };
};

export const applyModulesToBundle = (
  bundle: ContentBundle,
  modules: ContentModule[],
  enabledModuleIds?: string[],
  currentLocale = bundle.manifest.locales[0] ?? 'en',
): ModuleResolution => {
  const moduleShapePartition = partitionValidModuleShapes(modules);
  const relevantModules = moduleShapePartition.valid.filter((module) => module.universe === bundle.manifest.id);
  const moduleDataBundle = bundleWithModuleData(bundle, relevantModules);
  const moduleLocalizationBundle = (module: ContentModule) =>
    bundleWithModuleData(bundle, relevantModules.filter((candidate) => candidate.id !== module.id));
  const moduleValidationIssues = [
    ...moduleShapePartition.issues,
    ...validateModuleDataCollisions(bundle, relevantModules),
    ...relevantModules.flatMap(validateModuleDataUpdateDuplicates),
    ...relevantModules.flatMap((module) => validateModuleDataUpdateTargets(moduleDataBundle, module)),
    ...relevantModules.flatMap((module) => validateModuleSemanticChanges(moduleLocalizationBundle(module), module)),
    ...relevantModules.flatMap((module) => validateContentModule(moduleDataBundle, module, currentLocale, moduleLocalizationBundle(module))),
  ];
  const modulePackIssues = validateModulePacks(bundle.modulePacks ?? [], new Set(relevantModules.map((module) => module.id)));
  const invalidModuleIds = new Set(
    moduleValidationIssues
      .filter((validationIssue) => validationIssue.severity === 'error')
      .map((validationIssue) => validationIssue.path.match(/^modules\.([^.]+)/)?.[1])
      .filter((id): id is string => Boolean(id)),
  );
  const validModules = relevantModules.filter((module) => !invalidModuleIds.has(module.id));
  const dependencyExpandedEnabledModuleIds = [...resolveEnabledSet(relevantModules, enabledModuleIds)];
  const applied = resolveAndApplyModules(bundle, relevantModules, validModules, dependencyExpandedEnabledModuleIds, invalidModuleIds);
  const existingModuleIssues = bundle.moduleIssues ?? [];
  return {
    bundle: {
      ...applied.bundle,
      moduleIssues: [...existingModuleIssues, ...moduleValidationIssues, ...modulePackIssues, ...applied.issues],
    },
    enabledModuleIds: applied.ordered.map((module) => module.id),
    issues: [
      ...existingModuleIssues,
      ...moduleValidationIssues,
      ...modulePackIssues,
      ...applied.issues,
      ...[...applied.disabled].map((id) => issue('warning', `modules.${id}`, 'validation.moduleDisabled', { id })),
    ],
  };
};

export const flattenModulePackIds = (packs: ContentModulePack[] = []): string[] =>
  packs.flatMap((pack) => {
    if (!pack || typeof pack !== 'object' || Array.isArray(pack) || typeof pack.id !== 'string') return [];
    return [pack.id, ...(Array.isArray(pack.modules) ? pack.modules.filter((id): id is string => typeof id === 'string') : []), ...flattenModulePackIds(Array.isArray(pack.packs) ? pack.packs : [])];
  });
