import { ActionResult, nestedResults } from '../grammar/actionResult';
import { point } from '../grammar/range';
import { Action, actionProblem, actionTableProblem } from '../grammar/action';
import { Dialogue } from './dialogue';
import { DropTable } from './dropTable';
import { Entity, entitySchema } from './entity';
import { EntityType, entityTypeSchema } from './entityType';
import { Flag, flagSchema } from './flag';
import { Item, itemSchema } from './item';
import { Location, locationSchema, recursivelyResolveRelativeCoordinates } from './location';
import { mergeSection } from './merge';
import { ModuleSection } from './module';
import { ModuleSource, ParsedModule, moduleOrderProblems, orderModules, parseModuleSource, parseUniverse } from './universe';
import { DslError, Span } from '../grammar/parser';
import { Namespace } from './namespace';
import { Recipe, recipeSchema } from './recipe';
import { registryCapabilities, validateDialogueReferences, validateRecipeReferences, validateSectionReferences, validateTestReferences } from './references';
import { ReferenceKind, Visit, visitAction, visitSection } from './referenceSites';
import { Removal } from './removal';
import { RESOLUTION_PASSES } from './resolve';
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
  entityTypes: Map<string, EntityType>;
  locations: Map<string, Location>;
  items: Map<string, Item>;
  stats: Map<string, Stat>;
  skills: Map<string, Skill>;
  recipes: Map<string, Recipe>;
  recipeActions: Map<string, Action>;
  resources: Map<string, Resource>;
  dropTables: Map<string, DropTable>;
  dialogues: Map<string, Dialogue>;
  dialoguesByOwner: Map<string, Dialogue>;
  tests: Map<string, Test>;
  flags: Map<string, Flag>;
  variables: Map<string, Variable>;
  saves: Map<string, ParsedSave>;
  namespace: Namespace;
}

// Each DSL section kind beside the registry map that holds it. `recipeActions`
// and `dialoguesByOwner` are indexes over maps already listed, and `flag`,
// `variable` and `save` carry no references to anything, so the pairs here are
// every section a reference can be authored inside.
export const CONTENT_SECTION_MAPS: readonly (readonly [string, keyof Registry])[] = [
  ['entity', 'entities'],
  ['entitytype', 'entityTypes'],
  ['location', 'locations'],
  ['item', 'items'],
  ['stat', 'stats'],
  ['skill', 'skills'],
  ['recipe', 'recipes'],
  ['resource', 'resources'],
  ['droptable', 'dropTables'],
  ['dialogue', 'dialogues'],
  ['test', 'tests'],
];

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
  // The modules that built this registry, in the order they were applied. The
  // load already parsed them; handing them back is what stops every caller that
  // needs an id, a version or a section list from parsing the same sources again.
  parsed: ParsedModule[];
  loadedModules: string[];
  disabledModules: string[];
}

// Compiled to an Action so a craft runs through the same resolve() machinery
// as any other single-attempt fight.
function recipeAction(recipe: Recipe): Action {
  const takes: ActionResult[] = recipe.in.map((q) => ({ kind: 'take', item: q.item, amount: q.amount }));
  const gives: ActionResult[] = recipe.out.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
  const results: ActionResult[] = [...takes, ...gives];
  if (recipe.skill) results.push({ kind: 'xp', skill: recipe.skill.skill, amount: point(recipe.skill.amount) });
  if (recipe.say) results.push({ kind: 'say', text: recipe.say });

  // A craft with a cadence keeps going; one without is over the moment it is
  // used, which is `instant` in the vocabulary this compiles into. Whatever was
  // authored is carried through unexamined, so the same table that judges an
  // authored action judges this one rather than a recipe-shaped copy of it.
  const cadence = recipe.rate !== undefined ? { rate: recipe.rate } : recipe.time !== undefined ? { time: recipe.time } : {};
  const action: Action = {
    label: `Craft ${humanize(recipe.id)}`,
    kind: 'rate' in cadence || 'time' in cadence ? 'continuous' : 'instant',
    results,
    ...cadence,
    accuracy: recipe.accuracy,
    evasion: recipe.evasion,
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
    entityTypes: new Map(),
    locations: new Map(),
    items: new Map(),
    stats: new Map(),
    skills: new Map(),
    recipes: new Map(),
    recipeActions: new Map(),
    resources: new Map(),
    dropTables: new Map(),
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
      let retaliation: Action | undefined;
      for (const action of entity.actions) {
        // Without a pool to drain, a retaliation falls through to the fight's
        // own hit counter and wears down the target instead of the player.
        if (action.retaliates && !action.target) {
          throw new DslError(`# entity ${entity.id}: retaliating action ${JSON.stringify(action.label)} requires a target: pool`);
        }
        if (action.retaliates) {
          if (retaliation) {
            throw new DslError(`# entity ${entity.id}: retaliating action ${JSON.stringify(action.label)} conflicts with ${JSON.stringify(retaliation.label)}; only one retaliates action is supported`);
          }
          retaliation = action;
        }
      }
      registry.entities.set(entity.id, entity);
      break;
    }
    case 'entitytype': {
      const entityType = hydrateSection(section.value as Authored<EntityType>, entityTypeSchema);
      registry.entityTypes.set(entityType.id, entityType);
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
      // `burnt:` is what a failed attempt yields, and only `accuracy:` gives an
      // attempt a way to fail; without it the outputs are silently unreachable.
      if (recipe.burnt.length > 0 && !recipe.accuracy) {
        throw new DslError(`# recipe ${recipe.id}: burnt: needs an accuracy: stat, or nothing can ever burn`);
      }
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
    case 'droptable': {
      const table = section.value as DropTable;
      registry.dropTables.set(table.id, table);
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

// What an entity naming a `type:` is merged onto, in place of the nothing an
// entity is normally created from. Everything an entity can say about an action
// — override it, add one, remove one — then goes through the single merge rule
// instead of a second one bolted on after the fact.
//
// Whether the section creates the entity or edits one that is already there is
// not declared — it follows from what was loaded — so the template has to slide
// underneath at whichever of the two first names a `type:`. What the entity
// already held is treated as overrides of the template it just acquired, which
// is the same relationship a first declaration's own blocks have to it.
function entityTypeBase(merged: Map<string, Map<string, OwnedSection>>, section: ModuleSection, held: object | undefined): object | undefined {
  if (section.kind !== 'entity') return held;
  const entity = section.value as Authored<Entity>;
  const already = (held as Authored<Entity> | undefined)?.type;
  if (entity.type === undefined || entity.type === already) return held;
  if (already !== undefined) throw new DslError(`# entity ${entity.id} is already type: ${already}, and an entity inherits one template`);

  // A `type:` naming nothing is left for the reference check that owns that
  // message for every kind; inheriting nothing is what an absent template means.
  const template = merged.get('entitytype')?.get(entity.type)?.value as Authored<EntityType> | undefined;
  if (!template) return held;
  // The clone is load-bearing: reference resolution rewrote ids in place before
  // this ran, and a template object reachable from two entities would be walked
  // once per entity and bound to whichever went last.
  const inherited = { id: entity.id, actions: structuredClone(template.actions ?? []) };
  return held === undefined ? inherited : mergeSection('entity', inherited, held);
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

// The grammar refuses an unauthorable action, but an action can also be
// ASSEMBLED — merged onto a template, patched across modules, or compiled from a
// recipe — and none of those went through the grammar. Same rule, applied where
// the section that owns the action can name itself.
function validateActionTable(where: string, actions: readonly Action[] | undefined): void {
  for (const action of actions ?? []) {
    const problem = actionTableProblem(action);
    if (problem) throw new DslError(`${where} ${actionProblem(action.label, problem)}`);
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

    for (const [id, entityType] of registry.entityTypes) {
      const actions = pruneActions(entityType.actions, `# entitytype ${id}`, visit);
      if (actions.length !== entityType.actions.length) {
        registry.entityTypes.set(id, { ...entityType, actions });
        changed = true;
      }
    }

    for (const [id, entity] of registry.entities) {
      const stats = Object.fromEntries(Object.entries(entity.stats).filter(([statId]) => referencesLoaded(() => visit('stat', statId, `# entity ${id} stats:`))));
      const actions = pruneActions(entity.actions, `# entity ${id}`, visit);
      // The template's actions are already copied in, so a type: whose template
      // went with a missing dependency has nothing left to say.
      const type = entity.type !== undefined && referencesLoaded(() => visit('entitytype', entity.type!, `# entity ${id} type:`)) ? entity.type : undefined;
      if (Object.keys(stats).length !== Object.keys(entity.stats).length || actions.length !== entity.actions.length || type !== entity.type) {
        registry.entities.set(id, { ...entity, stats, actions, type });
        changed = true;
      }
    }

    for (const [id, item] of registry.items) {
      const tags = item.tags.filter((tag) => tag.kind !== 'stat-bonus' || referencesLoaded(() => visit('stat', tag.statId, `# item ${id} tag`)));
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

    for (const [id, table] of registry.dropTables) {
      if (referencesLoaded(() => visitSection('droptable', { ...table }, `# droptable ${id}`, visit))) continue;
      dropContent(registry, 'droptable', id, pruned, [registry.dropTables]);
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

// A table that reaches itself would recurse forever at the first roll. Checked
// once over the built registry, where every table that will exist is present and
// every name has already resolved.
function dropTableCycle(registry: Registry): string[] | null {
  const rolls = new Map<string, string[]>();
  const collect = (results: readonly ActionResult[], into: string[]): void => {
    for (const result of results) {
      if (result.kind === 'roll') into.push(result.table);
      for (const nested of nestedResults(result)) collect(nested, into);
    }
  };
  for (const [id, table] of registry.dropTables) {
    const targets: string[] = [];
    collect(table.results, targets);
    rolls.set(id, targets);
  }

  const done = new Set<string>();
  const path: string[] = [];
  const onPath = new Set<string>();
  const walk = (id: string): string[] | null => {
    if (onPath.has(id)) return [...path.slice(path.indexOf(id)), id];
    if (done.has(id)) return null;
    path.push(id);
    onPath.add(id);
    for (const target of rolls.get(id) ?? []) {
      const cycle = walk(target);
      if (cycle) return cycle;
    }
    path.pop();
    onPath.delete(id);
    done.add(id);
    return null;
  };
  for (const id of rolls.keys()) {
    const cycle = walk(id);
    if (cycle) return cycle;
  }
  return null;
}

// Two `starting` locations used to resolve by source order, which is a coin
// toss an author cannot see. Zero is not checked here — a module set is allowed
// to hold locations without holding the one a new game begins in, and the
// session says so when a game is actually started.
function startingLocationFailure(registry: Registry, owners: ReadonlyMap<string, ParsedModule>): BuildFailure | null {
  const starting = [...registry.locations.values()].filter((location) => location.starting);
  if (starting.length < 2) return null;
  const module = sectionOwner(owners, 'location', starting[1].id);
  const error = new DslError(`# location ${starting[1].id} is marked starting, and so is ${starting[0].id}; a new game begins in exactly one place`);
  return module ? { module, stage: 'validate', error } : null;
}

function validateBuiltRegistry(registry: Registry, owners: ReadonlyMap<string, ParsedModule>, danglingRoots: ReadonlySet<string>): BuildFailure | null {
  pruneRegistryDanglingReferences(registry, danglingRoots);

  const starting = startingLocationFailure(registry, owners);
  if (starting) return starting;

  const cycle = dropTableCycle(registry);
  if (cycle) {
    const module = sectionOwner(owners, 'droptable', cycle[0]);
    const error = new DslError(`# droptable ${cycle[0]} rolls itself: ${cycle.join(' -> ')}`);
    if (!module) throw error;
    return { module, stage: 'validate', error };
  }

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

  for (const [kind, map] of CONTENT_SECTION_MAPS) {
    for (const [id, value] of registry[map] as ReadonlyMap<string, object>) {
      try {
        validateActionTable(`# ${kind} ${id}`, (value as { actions?: Action[] }).actions);
        validateSectionReferences(kind, id, value, registry);
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return { module: sectionOwner(owners, kind, id)!, stage: 'validate', error };
      }
    }
  }

  for (const [id, action] of registry.recipeActions) {
    try {
      validateActionTable(`# recipe ${id}`, [action]);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return { module: sectionOwner(owners, 'recipe', id)!, stage: 'validate', error };
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
  // Before merging: a shortened reference resolves against its own module and
  // that module's dependencies, and once sections are merged there is no longer
  // a module to resolve it against.
  for (const pass of RESOLUTION_PASSES) {
    for (const module of modules) {
      try {
        pass(module, namespace, loaded);
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return { failure: { module, stage: 'resolve', error } };
      }
    }
  }
  const mergePass = (owns: (kind: string) => boolean): BuildFailure | null => {
    for (const module of modules) {
      try {
        for (const section of module.sections) {
          // Removal is applied where it stands, so a later module can name the id
          // again and get a fresh one rather than a hole.
          if (section.kind === 'remove') {
            const { kind, target, id } = section.value as Removal;
            if (!owns(kind)) continue;
            if (!merged.get(kind)?.delete(target)) throw new DslError(`# remove ${id} names nothing that is loaded`);
            owners.delete(ownerKey(kind, target));
            // Undeclared here rather than during resolution, so that what a name
            // resolves to stays independent of load order while the namespace and
            // the surviving universe still agree — which is what lets the
            // post-build reference check see a member go with its owner.
            namespace.undeclare(kind, target);
            continue;
          }
          if (!owns(section.kind)) continue;
          const byId = merged.get(section.kind) ?? new Map<string, OwnedSection>();
          const id = (section.value as { id: string }).id;
          const base = entityTypeBase(merged, section, byId.get(id)?.value);
          byId.set(id, { kind: section.kind, value: mergeSection(section.kind, base, section.value), module });
          owners.set(ownerKey(section.kind, id), module);
          merged.set(section.kind, byId);
        }
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return { module, stage: 'merge', error };
      }
    }
    return null;
  };

  // Templates settle before anything that inherits one, because a template is
  // what an entity is merged ONTO: the entity's own blocks then override, add
  // and remove against it through the one merge rule, rather than through a
  // second one bolted on after the fact.
  const isTemplate = (kind: string): boolean => kind === 'entitytype';
  const templateFailure = mergePass(isTemplate) ?? mergePass((kind) => !isTemplate(kind));
  if (templateFailure) return { failure: templateFailure };
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

  // A switched-off source is parsed only to recover the id and pack its status
  // reports. It contributes no diagnostic: nothing it says is loaded, so
  // switching a broken module off is an exit from its problems, not a rename.
  for (const source of sources.filter((source) => !sourceEnabled(source))) {
    try {
      statuses.set(source, parsedModuleStatus(parseModuleSource(source), false));
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
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
      return { registry: emptyRegistry(), diagnostics, modules, parsed: [], loadedModules: [], disabledModules: summarizeDisabled(modules) };
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
        parsed: ordered,
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
