import { ActionResult } from '../grammar/actionResult';
import { Action } from '../grammar/action';
import { Dialogue } from './dialogue';
import { Entity, entitySchema } from './entity';
import { Flag, flagSchema } from './flag';
import { Item, itemSchema } from './item';
import { Location, locationSchema, recursivelyResolveRelativeCoordinates } from './location';
import { mergeSection } from './merge';
import { ModuleSection } from './module';
import { ModuleSource, ParsedModule, moduleOrderProblems, orderModules, parseModuleSource, parseUniverse } from './universe';
import { DslError, Span } from '../grammar/parser';
import { Namespace } from './namespace';
import { Recipe, recipeSchema } from './recipe';
import { registryCapabilities, validateDialogueReferences, validateRecipeReferences, validateTestReferences } from './references';
import { ReferenceKind, Visit, visitAction, visitSection } from './referenceSites';
import { Removal } from './removal';
import { resolveModule } from './resolve';
import { Resource, resourceSchema } from './resource';
import { ParsedSave } from './saveSection';
import { Authored, hydrateSection } from '../grammar/section';
import { Skill, skillSchema } from './skill';
import { Stat, statSchema } from './stat';
import { Test } from './test';
import { validateTuningVariable } from './tuningVariables';
import { humanize } from '../grammar/values';
import { Variable, variableSchema } from './variable';

export interface Registry {
  entities: Map<string, Entity>;
  locations: Map<string, Location>;
  items: Map<string, Item>;
  stats: Map<string, Stat>;
  skills: Map<string, Skill>;
  recipes: Map<string, Recipe>;
  recipeActions: Map<string, Action>;
  resources: Map<string, Resource>;
  dialogues: Map<string, Dialogue>;
  dialoguesByOwner: Map<string, Dialogue>;
  tests: Map<string, Test>;
  flags: Map<string, Flag>;
  variables: Map<string, Variable>;
  saves: Map<string, ParsedSave>;
  namespace: Namespace;
}

export type ModuleLoadStage = 'parse' | 'order' | 'resolve' | 'merge' | 'build' | 'validate';

export interface ModuleDiagnostic {
  sourceName: string;
  moduleId: string;
  stage: ModuleLoadStage;
  message: string;
  span?: Span;
  line?: number;
  column?: number;
}

export interface ModuleStatus {
  sourceName: string;
  moduleId: string;
  pack?: string;
  enabled: boolean;
  loaded: boolean;
}

export interface UniverseLoadResult {
  registry: Registry;
  diagnostics: ModuleDiagnostic[];
  modules: ModuleStatus[];
  loadedModules: string[];
  disabledModules: string[];
}

// Compiled to an Action so a craft runs through the same resolve() machinery
// as any other single-attempt fight.
function recipeAction(recipe: Recipe): Action {
  const takes: ActionResult[] = recipe.in.map((q) => ({ kind: 'take', item: q.item, amount: q.amount }));
  const gives: ActionResult[] = recipe.out.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
  const results: ActionResult[] = [...takes, ...gives];
  if (recipe.skill) results.push({ kind: 'xp', skill: recipe.skill.skill, amount: recipe.skill.amount });
  if (recipe.say) results.push({ kind: 'say', text: recipe.say });

  const time = recipe.time ?? 0;
  const action: Action = {
    label: `Craft ${humanize(recipe.id)}`,
    results,
    time,
    speed: recipe.speed,
    accuracy: recipe.accuracy,
    evasion: recipe.evasion,
    health: 1,
    repeating: time > 0,
  };

  if (recipe.accuracy) {
    // The fail path consumes the SAME inputs as success, so inputLimit still
    // bounds a repeating burn-capable craft.
    action.escapeAfter = 1;
    const burnt: ActionResult[] = recipe.burnt.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
    action.onEscape = [...takes, ...burnt];
  }

  return action;
}

function emptyRegistry(): Registry {
  return {
    entities: new Map(),
    locations: new Map(),
    items: new Map(),
    stats: new Map(),
    skills: new Map(),
    recipes: new Map(),
    recipeActions: new Map(),
    resources: new Map(),
    dialogues: new Map(),
    dialoguesByOwner: new Map(),
    tests: new Map(),
    flags: new Map(),
    variables: new Map(),
    saves: new Map(),
    namespace: new Namespace(),
  };
}

function lineColumn(source: string, span: Span | undefined): { line: number; column: number } | undefined {
  if (!span) return undefined;
  let line = 1;
  let column = 1;
  for (let i = 0; i < span.start; i++) {
    if (i === 0 && source[i] === '\uFEFF') continue;
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function diagnostic(source: ModuleSource, moduleId: string, stage: ModuleLoadStage, error: DslError): ModuleDiagnostic {
  const position = lineColumn(source.text, error.span);
  return { sourceName: source.name, moduleId, stage, message: error.message, span: error.span, ...(position ?? {}) };
}

const sourceEnabled = (source: ModuleSource): boolean => source.enabled !== false;

function moduleStatus(source: ModuleSource, moduleId: string, pack: string | undefined, loaded: boolean): ModuleStatus {
  return { sourceName: source.name, moduleId, pack, enabled: sourceEnabled(source), loaded };
}

function parsedModuleStatus(module: ParsedModule, loaded: boolean): ModuleStatus {
  return moduleStatus(module.source, module.info.id, module.info.pack, loaded);
}

function summarizeDisabled(statuses: readonly ModuleStatus[]): string[] {
  return statuses.filter((module) => !module.loaded).map((module) => module.moduleId);
}

export function formatModuleDiagnostic(value: ModuleDiagnostic): string {
  const at = value.line === undefined ? value.sourceName : `${value.sourceName}:${value.line}:${value.column}`;
  return `${at} [${value.moduleId}] ${value.stage}: ${value.message}`;
}

function applySection(registry: Registry, section: ModuleSection): void {
  switch (section.kind) {
    case 'entity': {
      const entity = hydrateSection(section.value as Authored<Entity>, entitySchema);
      for (const action of entity.actions) {
        // Without a pool to drain, a retaliation falls through to the fight's
        // own hit counter and wears down the target instead of the player.
        if (action.retaliates && !action.target) {
          throw new DslError(`# entity ${entity.id}: retaliating action ${JSON.stringify(action.label)} requires a target: pool`);
        }
      }
      registry.entities.set(entity.id, entity);
      break;
    }
    case 'location': {
      const location = hydrateSection(section.value as Authored<Location>, locationSchema);
      registry.locations.set(location.id, location);
      break;
    }
    case 'item': {
      const item = hydrateSection(section.value as Authored<Item>, itemSchema);
      registry.items.set(item.id, item);
      break;
    }
    case 'stat': {
      const stat = hydrateSection(section.value as Authored<Stat>, statSchema);
      registry.stats.set(stat.id, stat);
      break;
    }
    case 'skill': {
      const skill = hydrateSection(section.value as Authored<Skill>, skillSchema);
      registry.skills.set(skill.id, skill);
      break;
    }
    case 'recipe': {
      const recipe = hydrateSection(section.value as Authored<Recipe>, recipeSchema);
      registry.recipes.set(recipe.id, recipe);
      registry.recipeActions.set(recipe.id, recipeAction(recipe));
      break;
    }
    case 'resource': {
      const resource = hydrateSection(section.value as Authored<Resource>, resourceSchema);
      if (!resource.max) throw new DslError(`# resource ${resource.id} requires a max: stat`);
      registry.resources.set(resource.id, resource);
      break;
    }
    case 'dialogue': {
      const dialogue = section.value as Dialogue;
      registry.dialogues.set(dialogue.id, dialogue);
      if (dialogue.owner) registry.dialoguesByOwner.set(dialogue.owner, dialogue);
      break;
    }
    case 'test': {
      const test = section.value as Test;
      registry.tests.set(test.id, test);
      break;
    }
    case 'flag': {
      const flag = hydrateSection(section.value as Authored<Flag>, flagSchema);
      registry.flags.set(flag.id, flag);
      break;
    }
    case 'variable': {
      const variable = hydrateSection(section.value as Authored<Variable>, variableSchema);
      registry.variables.set(variable.id, variable);
      break;
    }
    case 'save': {
      const { id, saved } = section.value as { id: string; saved: ParsedSave };
      registry.saves.set(id, saved);
      break;
    }
  }
}

interface OwnedSection {
  kind: string;
  value: object;
  module: ParsedModule;
}

interface BuildFailure {
  module: ParsedModule;
  stage: ModuleLoadStage;
  error: DslError;
}

class DanglingReference extends Error {}

const ownerKey = (kind: string, id: string): string => `${kind}\0${id}`;

function sectionOwner(owners: ReadonlyMap<string, ParsedModule>, kind: string, id: string): ParsedModule | undefined {
  return owners.get(ownerKey(kind, id));
}

function locationIdFromMessage(message: string): string | undefined {
  return /^location '([^']+)'/.exec(message)?.[1] ?? /^location coordinates form a cycle at '([^']+)'/.exec(message)?.[1];
}

function namesDanglingRoot(kind: ReferenceKind, id: string, danglingRoots: ReadonlySet<string>): boolean {
  const segments = id.split('.');
  if (segments[0] === kind && segments.length > 1) segments.shift();
  return segments.length > 1 && danglingRoots.has(segments[0]);
}

function referencePruned(kind: ReferenceKind, id: string, pruned: ReadonlySet<string>): boolean {
  return pruned.has(ownerKey(kind, id));
}

function danglingVisit(danglingRoots: ReadonlySet<string>, pruned: ReadonlySet<string>): Visit {
  return (kind, id) => {
    if (namesDanglingRoot(kind, id, danglingRoots) || referencePruned(kind, id, pruned)) throw new DanglingReference();
    return id;
  };
}

function referencesLoaded(check: () => void): boolean {
  try {
    check();
    return true;
  } catch (error) {
    if (error instanceof DanglingReference) return false;
    throw error;
  }
}

function pruneActions(actions: Action[], where: string, visit: Visit): Action[] {
  return actions.filter((action) => referencesLoaded(() => visitAction(action, `${where} action ${JSON.stringify(action.label)}`, visit)));
}

// The registry and the namespace must describe the same surviving universe:
// drop one without the other and a save is pruned against content that is
// present, or a reference resolves to content that is gone.
function dropContent(registry: Registry, kind: string, id: string, pruned: Set<string>, maps: readonly { delete(id: string): boolean }[]): void {
  for (const map of maps) map.delete(id);
  registry.namespace.undeclare(kind, id);
  pruned.add(ownerKey(kind, id));
}

function pruneRegistryDanglingReferences(registry: Registry, danglingRoots: ReadonlySet<string>): void {
  const pruned = new Set<string>();
  for (;;) {
    let changed = false;
    const visit = danglingVisit(danglingRoots, pruned);

    for (const [id, entity] of registry.entities) {
      const stats = Object.fromEntries(Object.entries(entity.stats).filter(([statId]) => registry.stats.has(statId)));
      const actions = pruneActions(entity.actions, `# entity ${id}`, visit);
      if (Object.keys(stats).length !== Object.keys(entity.stats).length || actions.length !== entity.actions.length) {
        registry.entities.set(id, { ...entity, stats, actions });
        changed = true;
      }
    }

    for (const [id, item] of registry.items) {
      const tags = item.tags.filter((tag) => tag.kind !== 'stat-bonus' || registry.stats.has(tag.statId));
      const actions = pruneActions(item.actions, `# item ${id}`, visit);
      if (tags.length !== item.tags.length || actions.length !== item.actions.length) {
        registry.items.set(id, { ...item, tags, actions });
        changed = true;
      }
    }

    for (const [id, location] of registry.locations) {
      if (location.relative && (namesDanglingRoot('location', location.relative.of, danglingRoots) || referencePruned('location', location.relative.of, pruned))) {
        dropContent(registry, 'location', id, pruned, [registry.locations]);
        changed = true;
        continue;
      }
      const entities = location.entities.filter((entityId) => !namesDanglingRoot('entity', entityId, danglingRoots) && !referencePruned('entity', entityId, pruned));
      const adjacent = location.adjacent.filter((edge) =>
        !namesDanglingRoot('location', edge.target, danglingRoots) &&
        !referencePruned('location', edge.target, pruned) &&
        referencesLoaded(() => visitSection('location', { ...location, entities: [], adjacent: [{ ...edge }], relative: undefined, actions: [] }, `# location ${id}`, visit)),
      );
      const actions = pruneActions(location.actions, `# location ${id}`, visit);
      if (entities.length !== location.entities.length || adjacent.length !== location.adjacent.length || actions.length !== location.actions.length) {
        registry.locations.set(id, { ...location, entities, adjacent, actions });
        changed = true;
      }
    }

    for (const [id, recipe] of registry.recipes) {
      if (referencesLoaded(() => visitSection('recipe', { ...recipe }, `# recipe ${id}`, visit))) continue;
      dropContent(registry, 'recipe', id, pruned, [registry.recipes, registry.recipeActions]);
      changed = true;
    }

    for (const [id, resource] of registry.resources) {
      if (referencesLoaded(() => visitSection('resource', { ...resource }, `# resource ${id}`, visit))) continue;
      dropContent(registry, 'resource', id, pruned, [registry.resources]);
      changed = true;
    }

    for (const [id, dialogue] of registry.dialogues) {
      if (referencesLoaded(() => visitSection('dialogue', { ...dialogue, nodes: dialogue.nodes.map((node) => ({ ...node })) }, `# dialogue ${id}`, visit))) continue;
      dropContent(registry, 'dialogue', id, pruned, [registry.dialogues]);
      changed = true;
    }

    for (const [id, test] of registry.tests) {
      if (referencesLoaded(() => visitSection('test', { ...test }, `# test ${id}`, visit))) continue;
      dropContent(registry, 'test', id, pruned, [registry.tests]);
      changed = true;
    }

    if (!changed) {
      registry.dialoguesByOwner.clear();
      for (const dialogue of registry.dialogues.values()) if (dialogue.owner) registry.dialoguesByOwner.set(dialogue.owner, dialogue);
      return;
    }
  }
}

function validateBuiltRegistry(registry: Registry, owners: ReadonlyMap<string, ParsedModule>, danglingRoots: ReadonlySet<string>): BuildFailure | null {
  pruneRegistryDanglingReferences(registry, danglingRoots);

  try {
    recursivelyResolveRelativeCoordinates(registry.locations);
  } catch (error) {
    if (!(error instanceof DslError)) throw error;
    const id = locationIdFromMessage(error.message);
    const module = id ? sectionOwner(owners, 'location', id) : undefined;
    if (!module) throw error;
    return { module, stage: 'validate', error };
  }

  for (const variable of registry.variables.values()) {
    try {
      validateTuningVariable(variable);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return { module: sectionOwner(owners, 'variable', variable.id)!, stage: 'validate', error };
    }
  }

  const capabilities = registryCapabilities(registry);
  for (const recipe of registry.recipes.values()) {
    try {
      validateRecipeReferences(recipe, capabilities);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return { module: sectionOwner(owners, 'recipe', recipe.id)!, stage: 'validate', error };
    }
  }
  for (const dialogue of registry.dialogues.values()) {
    try {
      validateDialogueReferences(dialogue);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return { module: sectionOwner(owners, 'dialogue', dialogue.id)!, stage: 'validate', error };
    }
  }
  for (const test of registry.tests.values()) {
    try {
      validateTestReferences(test, registry);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return { module: sectionOwner(owners, 'test', test.id)!, stage: 'validate', error };
    }
  }
  return null;
}

function compileModules(modules: readonly ParsedModule[]): { registry: Registry } | { failure: BuildFailure } {
  const registry = emptyRegistry();

  // Two phases, because merging must happen on the authored form: a hydrated
  // object has every field filled in with defaults, so overlaying one would
  // silently reset everything the patch did not mention.
  const merged = new Map<string, Map<string, OwnedSection>>();
  const owners = new Map<string, ParsedModule>();
  const namespace = registry.namespace;
  const loaded = new Set(modules.map((module) => module.info.id));
  const danglingRoots = new Set<string>();
  for (const module of modules) {
    for (const dependency of module.info.dependencies) {
      if ((dependency.prefix === 'optional' || dependency.prefix === 'recommended') && !loaded.has(dependency.module)) danglingRoots.add(dependency.module);
    }
  }
  namespace.declareModules(loaded);
  for (const module of modules) {
    // Per module, before merging: a shortened reference resolves against its own
    // module and that module's dependencies, and once sections are merged there
    // is no longer a module to resolve it against.
    try {
      resolveModule(module, namespace, loaded);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return { failure: { module, stage: 'resolve', error } };
    }
    try {
      for (const section of module.sections) {
        // Removal is applied where it stands, so a later module can name the id
        // again and get a fresh one rather than a hole.
        if (section.kind === 'remove') {
          const { kind, target, id } = section.value as Removal;
          if (!merged.get(kind)?.delete(target)) throw new DslError(`# remove ${id} names nothing that is loaded`);
          owners.delete(ownerKey(kind, target));
          continue;
        }
        const byId = merged.get(section.kind) ?? new Map<string, OwnedSection>();
        const id = (section.value as { id: string }).id;
        const existing = byId.get(id);
        byId.set(id, { kind: section.kind, value: mergeSection(section.kind, existing?.value, section.value), module });
        owners.set(ownerKey(section.kind, id), module);
        merged.set(section.kind, byId);
      }
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return { failure: { module, stage: 'merge', error } };
    }
  }
  for (const [kind, byId] of merged) {
    for (const section of byId.values()) {
      try {
        applySection(registry, { kind, value: section.value });
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return { failure: { module: section.module, stage: 'build', error } };
      }
    }
  }
  const validationFailure = validateBuiltRegistry(registry, owners, danglingRoots);
  if (validationFailure) return { failure: validationFailure };
  return { registry };
}

export function loadUniverse(sources: readonly ModuleSource[]): Registry {
  const compiled = compileModules(parseUniverse(sources.filter(sourceEnabled)));
  if ('failure' in compiled) throw compiled.failure.error;
  return compiled.registry;
}

function parseActiveSources(
  sources: readonly ModuleSource[],
  diagnostics: ModuleDiagnostic[],
  disabled: Set<ModuleSource>,
  statuses: Map<ModuleSource, ModuleStatus>,
): ParsedModule[] | null {
  const modules: ParsedModule[] = [];
  let failed = false;
  for (const source of sources) {
    try {
      modules.push(parseModuleSource(source));
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      diagnostics.push(diagnostic(source, source.name, 'parse', error));
      disabled.add(source);
      statuses.set(source, moduleStatus(source, source.name, undefined, false));
      failed = true;
    }
  }
  return failed ? null : modules;
}

export function loadUniverseWithDiagnostics(sources: readonly ModuleSource[]): UniverseLoadResult {
  const diagnostics: ModuleDiagnostic[] = [];
  const disabled = new Set<ModuleSource>();
  const statuses = new Map<ModuleSource, ModuleStatus>();

  for (const source of sources.filter((source) => !sourceEnabled(source))) {
    try {
      statuses.set(source, parsedModuleStatus(parseModuleSource(source), false));
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      diagnostics.push(diagnostic(source, source.name, 'parse', error));
      statuses.set(source, moduleStatus(source, source.name, undefined, false));
    }
    disabled.add(source);
  }

  let active = sources.filter(sourceEnabled);

  for (;;) {
    const modules = parseActiveSources(active, diagnostics, disabled, statuses);
    if (modules === null) {
      active = active.filter((source) => !disabled.has(source));
      continue;
    }

    if (modules.length === 0) {
      const modules = sources.map((source) => statuses.get(source) ?? moduleStatus(source, source.name, undefined, false));
      return { registry: emptyRegistry(), diagnostics, modules, loadedModules: [], disabledModules: summarizeDisabled(modules) };
    }

    const orderProblems = moduleOrderProblems(modules);
    if (orderProblems.length > 0) {
      for (const problem of orderProblems) {
        diagnostics.push(diagnostic(problem.module.source, problem.module.info.id, 'order', problem.error));
        disabled.add(problem.module.source);
        statuses.set(problem.module.source, parsedModuleStatus(problem.module, false));
      }
      active = active.filter((source) => !disabled.has(source));
      continue;
    }

    const ordered = orderModules(modules);
    const compiled = compileModules(ordered);
    if (!('failure' in compiled)) {
      for (const module of ordered) statuses.set(module.source, parsedModuleStatus(module, true));
      const modules = sources.map((source) => statuses.get(source) ?? moduleStatus(source, source.name, undefined, false));
      return {
        registry: compiled.registry,
        diagnostics,
        modules,
        loadedModules: ordered.map((module) => module.info.id),
        disabledModules: summarizeDisabled(modules),
      };
    }

    diagnostics.push(diagnostic(compiled.failure.module.source, compiled.failure.module.info.id, compiled.failure.stage, compiled.failure.error));
    disabled.add(compiled.failure.module.source);
    statuses.set(compiled.failure.module.source, parsedModuleStatus(compiled.failure.module, false));
    active = active.filter((source) => !disabled.has(source));
  }
}

export const loadModule = (source: string): Registry => loadUniverse([{ name: 'anonymous', text: source }]);
