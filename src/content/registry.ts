import { ActionResult, nestedResults } from '../grammar/actionResult';
import { point } from '../grammar/range';
import { Action, actionProblem, assembledActionProblem, isTwoSided, sidedFields } from '../grammar/action';
import { Condition } from '../grammar/condition';
import { HOOK_LABELS } from '../grammar/hook';
import { ClusterJewel, clusterJewelProblem, clusterJewelSchema } from './clusterJewel';
import { Dialogue } from './dialogue';
import { DropTable } from './dropTable';
import { ActionDeclaration } from './action';
import { AuthoredEntity, Entity, EntityBlock, entitySchema, Handler, isHandlerBlock } from './entity';
import { Faction, factionSchema, WORLD_FACTION } from './faction';
import { Flag, flagSchema } from './flag';
import { GameEvent, eventSchema } from './event';
import { Item, itemRoleProblem, itemSchema } from './item';
import { actionSlug, actionSlugProblem, addLocaleSection, emptyLocales, GENERATED_FIELD, localeKey, Locales, LocaleSection, TEXT_FIELDS, unsuppliedParameters } from './locale';
import { Passive, passiveRangeProblem, passiveSchema } from './passive';
import { getShape } from './shapes';
import { Location, locationSchema, recursivelyResolveRelativeCoordinates } from './location';
import { mergeSection } from './merge';
import { ModuleSection } from './module';
import { ModuleSource, ParsedModule, moduleOrderProblems, orderModules, parseModuleSource, parseUniverse } from './universe';
import { DslError, Span } from '../grammar/parser';
import { Namespace } from './namespace';
import { Recipe, recipeSchema } from './recipe';
import { registryCapabilities, validateDialogueReferences, validateItemSlots, validateRecipeReferences, validateSectionReferences, validateTestReferences } from './references';
import { ReferenceKind, Visit, visitAction, visitResults, visitSection, visitTags } from './referenceSites';
import { Removal } from './removal';
import { declareMembers, Member, MemberOwner, RESOLUTION_PASSES } from './resolve';
import { Resource, resourceSchema } from './resource';
import { ParsedSave } from './saveSection';
import { Authored, DEFAULT_LANGUAGE, hydrateSection, HydrateContext } from '../grammar/section';
import { Skill, skillSchema } from './skill';
import { Stat, statSchema } from './stat';
import { Test } from './test';
import { validateTuningVariable } from './tuningVariables';
import { humanizeEn } from '../grammar/values';
import { Variable, variableSchema } from './variable';

export interface Registry {
  entities: Map<string, Entity>;
  actions: Map<string, ActionDeclaration>;
  events: Map<string, GameEvent>;
  factions: Map<string, Faction>;
  // Membership as a mask, so hostility is one `and`. Compiled from declaration
  // order, because names are authored and bits are not.
  factionBits: Map<string, number>;
  // The entity the runtime plays as, found by name rather than privileged: the
  // grammar reads nothing from it that it does not read from a rat.
  player?: Entity;
  locations: Map<string, Location>;
  items: Map<string, Item>;
  passives: Map<string, Passive>;
  clusterJewels: Map<string, ClusterJewel>;
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
  // The text side of the load: what content authored, under the language its
  // module declared, and what `# locale` sections supplied. Kept apart from
  // every content map above so that loading a locale cannot reach one (c6).
  locales: Locales;
}

// Each DSL section kind beside the registry map that holds it. `recipeActions`
// and `dialoguesByOwner` are indexes over maps already listed, and `flag`,
// `variable` and `save` carry no references to anything, so the pairs here are
// every section a reference can be authored inside.
export const CONTENT_SECTION_MAPS: readonly (readonly [string, keyof Registry])[] = [
  ['entity', 'entities'],
  ['action', 'actions'],
  ['event', 'events'],
  ['faction', 'factions'],
  ['location', 'locations'],
  ['item', 'items'],
  ['passive', 'passives'],
  ['cluster-jewel', 'clusterJewels'],
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
  const rate = typeof recipe.rate === 'string' ? { id: recipe.rate } : recipe.rate;
  const cadence: Pick<Action, 'rate' | 'time'> = rate !== undefined ? { rate } : recipe.time !== undefined ? { time: recipe.time } : {};
  const action: Action = {
    // English by construction, so it is the recipe's identifier and never its
    // display: a craft is shown through `engine.craft.label` over the recipe's
    // own title key, in the choice list and once it is under way alike.
    label: `Craft ${humanizeEn(recipe.id)}`,
    generatedLabel: true,
    kind: 'rate' in cadence || 'time' in cadence ? 'continuous' : 'instant',
    results,
    ...cadence,
    // One-sided: a craft has one participant, so neither half names a side.
    ...(recipe.accuracy ? { accuracy: { left: { id: recipe.accuracy }, ...(recipe.evasion ? { right: { id: recipe.evasion } } : {}) } } : {}),
  };

  if (recipe.accuracy) {
    // The fail path consumes the SAME inputs as success, so inputLimit still
    // bounds a repeating burn-capable craft.
    action.attempts = 1;
    const burnt: ActionResult[] = recipe.burnt.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
    action.onUnfinished = [...takes, ...burnt];
  }

  return action;
}

function emptyRegistry(): Registry {
  return {
    entities: new Map(),
    actions: new Map(),
    events: new Map(),
    factions: new Map(),
    factionBits: new Map(),
    locations: new Map(),
    items: new Map(),
    passives: new Map(),
    clusterJewels: new Map(),
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
    locales: emptyLocales(),
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

// The base entries one section contributes: what it authored, plus the title
// `humanizeEn` fills in — which is an English entry, so it is one only where the
// module says it is writing English. A field left unauthored anywhere else has
// no entry in any language, which is what puts its key on screen (c3, c5).
function recordBaseText(registry: Registry, languages: ReadonlyMap<string | null, string>, kind: string, authored: Record<string, unknown>): void {
  const fields = TEXT_FIELDS[kind];
  if (!fields) return;
  const id = authored.id as string;
  // The module that owns the id, not the one that last patched the section: a
  // patch writes text into somebody else's object, and the key names the object.
  const namespace = registry.namespace.ownerOf(kind, id) ?? null;
  const language = languages.get(namespace) ?? DEFAULT_LANGUAGE;
  for (const field of fields) {
    const key = localeKey(namespace, kind, id, field);
    const authoredValue = authored[field];
    // A title is asked for whatever anybody authored, so its key is addressable
    // even where no module has text for it; an unauthored `examine:` is nothing
    // the engine ever renders and so is not a gap in any language.
    if (field === GENERATED_FIELD || typeof authoredValue === 'string') registry.locales.addressable.add(key);
    if (typeof authoredValue === 'string') registry.locales.base.set(key, { text: authoredValue, language });
    else if (field === GENERATED_FIELD && language === DEFAULT_LANGUAGE) registry.locales.base.set(key, { text: humanizeEn(id), language, generated: true });
  }
}

// An action's label doubles as its identifier, so its display is keyed on a slug
// of it and the label itself is the entry for that key (c8). Run over the built
// registry because an entity's actions are assembled after its section is.
function recordActionText(registry: Registry, languages: ReadonlyMap<string | null, string>, kind: string, id: string, actions: readonly Action[]): void {
  const namespace = registry.namespace.ownerOf(kind, id) ?? null;
  const language = languages.get(namespace) ?? DEFAULT_LANGUAGE;
  const taken = new Set<string>();
  for (const action of actions) {
    const problem = actionSlugProblem(action.label, taken);
    if (problem) throw new DslError(`# ${kind} ${id}: ${problem}`);
    const slug = actionSlug(action.label);
    taken.add(slug);
    const key = localeKey(namespace, kind, id, slug);
    registry.locales.addressable.add(key);
    // A generated label is `humanizeEn` of an id, so it is an entry for English
    // and for nothing else — the same gate `defaultTitle` applies, applied
    // where the other generator runs (c5).
    if (action.generatedLabel && language !== DEFAULT_LANGUAGE) continue;
    registry.locales.base.set(key, { text: action.label, ...(action.generatedLabel ? { generated: true as const } : {}), language });
  }
}

// A recipe is absent: its craft is shown through `engine.craft.label` over the
// recipe's own title key, so keying the compiled label as well would be one
// visible string with two keys that a translator has to fill in twice.
// Every table of actions a player can be offered one from, each beside the id
// that owns it — which is what lets a refusal name the module to blame.
function everyActionTable(registry: Registry): Array<[string, string, readonly Action[]]> {
  return [
    ...[...registry.entities.values()].map((entity) => ['entity', entity.id, entity.actions] as [string, string, readonly Action[]]),
    ...[...registry.locations.values()].map((location) => ['location', location.id, location.actions] as [string, string, readonly Action[]]),
    ...[...registry.items.values()].map((item) => ['item', item.id, item.actions] as [string, string, readonly Action[]]),
    ...[...registry.actions].map(([id, action]) => ['action', id, [action]] as [string, string, readonly Action[]]),
  ];
}

function applySection(registry: Registry, section: ModuleSection, context: HydrateContext): void {
  switch (section.kind) {
    // Not skipped where it would be harmless: a locale reaching the content
    // build is the failure c6 forbids, so the one route to it says so.
    case 'locale':
      throw new DslError('a # locale is not content and cannot be built into the registry');
    case 'entity': {
      const entity = hydrateSection(section.value as Authored<AuthoredEntity>, entitySchema, context);
      // `actions` and `handlers` are what `blocks` becomes once `uses:` can be
      // read against the actions it names, which is after every section is in.
      registry.entities.set(entity.id, { ...entity, actions: [], handlers: [] });
      break;
    }
    case 'action': {
      const action = section.value as ActionDeclaration;
      registry.actions.set(action.id, action);
      break;
    }
    case 'event': {
      const event = hydrateSection(section.value as Authored<GameEvent>, eventSchema, context);
      if (!event.resource) throw new DslError(`# event ${event.id} requires a resource: to watch`);
      if (!event.trigger) throw new DslError(`# event ${event.id} requires a trigger:`);
      // An entity answers an event by writing `on <its name>:`, and a hook has
      // claimed one of those labels. Refused where the name is bound, because
      // the entity that would have handled it never sees a problem — it gets a
      // hook, and the event goes unhandled with nothing to say so.
      const answered = event.id.split('.').pop()!;
      if (HOOK_LABELS.includes(`on ${answered}`)) throw new DslError(`# event ${event.id}: an entity would answer this by writing \`on ${answered}:\`, which is a hook block — name the event something an entity can handle`);
      registry.events.set(event.id, event);
      break;
    }
    case 'faction': {
      const faction = hydrateSection(section.value as Authored<Faction>, factionSchema, context);
      registry.factions.set(faction.id, faction);
      break;
    }
    case 'location': {
      const location = hydrateSection(section.value as Authored<Location>, locationSchema, context);
      registry.locations.set(location.id, location);
      break;
    }
    case 'item': {
      const item = hydrateSection(section.value as Authored<Item>, itemSchema, context);
      const problem = itemRoleProblem(item);
      if (problem) throw new DslError(`# item ${item.id}: ${problem}`);
      registry.items.set(item.id, item);
      break;
    }
    case 'passive': {
      const authored = section.value as Authored<Passive>;
      const passive = hydrateSection(authored, passiveSchema, context);
      const problem = passiveRangeProblem(passive);
      if (problem) throw new DslError(`# passive ${authored.id}: ${problem}`);
      registry.passives.set(passive.id, passive);
      break;
    }
    case 'cluster-jewel': {
      const authored = section.value as Authored<ClusterJewel>;
      try {
        const clusterJewel = hydrateSection(authored, clusterJewelSchema, context);
        const shape = getShape(clusterJewel.shape);
        const problem = clusterJewelProblem(clusterJewel, shape);
        if (problem) throw new DslError(problem);
        registry.clusterJewels.set(clusterJewel.id, clusterJewel);
      } catch (raw) {
        if (!(raw instanceof DslError)) throw raw;
        throw new DslError(`# cluster-jewel ${authored.id}: ${raw.message}`, raw.span);
      }
      break;
    }
    case 'stat': {
      const stat = hydrateSection(section.value as Authored<Stat>, statSchema, context);
      registry.stats.set(stat.id, stat);
      break;
    }
    case 'skill': {
      const skill = hydrateSection(section.value as Authored<Skill>, skillSchema, context);
      if (skill['per-level'] && !skill['stat-id']) throw new DslError(`# skill ${skill.id}: per-level: needs a stat-id: to raise`);
      registry.skills.set(skill.id, skill);
      break;
    }
    case 'recipe': {
      const recipe = hydrateSection(section.value as Authored<Recipe>, recipeSchema, context);
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
      const resource = hydrateSection(section.value as Authored<Resource>, resourceSchema, context);
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
      const flag = hydrateSection(section.value as Authored<Flag>, flagSchema, context);
      registry.flags.set(flag.id, flag);
      break;
    }
    case 'variable': {
      const variable = hydrateSection(section.value as Authored<Variable>, variableSchema, context);
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

interface ActionOwner {
  actions?: Action[];
  stats?: Record<string, unknown>;
}

// The grammar refuses an unauthorable action, but an action can also be
// ASSEMBLED — patched across modules, overloaded by an entity, or compiled from
// a recipe — and none of those went through the grammar. Same rule, applied
// where the section that owns the action can name itself.
function validateActionTable(kind: string, id: string, owner: ActionOwner): void {
  for (const action of owner.actions ?? []) {
    const problem = assembledActionProblem(action);
    if (problem) throw new DslError(`# ${kind} ${id} ${actionProblem(action.label, problem)}`);
  }
}

function pruneActions(actions: Action[], where: string, visit: Visit): Action[] {
  return actions.filter((action) => referencesLoaded(() => visitAction(action, `${where} action ${JSON.stringify(action.label)}`, visit)));
}

// A hook is a result list rather than a labelled block, so a dangling reference
// inside one costs the whole hook — the verdict pruneBlocks reaches per block.
function pruneHook(hook: ActionResult[], where: string, visit: Visit): ActionResult[] {
  return referencesLoaded(() => visitResults(hook, where, visit)) ? hook : [];
}

// A handler's event name is a reference the label carries, so a block survives
// only if what it names survives — the same rule its results already follow.
function pruneBlocks(blocks: EntityBlock[], where: string, visit: Visit): EntityBlock[] {
  return blocks.filter((block) =>
    referencesLoaded(() =>
      isHandlerBlock(block) ? visit('event', block.event, `${where} ${block.label}:`) : visitAction(block, `${where} action ${JSON.stringify(block.label)}`, visit),
    ),
  );
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

    for (const [id, action] of registry.actions) {
      if (referencesLoaded(() => visitAction(action, `# action ${id}`, visit))) continue;
      dropContent(registry, 'action', id, pruned, [registry.actions]);
      changed = true;
    }

    for (const [id, event] of registry.events) {
      if (referencesLoaded(() => visitSection('event', { ...event }, `# event ${id}`, visit))) continue;
      dropContent(registry, 'event', id, pruned, [registry.events]);
      changed = true;
    }

    for (const [id, entity] of registry.entities) {
      const stats = Object.fromEntries(Object.entries(entity.stats).filter(([statId]) => referencesLoaded(() => visit('stat', statId, `# entity ${id} stats:`))));
      const blocks = pruneBlocks(entity.blocks, `# entity ${id}`, visit);
      const uses = entity.uses.filter((used) => referencesLoaded(() => visit('action', used, `# entity ${id} uses:`)));
      const faction = entity.faction.filter((named) => referencesLoaded(() => visit('faction', named, `# entity ${id} faction:`)));
      const allies = entity.allies.filter((entry) => referencesLoaded(() => visit('entity', entry.entity, `# entity ${id} allies:`)));
      const onHit = pruneHook(entity.onHit, `# entity ${id} on hit:`, visit);
      const whenHit = pruneHook(entity.whenHit, `# entity ${id} when hit:`, visit);
      if (
        Object.keys(stats).length !== Object.keys(entity.stats).length ||
        blocks.length !== entity.blocks.length ||
        uses.length !== entity.uses.length ||
        faction.length !== entity.faction.length ||
        allies.length !== entity.allies.length ||
        onHit !== entity.onHit ||
        whenHit !== entity.whenHit
      ) {
        registry.entities.set(id, { ...entity, stats, blocks, uses, faction, allies, onHit, whenHit });
        changed = true;
      }
    }

    for (const [id, item] of registry.items) {
      // Through the shared walk, so a clause that grows a second reference —
      // `per` did — is pruned by the rule that resolves it rather than by a copy.
      const tags = item.tags.filter((tag) => referencesLoaded(() => visitTags([tag], `# item ${id}`, visit)));
      const actions = pruneActions(item.actions, `# item ${id}`, visit);
      const onHit = pruneHook(item.onHit, `# item ${id} on hit:`, visit);
      const whenHit = pruneHook(item.whenHit, `# item ${id} when hit:`, visit);
      if (tags.length !== item.tags.length || actions.length !== item.actions.length || onHit !== item.onHit || whenHit !== item.whenHit) {
        registry.items.set(id, { ...item, tags, actions, onHit, whenHit });
        changed = true;
      }
    }

    for (const [id, location] of registry.locations) {
      if (location.relative && (namesDanglingRoot('location', location.relative.of, danglingRoots) || referencePruned('location', location.relative.of, pruned))) {
        dropContent(registry, 'location', id, pruned, [registry.locations]);
        changed = true;
        continue;
      }
      const entities = location.entities.filter((entry) => !namesDanglingRoot('entity', entry.entity, danglingRoots) && !referencePruned('entity', entry.entity, pruned));
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


// --- linking ---------------------------------------------------------------

// The well-known id the runtime plays as. It is a name, not a privilege: the
// entity it finds declares its sheet the way every other entity does.
export const PLAYER_ENTITY = 'player';

// Membership is a mask so hostility is one `and`. `world` takes the first bit
// and is what an entity naming no faction belongs to, which is why almost
// nothing needs the line: rats do not fight rats.
const WORLD_BIT = 1;

function compileFactionBits(registry: Registry): void {
  registry.factionBits.clear();
  let next = 0;
  for (const id of registry.factions.keys()) {
    registry.factionBits.set(id, namesSame(id, WORLD_FACTION) ? WORLD_BIT : 1 << ++next);
  }
}

export function factionMask(registry: Registry, entity: { faction: readonly string[] } | undefined): number {
  if (!entity || entity.faction.length === 0) return WORLD_BIT;
  return entity.faction.reduce((mask, id) => mask | (registry.factionBits.get(id) ?? 0), 0);
}

// Two entities are hostile exactly when they share no bit.
export function hostile(registry: Registry, a: { faction: readonly string[] } | undefined, b: { faction: readonly string[] } | undefined): boolean {
  return (factionMask(registry, a) & factionMask(registry, b)) === 0;
}

// A shortened id names the same object as the whole path, which is the rule the
// namespace already resolves references by; an entity's overload block reaches
// its action the same way rather than through a second spelling.
const namesSame = (id: string, written: string): boolean => id === written || id.endsWith(`.${written}`);

function appendCondition(base: Condition | undefined, added: Condition): Condition {
  return base ? { kind: 'and', conditions: [base, added] } : added;
}

// A bare overload line replaces the inherited value; a `+` line adds to it.
function overlayAction(base: Action, over: Action): Action {
  const appended = new Set(over.appended ?? []);
  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(over)) {
    if (key === 'label' || key === 'appended' || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (!appended.has(key)) merged[key] = value;
    else if (key === 'requires' || key === 'hiddenIf') merged[key] = appendCondition(base[key as 'requires' | 'hiddenIf'], value as Condition);
    else merged[key] = [...(((base as unknown as Record<string, unknown[]>)[key]) ?? []), ...(value as unknown[])];
  }
  return merged as unknown as Action;
}

// An overload governs that entity's own performance of the action and nothing
// else, so a block naming an action the entity does not `use:` is refused rather
// than quietly becoming an action of its own.
function linkEntity(entity: Entity, registry: Registry): Entity {
  const handlers: Handler[] = [];
  const overloads = new Map<string, Action>();
  const own: Action[] = [];

  for (const block of entity.blocks) {
    if (isHandlerBlock(block)) {
      handlers.push({ event: block.event, results: block.results });
      continue;
    }
    const used = entity.uses.find((id) => namesSame(id, block.label));
    if (used !== undefined) {
      if (overloads.has(used)) throw new DslError(`${JSON.stringify(block.label)} overloads ${used} more than once`);
      overloads.set(used, block);
      continue;
    }
    const declared = [...registry.actions.keys()].find((id) => namesSame(id, block.label));
    if (declared !== undefined) throw new DslError(`${JSON.stringify(block.label)} overloads # action ${declared}, which this entity does not use:`);
    own.push(block);
  }

  const performed = entity.uses.map((id) => {
    const declaration = registry.actions.get(id);
    if (!declaration) throw new DslError(`uses: names an unknown action: ${id}`);
    const overload = overloads.get(id);
    return overload ? overlayAction(declaration, overload) : declaration;
  });

  return { ...entity, actions: [...performed, ...own], handlers };
}

// The performer's side of the bargain: an entity performing a two-sided action
// declares every stat that action reads off it, because falling through to the
// global `# stat` bases would measure the rat by the player's sheet.
function performerStatProblem(entity: Entity, action: Action, registry: Registry): string | undefined {
  for (const field of sidedFields(action)) {
    if (field.value.side !== 'my') continue;
    const needed = field.written === 'depletes' ? registry.resources.get(field.value.id)?.max : field.value.id;
    if (needed === undefined || entity.stats[needed] !== undefined) continue;
    const because = field.written === 'depletes' ? `${field.value.id} is measured by ${needed}, which` : `${field.written}: reads ${needed}, which`;
    return `${actionProblem(action.label, because)} stats: does not set`;
  }
  return undefined;
}

function entityProblem(entity: Entity, registry: Registry): string | undefined {
  for (const ally of entity.allies) {
    // A side is you and your allies, so naming yourself makes you your own
    // ally, and naming the player puts the player on both sides of the fight.
    if (namesSame(entity.id, ally.entity)) return `allies: names this entity itself: ${ally.entity}`;
    if (namesSame(ally.entity, PLAYER_ENTITY)) return `allies: names the player, who is a side rather than a member of one: ${ally.entity}`;
  }
  for (const handler of entity.handlers) {
    if (!registry.events.has(handler.event)) return `on ${handler.event}: names an unknown event: ${handler.event}`;
  }
  for (const action of entity.actions) {
    if (!isTwoSided(action)) continue;
    const problem = performerStatProblem(entity, action, registry);
    if (problem) return problem;
  }
  return undefined;
}

function linkRegistry(registry: Registry, owners: ReadonlyMap<string, ParsedModule>): BuildFailure | null {
  compileFactionBits(registry);

  const players: Entity[] = [];
  for (const [id, entity] of registry.entities) {
    try {
      const linked = linkEntity(entity, registry);
      registry.entities.set(id, linked);
      const problem = entityProblem(linked, registry);
      if (problem) throw new DslError(problem);
      if (namesSame(id, PLAYER_ENTITY)) players.push(linked);
    } catch (raw) {
      if (!(raw instanceof DslError)) throw raw;
      // Prefixed here, so every message an entity's own linking raises names the
      // entity without each throw site repeating it.
      const error = new DslError(`# entity ${id}: ${raw.message}`, raw.span);
      const module = sectionOwner(owners, 'entity', id);
      if (!module) throw error;
      return { module, stage: 'validate', error };
    }
  }
  if (players.length > 1) {
    const module = sectionOwner(owners, 'entity', players[1].id);
    const error = new DslError(`# entity ${players[1].id} and # entity ${players[0].id} are both the player, and a game is played as one entity`);
    if (!module) throw error;
    return { module, stage: 'validate', error };
  }
  registry.player = players[0];
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

  const linked = linkRegistry(registry, owners);
  if (linked) return linked;

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
        validateActionTable(kind, id, value as ActionOwner);
        validateSectionReferences(kind, id, value, registry);
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return { module: sectionOwner(owners, kind, id)!, stage: 'validate', error };
      }
    }
  }

  for (const [id, action] of registry.recipeActions) {
    try {
      validateActionTable('recipe', id, { actions: [action] });
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return { module: sectionOwner(owners, 'recipe', id)!, stage: 'validate', error };
    }
  }

  try {
    validateItemSlots(registry);
  } catch (error) {
    if (!(error instanceof DslError)) throw error;
    const id = /^# item (\S+)/.exec(error.message)?.[1];
    const module = id ? sectionOwner(owners, 'item', id) : undefined;
    if (!module) throw error;
    return { module, stage: 'validate', error };
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

const wouldDeclare = (kind: string, value: MemberOwner): Member[] => declareMembers(new Namespace(), kind, value);

const memberKey = (member: Member): string => `${member.kind}\0${member.key}`;

function reconcileMembers(namespace: Namespace, merged: Map<string, Map<string, OwnedSection>>, declared: ReadonlyMap<string, Member[]>): void {
  const survivingAcrossEveryKind = new Set<string>();
  for (const [kind, byId] of merged) {
    for (const section of byId.values()) {
      for (const member of wouldDeclare(kind, section.value as MemberOwner)) survivingAcrossEveryKind.add(memberKey(member));
    }
  }
  for (const [kind, byId] of merged) {
    for (const id of byId.keys()) {
      for (const member of declared.get(ownerKey(kind, id)) ?? []) {
        if (!survivingAcrossEveryKind.has(memberKey(member))) namespace.undeclare(member.kind, member.key);
      }
    }
  }
}

function compileModules(modules: readonly ParsedModule[]): { registry: Registry } | { failure: BuildFailure } {
  const registry = emptyRegistry();

  // Two phases, because merging must happen on the authored form: a hydrated
  // object has every field filled in with defaults, so overlaying one would
  // silently reset everything the patch did not mention.
  const merged = new Map<string, Map<string, OwnedSection>>();
  const declaredMembers = new Map<string, Member[]>();
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
          // A locale is not content: it never enters the merge, so no id it
          // names can be added, patched or removed by it (c6).
          if (section.kind === 'locale') continue;
          if (!owns(section.kind)) continue;
          const byId = merged.get(section.kind) ?? new Map<string, OwnedSection>();
          const id = (section.value as { id: string }).id;
          byId.set(id, { kind: section.kind, value: mergeSection(section.kind, byId.get(id)?.value, section.value), module });
          owners.set(ownerKey(section.kind, id), module);
          merged.set(section.kind, byId);
          const declared = declaredMembers.get(ownerKey(section.kind, id)) ?? [];
          declared.push(...wouldDeclare(section.kind, section.value as MemberOwner));
          declaredMembers.set(ownerKey(section.kind, id), declared);
        }
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return { module, stage: 'merge', error };
      }
    }
    return null;
  };

  const mergeFailure = mergePass(() => true);
  if (mergeFailure) return { failure: mergeFailure };
  reconcileMembers(namespace, merged, declaredMembers);
  const languages = new Map<string | null, string>(modules.map((module) => [module.namespace, module.info.language]));
  // Only the modules that declare content: a locale-only module writing English
  // beside a Spanish island says nothing about what language its prose is in,
  // and counting it would shut the prose door for every player of every
  // language, since the shipped engine locale declares `en`.
  registry.locales.moduleLanguages = modules.filter((module) => module.sections.some((section) => section.kind !== 'locale')).map((module) => module.info.language);
  for (const module of modules) {
    for (const section of module.sections) {
      if (section.kind === 'locale') addLocaleSection(registry.locales, module.namespace, section.value as LocaleSection);
    }
  }
  for (const [kind, byId] of merged) {
    for (const section of byId.values()) {
      try {
        applySection(registry, { kind, value: section.value }, { language: languages.get(registry.namespace.ownerOf(kind, (section.value as { id: string }).id) ?? null) ?? DEFAULT_LANGUAGE });
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return { failure: { module: section.module, stage: 'build', error } };
      }
    }
  }
  const validationFailure = validateBuiltRegistry(registry, owners, danglingRoots);
  if (validationFailure) return { failure: validationFailure };
  // Both passes run after validation, so that content dropped for a dangling
  // reference leaves no key behind for a translator to answer — and so that the
  // labels keyed below are the assembled ones a player will be offered, since
  // validation is where an entity's `uses:` becomes an action of its own.
  for (const [kind, byId] of merged) {
    for (const [id, section] of byId) {
      if (registry.namespace.has(kind, id)) recordBaseText(registry, languages, kind, section.value as Record<string, unknown>);
    }
  }
  for (const [kind, id, actions] of everyActionTable(registry)) {
    try {
      recordActionText(registry, languages, kind, id, actions);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return { failure: { module: sectionOwner(owners, kind, id) ?? modules[0], stage: 'build', error } };
    }
  }
  // Last, because it reads both halves: what a locale said and what the English
  // it is translating names. A parameter nothing supplies throws at the moment
  // the screen is drawn, so it is refused where the value is assembled instead.
  const byNamespace = new Map(modules.map((module) => [module.namespace, module]));
  for (const declared of registry.locales.sections) {
    for (const { key, value } of declared.entries) {
      const unsupplied = unsuppliedParameters(registry.locales, declared.language, key, value);
      if (unsupplied.length === 0) continue;
      const error = new DslError(`# locale ${declared.language}: ${key} names ${unsupplied.map((name) => `{${name}}`).join(', ')}, which nothing supplies`);
      return { failure: { module: byNamespace.get(declared.module) ?? modules[0], stage: 'build', error } };
    }
  }
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
