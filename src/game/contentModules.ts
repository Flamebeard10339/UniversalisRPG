import type {
  ContentBundle,
  ContentModule,
  ContentModulePack,
  DialogueDefinition,
  GameAction,
  LocaleDictionary,
  ModuleDataSection,
  ModuleDataUpdates,
  ValidationIssue,
} from './types';
import {
  actionDescriptionKey,
  actionFailureKey,
  actionKillKey,
  actionSuccessKey,
  actionTitleKey,
  effectTitleKey,
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
import { validateContentBundle, validateContentShape, validateLocaleDictionary } from './validators';

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

const emptySectionBundle = (bundle: ContentBundle, section?: ModuleDataSection): Partial<ContentBundle> => ({
  manifest: {
    ...bundle.manifest,
    displayProfiles: section?.displayProfiles,
  },
  locations: section?.locations ?? [],
  edges: section?.edges ?? [],
  actions: section?.actions ?? [],
  skills: section?.skills ?? [],
  stats: section?.stats ?? [],
  items: section?.items ?? [],
  flags: section?.flags ?? [],
  resourceDefinitions: section?.resourceDefinitions ?? section?.resources ?? [],
  effects: section?.effects ?? [],
  interactionTypes: section?.interactionTypes ?? [],
  enemies: section?.enemies ?? [],
  dialogues: section?.dialogues ?? [],
  locales: bundle.locales,
});

const prefixIssuePath = (moduleId: string, section: string, validationIssue: ValidationIssue): ValidationIssue => ({
  ...validationIssue,
  path: `modules.${moduleId}.${section}.${validationIssue.path}`,
});

const validateModuleDataSection = (bundle: ContentBundle, module: ContentModule, section: 'data' | 'data-updates') => {
  const data = section === 'data' ? module.data : module['data-updates'];
  if (!data) return [];
  return validateContentShape(emptySectionBundle(bundle, data)).map((validationIssue) => prefixIssuePath(module.id, section, validationIssue));
};

const localizationKeysFromAction = (action: GameAction) => [
  actionTitleKey(action.id),
  actionDescriptionKey(action.id),
  actionSuccessKey(action.id),
  actionFailureKey(action.id),
  action.enemyId ? actionKillKey(action.id) : null,
  ...(action.results ?? []).flatMap((result) => result.kind === 'chat' ? [result.messageKey] : []),
];

const localizationKeysFromDialogues = (dialogues: DialogueDefinition[] = []) =>
  dialogues.flatMap((dialogue) => (Array.isArray(dialogue.nodes) ? dialogue.nodes : []).flatMap((node) => [
    node.textKey,
    node.narratorKey,
    ...((Array.isArray(node.options) ? node.options : []).map((option) => option.labelKey)),
  ]));

const hasId = (value: { id?: unknown }): value is { id: string } => typeof value.id === 'string' && value.id.trim().length > 0;

const localizationKeysFromSection = (section?: ModuleDataSection) => [
  ...(section?.locations ?? []).filter(hasId).flatMap((location) => [
    locationTitleKey(location.id),
    locationDescriptionKey(location.id),
    locationExhaustedKey(location.id),
  ]),
  ...(section?.actions ?? []).filter(hasId).flatMap(localizationKeysFromAction),
  ...(section?.skills ?? []).filter(hasId).flatMap((skill) => [skillTitleKey(skill.id), skillDescriptionKey(skill.id)]),
  ...(section?.stats ?? []).filter(hasId).flatMap((stat) => [statTitleKey(stat.id), statDescriptionKey(stat.id)]),
  ...(section?.items ?? []).filter(hasId).flatMap((item) => [itemTitleKey(item.id), itemDescriptionKey(item.id)]),
  ...(section?.interactionTypes ?? []).filter(hasId).flatMap((interactionType) => [
    interactionTitleKey(interactionType.id),
    interactionPlayerHitKey(interactionType.id),
    interactionPlayerMissKey(interactionType.id),
    interactionPlayerKillKey(interactionType.id),
    interactionEntityHitKey(interactionType.id),
    interactionEntityMissKey(interactionType.id),
    interactionEntityKillKey(interactionType.id),
  ]),
  ...(section?.resourceDefinitions ?? section?.resources ?? []).filter(hasId).flatMap((resource) => [
    resourceTitleKey(resource.id),
    ...(resource.onEmpty ?? []),
    ...(resource.onFull ?? []),
  ].flatMap((behavior) => typeof behavior === 'object' && behavior !== null && behavior.kind === 'chat' ? [behavior.messageKey] : [])),
  ...(section?.effects ?? []).filter(hasId).map((effect) => effectTitleKey(effect.id)),
  ...localizationKeysFromDialogues(section?.dialogues),
  ...(section?.displayProfiles ?? []).map((profile) => profile.titleKey),
].filter((key): key is string => Boolean(key));

export const collectModuleLocalizationKeys = (module: ContentModule) =>
  Array.from(new Set([
    ...localizationKeysFromSection(module.data),
    ...localizationKeysFromSection(module['data-updates']),
  ]));

const validateContentModule = (bundle: ContentBundle, module: ContentModule): ValidationIssue[] => [
  ...(!isModuleVersion(module.version)
    ? [issue('error', `modules.${module.id}.version`, 'validation.moduleVersionInvalid', { id: module.id })]
    : []),
  ...(!isGameVersion(module.game_version)
    ? [issue('error', `modules.${module.id}.game_version`, 'validation.moduleGameVersionInvalid', { id: module.id })]
    : []),
  ...validateModuleDataSection(bundle, module, 'data'),
  ...validateModuleDataSection(bundle, module, 'data-updates'),
  ...collectModuleLocalizationKeys(module).flatMap((key) =>
    module.locale?.[bundle.manifest.locales[0]]?.[key]
      ? []
      : [issue('warning', `modules.${module.id}.locale.${bundle.manifest.locales[0]}.${key}`, 'validation.missingLocalization')],
  ),
  ...Object.entries(module.locale ?? {}).flatMap(([locale, dictionary]) =>
    validateLocaleDictionary(dictionary).map((validationIssue) => ({
      ...validationIssue,
      path: `modules.${module.id}.locale.${locale}.${validationIssue.path}`,
    })),
  ),
];

const validateModulePacks = (packs: ContentModulePack[], moduleIds: Set<string>, seenPackIds = new Set<string>()): ValidationIssue[] =>
  packs.flatMap((pack) => {
    const issues: ValidationIssue[] = [];
    if (seenPackIds.has(pack.id)) {
      issues.push(issue('warning', `modulePacks.${pack.id}`, 'validation.modulePackDuplicate', { id: pack.id }));
    }
    seenPackIds.add(pack.id);
    for (const moduleId of pack.modules ?? []) {
      if (!moduleIds.has(moduleId)) {
        issues.push(issue('warning', `modulePacks.${pack.id}.modules.${moduleId}`, 'validation.modulePackUnknownModule', { id: moduleId, pack: pack.id }));
      }
    }
    return [...issues, ...validateModulePacks(pack.packs ?? [], moduleIds, seenPackIds)];
  });

const mergeById = <T extends { id: string }>(base: T[], additions: T[] = []) => {
  const merged = new Map(base.map((item) => [item.id, item]));
  for (const item of additions) merged.set(item.id, item);
  return [...merged.values()];
};

const removeById = <T extends { id: string }>(base: T[], removed: string[] = []) => {
  const removedIds = new Set(removed);
  return base.filter((item) => !removedIds.has(item.id));
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
  return {
    ...bundle,
    manifest: data.displayProfiles
      ? { ...bundle.manifest, displayProfiles: mergeById(bundle.manifest.displayProfiles ?? [], data.displayProfiles) }
      : bundle.manifest,
    locations: mergeById(bundle.locations, data.locations),
    edges: mergeById(bundle.edges, data.edges),
    actions: mergeById(bundle.actions, data.actions),
    skills: mergeById(bundle.skills, data.skills),
    stats: mergeById(bundle.stats, data.stats),
    items: mergeById(bundle.items ?? [], data.items),
    flags: mergeById(bundle.flags ?? [], data.flags),
    resourceDefinitions: mergeById(bundle.resourceDefinitions ?? [], data.resourceDefinitions ?? data.resources),
    effects: mergeById(bundle.effects ?? [], data.effects),
    interactionTypes: mergeById(bundle.interactionTypes ?? [], data.interactionTypes),
    enemies: mergeById(bundle.enemies ?? [], data.enemies),
    dialogues: mergeById(bundle.dialogues ?? [], data.dialogues),
  };
};

const applyDataUpdates = (bundle: ContentBundle, updates?: ModuleDataUpdates): ContentBundle => {
  if (!updates) return bundle;
  const removed = updates.remove ?? {};
  const withoutRemoved = {
    ...bundle,
    manifest: removed.displayProfiles
      ? { ...bundle.manifest, displayProfiles: removeById(bundle.manifest.displayProfiles ?? [], removed.displayProfiles) }
      : bundle.manifest,
    locations: removeById(bundle.locations, removed.locations),
    edges: removeById(bundle.edges, removed.edges),
    actions: removeById(bundle.actions, removed.actions),
    skills: removeById(bundle.skills, removed.skills),
    stats: removeById(bundle.stats, removed.stats),
    items: removeById(bundle.items ?? [], removed.items),
    flags: removeById(bundle.flags ?? [], removed.flags),
    resourceDefinitions: removeById(bundle.resourceDefinitions ?? [], removed.resources),
    effects: removeById(bundle.effects ?? [], removed.effects),
    interactionTypes: removeById(bundle.interactionTypes ?? [], removed.interactionTypes),
    enemies: removeById(bundle.enemies ?? [], removed.enemies),
    dialogues: removeById(bundle.dialogues ?? [], removed.dialogues),
    locales: mergeLocales(bundle.locales, updates.locale, removed.locales),
  };
  return applyDataSection(withoutRemoved, updates);
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
      if (dependency.prefix === '' || dependency.prefix === '+') {
        const dependencyModule = byId.get(dependency.id);
        if (!dependencyModule || !enabled.has(dependency.id)) {
          disabled.add(module.id);
          issues.push(issue('warning', `modules.${module.id}.dependencies`, 'validation.moduleMissingDependency', { id: dependency.id }));
          continue;
        }
        if (!dependencyVersionMatches(dependencyModule, dependency)) {
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
  return next;
};

const removedIdsByModule = (module: ContentModule) =>
  new Set(Object.values(module['data-updates']?.remove ?? {}).flatMap((ids) => ids ?? []));

const referencesIdValue = (value: unknown, id: string, key = ''): boolean => {
  if (typeof value === 'string') return key !== 'id' && value === id;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => referencesIdValue(item, id, key));
  return Object.entries(value).some(([childKey, childValue]) => referencesIdValue(childValue, id, childKey));
};

const moduleReferencesId = (module: ContentModule, id: string) =>
  referencesIdValue(module.data, id) || referencesIdValue({ ...module['data-updates'], remove: undefined }, id);

const findConflictModuleIds = (ordered: ContentModule[], validationIssues: ValidationIssue[]) => {
  const conflictIds = new Set<string>();
  const conflictKeys = new Map<string, string>();
  const errors = validationIssues.filter((validationIssue) => validationIssue.severity === 'error' && typeof validationIssue.params?.id === 'string');

  for (const validationIssue of errors) {
    const missingId = String(validationIssue.params?.id);
    for (const module of ordered) {
      if (removedIdsByModule(module).has(missingId) || moduleReferencesId(module, missingId)) {
        conflictIds.add(module.id);
        conflictKeys.set(module.id, missingId);
      }
    }
  }

  if (conflictIds.size === 0 && validationIssues.some((validationIssue) => validationIssue.severity === 'error')) {
    const lastUpdater = [...ordered].reverse().find((module) => module['data-updates']);
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
    const newConflictIds = [...conflictIds].filter((id) => !conflictDisabled.has(id));
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
): ModuleResolution => {
  const relevantModules = modules.filter((module) => module.universe === bundle.manifest.id);
  const moduleValidationIssues = relevantModules.flatMap((module) => validateContentModule(bundle, module));
  const modulePackIssues = validateModulePacks(bundle.modulePacks ?? [], new Set(relevantModules.map((module) => module.id)));
  const invalidModuleIds = new Set(
    moduleValidationIssues
      .filter((validationIssue) => validationIssue.severity === 'error')
      .map((validationIssue) => validationIssue.path.match(/^modules\.([^.]+)/)?.[1])
      .filter((id): id is string => Boolean(id)),
  );
  const validModules = relevantModules.filter((module) => !invalidModuleIds.has(module.id));
  const applied = resolveAndApplyModules(bundle, relevantModules, validModules, enabledModuleIds, invalidModuleIds);
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
  packs.flatMap((pack) => [pack.id, ...(pack.modules ?? []), ...flattenModulePackIds(pack.packs)]);
