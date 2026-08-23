import type { LocaleSection } from './sections/locale';
import { ActionResult, nestedResults } from '../grammar/actionResult';
import { Action, actionProblem, assembledActionProblem, isTwoSided, sidedFields } from '../grammar/action';
import { Condition } from '../grammar/condition';
import { Dialogue, Spoken } from './sections/dialogue';
import { parseSegments, printSegments } from '../grammar/segment';
import { actionAddress, actionTextKey, actionTextOwner } from './sections/action';
import { Entity, Handler, isHandlerBlock, mintedActions, offersNothing } from './sections/entity';
import { WORLD_FACTION } from './sections/faction';
import { addLocaleSection, BaseEntry, dialogueAgainField, dialogueChoiceField, dialogueLineField, dialogueSayField, emptyLocales, everySaid, GENERATED_FIELD, localeKey, Locales, ProseShape, sayField, unsuppliedParameters } from './locale';
import { actionSlugProblem, textFieldsOf } from './sections';
import { closeAdjacency, entitiesStood, recursivelyResolveRelativeCoordinates } from './sections/location';
import { type Maps, buildSection, sectionFor, contentSectionMaps, isActionOwnerKind, isSectionKind, mergeSection, ModuleSection, sectionOf, SectionKind } from './sections';
import { ModuleSource, ParsedModule, moduleOrderProblems, orderModules, parseModuleSource, parseUniverse } from './universe';
import { DslError, Span } from '../grammar/parser';
import { hasNote, NOTE_MARK, withoutNote } from '../grammar/note';
import { ACTION_MEMBER, memberKey, Namespace, } from './namespace';
import { isNamespacedKind } from './sections';
import { emptyMaps, mapOf, everyActionTable, ModuleDiagnostic, ModuleLoadStage, ModuleStatus, PLAYER_ENTITY, Registry, UniverseLoadResult, WORLD_BIT } from './registry';
import { registrySlots, validateItemSlots, validateSectionReferences, validateTestReferences } from './references';
import { Pruning, ReferenceKind, Visit } from './refs';
import { Removal } from './sections/remove';
import { unpriceableStock } from './sections/shop';
import { actionAddresses, declareMembers, Member, MemberOwner, RESOLUTION_PASSES } from './resolve';
import { DEFAULT_LANGUAGE } from '../grammar/section';
import { validateTuningVariable } from './tuningVariables';
import { humanizeEn } from '../grammar/values';

function emptyRegistry(): Registry {
  return {
    ...emptyMaps(),
    factionBits: new Map(),
    namespace: new Namespace(),
    locales: emptyLocales(),
    roads: new Map(),
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
  return {
    sourceName: source.name,
    moduleId,
    stage,
    message: error.message,
    span: error.span,
    ...(position ?? {}),
  };
}

const sourceEnabled = (source: ModuleSource): boolean => source.enabled !== false;

function moduleStatus(source: ModuleSource, moduleId: string, pack: string | undefined, loaded: boolean): ModuleStatus {
  return {
    sourceName: source.name,
    moduleId,
    pack,
    enabled: sourceEnabled(source),
    loaded,
  };
}

function parsedModuleStatus(module: ParsedModule, loaded: boolean): ModuleStatus {
  return moduleStatus(module.source, module.info.id, module.info.pack, loaded);
}

function summarizeDisabled(statuses: readonly ModuleStatus[]): string[] {
  return statuses.filter((module) => !module.loaded).map((module) => module.moduleId);
}

function recordBase(registry: Registry, key: string, entry: BaseEntry): void {
  registry.locales.base.set(key, entry);
}

function recordBaseText(registry: Registry, kind: string, authored: Record<string, unknown>, namespace: string | null, language: string): void {
  const fields = textFieldsOf(kind);
  if (!fields) return;
  const id = authored.id as string;
  for (const field of fields) {
    const key = localeKey(namespace, kind, id, field);
    const authoredValue = authored[field];
    if (field === GENERATED_FIELD || typeof authoredValue === 'string') registry.locales.addressable.add(key);
    if (typeof authoredValue === 'string') recordBase(registry, key, { text: authoredValue, language });
    else if (field === GENERATED_FIELD && language === DEFAULT_LANGUAGE)
      recordBase(registry, key, {
        text: humanizeEn(id),
        language,
        generated: true,
      });
  }
}

function recordActionText(registry: Registry, languages: ReadonlyMap<string | null, string>, kind: string, id: string, actions: readonly Action[]): void {
  const taken = new Set<string>();
  for (const action of actions) {
    const slug = actionAddress(action);
    const problem = actionSlugProblem(slug, action.label, taken);
    if (problem) throw new DslError(`# ${kind} ${id}: ${problem}`);
    taken.add(slug);
    const owner = actionTextOwner(registry.namespace, kind, id, action);
    const language = languages.get(owner.namespace) ?? DEFAULT_LANGUAGE;
    const key = actionTextKey(owner);
    registry.locales.addressable.add(key);
    if (action.generatedLabel && language !== DEFAULT_LANGUAGE) continue;
    recordBase(registry, key, {
      text: action.label,
      ...(action.generatedLabel ? { generated: true as const } : {}),
      language,
    });
  }
}

interface ProseOwner {
  namespace: string | null;
  kind: string;
  id: string;
  language: string;
}

function proseOwner(registry: Registry, languages: ReadonlyMap<string | null, string>, kind: string, id: string): ProseOwner {
  const namespace = registry.namespace.ownerOf(kind, id) ?? null;
  return {
    namespace,
    kind,
    id,
    language: languages.get(namespace) ?? DEFAULT_LANGUAGE,
  };
}

function recordProse(registry: Registry, owner: ProseOwner, field: string, text: string, shape: ProseShape): string {
  const key = localeKey(owner.namespace, owner.kind, owner.id, field);
  registry.locales.addressable.add(key);
  registry.locales.prose.set(key, shape);
  recordBase(registry, key, { text, language: owner.language });
  return key;
}


function authoredResults(registry: Registry): Array<[string, string, ActionResult[][]]> {
  return contentSectionMaps().flatMap(([kind, mapName]) => {
    const says = sectionFor(kind)!.says as ((value: unknown) => ActionResult[][]) | undefined;
    if (says === undefined) return [];
    return [...mapOf(registry, mapName)].map(([id, value]) => [kind, id, says(value)] as [string, string, ActionResult[][]]);
  });
}

function stampSays(registry: Registry, owner: ProseOwner, lists: readonly (readonly ActionResult[])[], field: (index: number) => string): void {
  let index = 0;
  const walk = (list: readonly ActionResult[]): void => {
    for (const result of list) {
      if (result.kind === 'say') result.key = recordProse(registry, owner, field(index++), result.text, 'verbatim');
      for (const nested of nestedResults(result)) walk(nested);
    }
  };
  for (const list of lists) walk(list);
}

function stampDialogue(registry: Registry, languages: ReadonlyMap<string | null, string>, dialogue: Dialogue): void {
  const owner = proseOwner(registry, languages, 'dialogue', dialogue.id);
  for (const node of dialogue.nodes) {
    const spoken = (line: Spoken, field: string): void => {
      line.key = recordProse(registry, owner, field, printSegments(line.segments), 'segments');
    };
    if (node.again) spoken(node.again, dialogueAgainField(node.name));
    const results: ActionResult[][] = [];
    let lines = 0;
    let choices = 0;
    for (const step of node.steps) {
      if (step.kind === 'say') spoken(step, dialogueLineField(node.name, lines++));
      else if (step.kind === 'effect') results.push([step.result]);
      else if (step.kind === 'menu') {
        for (const choice of step.choices) {
          spoken(choice, dialogueChoiceField(node.name, choices++));
          results.push(choice.effects);
        }
      }
    }
    stampSays(registry, owner, results, (index) => dialogueSayField(node.name, index));
  }
}

function localeValueProblem(locales: Locales, language: string, key: string, value: string): DslError | undefined {
  if (locales.prose.get(key) === 'segments') {
    try {
      parseSegments(value, 0);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return new DslError(`# locale ${language}: ${key} is a spoken line, and ${error.message}`);
    }
    return undefined;
  }
  const unsupplied = unsuppliedParameters(locales, key, value);
  if (unsupplied.length === 0) return undefined;
  return new DslError(`# locale ${language}: ${key} names ${unsupplied.map((name) => `{${name}}`).join(', ')}, which nothing supplies`);
}

// A line the game says as nothing is a line nobody has written yet, and a player meets it as a broken engine rather than as a blank. A `@@@` note is dropped when the line is said, so a line that is only a note says nothing at all; a note trailing words is playable and stays legal. This asks the same table `npm run notes` and `npm run review` ask, so a kind or a field added next month is covered with no edit.
function silence(locales: Locales): DslError | undefined {
  for (const { key, language, text } of everySaid(locales)) {
    if (withoutNote(text).trim() !== '') continue;
    const said = language === DEFAULT_LANGUAGE ? key : `${key} in ${language}`;
    return new DslError(hasNote(text) ? `${said} is said to a player and is nothing but a ${NOTE_MARK} note, which is dropped when the line is said: write the words beside the mark rather than in place of them` : `${said} is said to a player and says nothing at all`);
  }
  return undefined;
}

type OwnedSection = ModuleSection & { module: ParsedModule };

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

function validateActionTable(kind: string, id: string, owner: ActionOwner): void {
  for (const action of owner.actions ?? []) {
    const problem = assembledActionProblem(action);
    if (problem) throw new DslError(`# ${kind} ${id} ${actionProblem(action.label, problem)}`);
  }
}

function dropContent(registry: Registry, kind: string, id: string, pruned: Set<string>): void {
  for (const name of Object.keys(sectionFor(kind)?.maps ?? {})) mapOf(registry, name).delete(id);
  registry.namespace.undeclare(kind, id);
  pruned.add(ownerKey(kind, id));
}

const ACTION_OWNER_MAPS = contentSectionMaps().filter(([kind]) => isActionOwnerKind(kind));

function pruneStrandedActionMembers(registry: Registry, pruned: Set<string>): boolean {
  const surviving = new Set<string>();
  for (const [kind, map] of ACTION_OWNER_MAPS) {
    for (const owner of (mapOf(registry, map) as ReadonlyMap<string, MemberOwner>).values()) {
      for (const address of actionAddresses(kind, owner)) surviving.add(memberKey(ACTION_MEMBER, kind, owner.id, address));
    }
  }
  let dropped = false;
  for (const key of registry.namespace.declaredKeys(ACTION_MEMBER)) {
    if (surviving.has(key)) continue;
    dropContent(registry, ACTION_MEMBER, key, pruned);
    dropped = true;
  }
  return dropped;
}

// A map that some kind derives into rather than owns outright is emptied once pruning has settled and refilled from everything that lands in it. It is refilled from every such kind and not only from the one that calls it its own: `dialogues` is where # dialogue keeps its own and where # quest puts the ones it gives away, and rebuilding it from either alone loses the other. The primaries are read before anything is emptied, because one of them may be what is being emptied.
function rebuildDerivedMaps(registry: Registry): void {
  const owned = new Map(contentSectionMaps());
  const derived = new Set(contentSectionMaps().flatMap(([kind]) => Object.keys(sectionFor(kind)!.maps).filter((name) => name !== owned.get(kind))));
  const survivors = new Map(contentSectionMaps().map(([kind, primary]) => [kind, [...(mapOf(registry, primary) as ReadonlyMap<string, { id: string }>).values()]] as const));
  for (const name of derived) mapOf(registry, name).clear();
  for (const [kind] of contentSectionMaps())
    for (const [name, lands] of Object.entries(sectionFor(kind)!.maps)) {
      if (!derived.has(name)) continue;
      const map = mapOf(registry, name);
      for (const value of survivors.get(kind)!) for (const [key, held] of lands(value)) map.set(key, held as { id?: string });
    }
}

function pruneRegistryDanglingReferences(registry: Registry, danglingRoots: ReadonlySet<string>): void {
  const pruned = new Set<string>();
  for (;;) {
    let changed = false;
    const visit = danglingVisit(danglingRoots, pruned);
    const at: Pruning = {
      intact: referencesLoaded,
      gone: (kind, id, where) => !referencesLoaded(() => visit(kind, id, where)),
      visit,
    };

    for (const [kind, primary] of contentSectionMaps()) {
      const owner = sectionFor(kind)!;
      const map = mapOf(registry, primary) as Map<string, { id: string }>;
      for (const [id, value] of map) {
        const survivor = owner.prune(value, at, `# ${kind} ${id}`);
        if (survivor === value) continue;
        if (survivor === null) dropContent(registry, kind, id, pruned);
        else map.set(id, survivor);
        changed = true;
      }
    }

    if (pruneStrandedActionMembers(registry, pruned)) changed = true;

    if (!changed) {
      rebuildDerivedMaps(registry);
      return;
    }
  }
}

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

function compileFactionBits(registry: Registry): void {
  registry.factionBits.clear();
  let next = 0;
  for (const id of registry.factions.keys()) {
    registry.factionBits.set(id, namesSame(id, WORLD_FACTION) ? WORLD_BIT : 1 << ++next);
  }
}

const namesSame = (id: string, written: string): boolean => id === written || id.endsWith(`.${written}`);

function appendCondition(base: Condition | undefined, added: Condition): Condition {
  return base ? { kind: 'and', conditions: [base, added] } : added;
}

function overlayAction(base: Action, over: Action): Action {
  const appended = new Set(over.appended ?? []);
  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(over)) {
    if (key === 'label' || key === 'appended' || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (!appended.has(key)) merged[key] = value;
    else if (key === 'requires' || key === 'hiddenIf') merged[key] = appendCondition(base[key as 'requires' | 'hiddenIf'], value as Condition);
    else merged[key] = [...((base as unknown as Record<string, unknown[]>)[key] ?? []), ...(value as unknown[])];
  }
  return merged as unknown as Action;
}

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

  const minted = mintedActions(entity, registry.namespace.ownerOf('entity', entity.id) ?? null);
  return { ...entity, actions: [...performed, ...own, ...minted], handlers };
}

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

function entityProblem(entity: Entity, registry: Registry, stoodIn: string | undefined): string | undefined {
  const bare = stoodIn === undefined ? undefined : offersNothing(entity, registry.dialogues, stoodIn);
  if (bare) return bare;
  for (const ally of entity.allies) {
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
  const stood = entitiesStood(registry.locations);
  for (const [id, entity] of registry.entities) {
    try {
      const linked = linkEntity(entity, registry);
      registry.entities.set(id, linked);
      const problem = entityProblem(linked, registry, stood.get(id));
      if (problem) throw new DslError(problem);
      if (namesSame(id, PLAYER_ENTITY)) players.push(linked);
    } catch (raw) {
      if (!(raw instanceof DslError)) throw raw;
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
      return {
        module: sectionOwner(owners, 'variable', variable.id)!,
        stage: 'validate',
        error,
      };
    }
  }

  for (const [kind, map] of contentSectionMaps()) {
    for (const [id, value] of mapOf(registry, map) as ReadonlyMap<string, object>) {
      try {
        validateActionTable(kind, id, value as ActionOwner);
        validateSectionReferences(sectionOf(kind, value), id, registry);
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return {
          module: sectionOwner(owners, kind, id)!,
          stage: 'validate',
          error,
        };
      }
    }
  }

  for (const [id, action] of registry.recipeActions) {
    try {
      validateActionTable('recipe', id, { actions: [action] });
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return {
        module: sectionOwner(owners, 'recipe', id)!,
        stage: 'validate',
        error,
      };
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

  for (const shop of registry.shops.values()) {
    const problem = unpriceableStock(shop, registry.items);
    if (problem) return { module: sectionOwner(owners, 'shop', shop.id)!, stage: 'validate', error: new DslError(problem) };
  }

  for (const test of registry.tests.values()) {
    try {
      validateTestReferences(test, registry);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return {
        module: sectionOwner(owners, 'test', test.id)!,
        stage: 'validate',
        error,
      };
    }
  }
  return null;
}

const wouldDeclare = (kind: string, value: MemberOwner): Member[] => declareMembers(new Namespace(), kind, value);

const memberIdentity = (member: Member): string => `${member.kind}\0${member.key}`;

function reconcileMembers(namespace: Namespace, merged: Map<SectionKind, Map<string, OwnedSection>>, declared: ReadonlyMap<string, Member[]>): void {
  const survivingAcrossEveryKind = new Set<string>();
  for (const [kind, byId] of merged) {
    for (const section of byId.values()) {
      for (const member of wouldDeclare(kind, section.value as MemberOwner)) survivingAcrossEveryKind.add(memberIdentity(member));
    }
  }
  for (const [kind, byId] of merged) {
    for (const id of byId.keys()) {
      for (const member of declared.get(ownerKey(kind, id)) ?? []) {
        if (!survivingAcrossEveryKind.has(memberIdentity(member))) namespace.undeclare(member.kind, member.key);
      }
    }
  }
}

function compileModules(modules: readonly ParsedModule[]): { registry: Registry } | { failure: BuildFailure } {
  const registry = emptyRegistry();

  const merged = new Map<SectionKind, Map<string, OwnedSection>>();
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
          if (section.kind === 'remove') {
            const { kind, target, id } = section.value as Removal;
            if (!owns(kind)) continue;
            if (!isSectionKind(kind) || !merged.get(kind)?.delete(target)) throw new DslError(`# remove ${id} names nothing that is loaded`);
            owners.delete(ownerKey(kind, target));
            namespace.undeclare(kind, target);
            continue;
          }
          if (sectionFor(section.kind)!.map === null) continue;
          if (!owns(section.kind)) continue;
          const byId = merged.get(section.kind) ?? new Map<string, OwnedSection>();
          const id = (section.value as { id: string }).id;
          byId.set(id, {
            kind: section.kind,
            value: mergeSection(section.kind, byId.get(id)?.value, section.value),
            module,
          });
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
  for (const module of modules) {
    for (const section of module.sections) {
      if (section.kind === 'locale') addLocaleSection(registry.locales, module.namespace, section.value as LocaleSection);
    }
  }
  for (const [kind, byId] of merged) {
    for (const section of byId.values()) {
      try {
        buildSection(section, registry as unknown as Maps, {
          language: languages.get(registry.namespace.ownerOf(kind, (section.value as { id: string }).id) ?? null) ?? DEFAULT_LANGUAGE,
        });
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return { failure: { module: section.module, stage: 'build', error } };
      }
    }
  }
  const validationFailure = validateBuiltRegistry(registry, owners, danglingRoots);
  if (validationFailure) return { failure: validationFailure };
  registry.roads = closeAdjacency(registry.locations);
  for (const [kind, byId] of merged) {
    for (const [id, section] of byId) {
      const owned = isNamespacedKind(kind);
      if (owned && !registry.namespace.has(kind, id)) continue;
      const namespace = owned ? (registry.namespace.ownerOf(kind, id) ?? null) : null;
      try {
        recordBaseText(registry, kind, section.value as Record<string, unknown>, namespace, languages.get(owned ? namespace : section.module.namespace) ?? DEFAULT_LANGUAGE);
      } catch (error) {
        if (!(error instanceof DslError)) throw error;
        return { failure: { module: section.module, stage: 'build', error } };
      }
    }
  }
  for (const id of registrySlots(registry)) {
    if (!registry.slots.has(id)) recordBaseText(registry, 'slot', { id }, null, DEFAULT_LANGUAGE);
  }
  for (const [kind, id, actions] of everyActionTable(registry)) {
    try {
      recordActionText(registry, languages, kind, id, actions);
    } catch (error) {
      if (!(error instanceof DslError)) throw error;
      return {
        failure: {
          module: sectionOwner(owners, kind, id) ?? modules[0],
          stage: 'build',
          error,
        },
      };
    }
  }
  for (const [kind, id, lists] of authoredResults(registry)) stampSays(registry, proseOwner(registry, languages, kind, id), lists, sayField);
  for (const dialogue of registry.dialogues.values()) stampDialogue(registry, languages, dialogue);
  const byNamespace = new Map(modules.map((module) => [module.namespace, module]));
  for (const declared of registry.locales.sections) {
    for (const { key, value } of declared.entries) {
      const error = localeValueProblem(registry.locales, declared.language, key, value);
      if (error)
        return {
          failure: {
            module: byNamespace.get(declared.module) ?? modules[0],
            stage: 'build',
            error,
          },
        };
    }
  }
  const silent = silence(registry.locales);
  if (silent) return { failure: { module: modules[0]!, stage: 'build', error: silent } };
  return { registry };
}

export function loadUniverse(sources: readonly ModuleSource[]): Registry {
  const compiled = compileModules(parseUniverse(sources.filter(sourceEnabled)));
  if ('failure' in compiled) throw compiled.failure.error;
  return compiled.registry;
}

function parseActiveSources(sources: readonly ModuleSource[], diagnostics: ModuleDiagnostic[], disabled: Set<ModuleSource>, statuses: Map<ModuleSource, ModuleStatus>): ParsedModule[] | null {
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
      return {
        registry: emptyRegistry(),
        diagnostics,
        modules,
        parsed: [],
        loadedModules: [],
        disabledModules: summarizeDisabled(modules),
      };
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
