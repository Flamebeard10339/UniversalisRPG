import { Action, Contest, Sided } from '../grammar/action';
import { ActionResult, resultLines, resultList, spansLines } from '../grammar/actionResult';
import { condition, printReference } from '../grammar/condition';
import { dependency, version as versionParser, Version } from '../grammar/dependency';
import { HOOK_FIELDS, HookCarrier } from '../grammar/hook';
import { range } from '../grammar/range';
import { bonusAmount, tagClause } from '../grammar/tagClause';
import { SkillGrant, skillGrant } from '../grammar/skillGrant';
import { duration, produced, quantified } from '../grammar/values';
import { indentLines } from '../grammar/structure';
import { Dialogue, TextSegment } from './dialogue';
import { DropTable } from './dropTable';
import { ActionDeclaration } from './action';
import { allyValue, Entity, statAssignmentValue } from './entity';
import { GameEvent } from './event';
import { ClusterJewel, DEFAULT_MOD_SLOTS, positionValue } from './clusterJewel';
import { Passive } from './passive';
import { Faction } from './faction';
import { clusterEffectValue, DEFAULT_MAX_LEVEL, Item } from './item';
import { edgeValue, Location, populationValue, relativeValue } from './location';
import { Recipe, recipeSkillValue } from './recipe';
import { Registry, registryMapOf } from './registry';
import type { ModuleDiagnostic, UniverseLoadResult } from './registry';
import { registryDiff } from './registryDiff';
import { GLOBAL_SECTION_KINDS, SECTION_KIND, SECTION_KINDS, sectionOf, type ModuleSection, type SectionKind } from './sectionKind';
import type { ModuleSource, ParsedModule } from './universe';
import { Slot } from './slot';
import { Stat } from './stat';
import { Skill } from './skill';
import { Flag } from './flag';
import { Variable } from './variable';
import { Resource } from './resource';
import { ParsedSave } from './saveSection';
import { Test, Directive, usePayload } from './test';
import { hexKey } from './hex';
import { ModuleInfo } from './info';
import { DEFAULT_LANGUAGE } from '../grammar/section';
import { localeKey, moduleLocaleSections, type LocaleDeclaration } from './locale';

type Lines = string[];

export interface SerializeModuleOptions {
  info: Pick<ModuleInfo, 'id'> & Partial<Pick<ModuleInfo, 'version' | 'dependencies' | 'pack' | 'language'>>;
  // The ids of the global sections this module declared. A global id belongs to
  // nobody, so `inModule` cannot find one and the caller says which it wrote.
  globals?: readonly string[];
}

function block(lines: Lines, label: string, values: readonly string[]): void {
  if (values.length === 0) return;
  lines.push(`${label}:`, ...indentLines(values));
}

function printResultBlock(lines: Lines, label: string, values: readonly ActionResult[] | undefined, childSpaces = 2): void {
  if (!values || values.length === 0) return;
  lines.push(`${label}:`, ...indentLines(values.flatMap(resultLines), childSpaces));
}

// Printed by every carrier, so a kind that joins the gather prints its hooks by
// calling this rather than by growing its own copy of the two labels.
function hookLines(lines: Lines, carrier: HookCarrier): void {
  printResultBlock(lines, HOOK_FIELDS.onHit.keyword!, carrier.onHit);
  printResultBlock(lines, HOOK_FIELDS.whenHit.keyword!, carrier.whenHit);
}

const sided = (value: Sided): string => (value.side === undefined ? value.id : `${value.side} ${value.id}`);

const contest = (value: Contest): string => (value.right === undefined ? sided(value.left) : `${sided(value.left)} vs ${sided(value.right)}`);

function actionLines(action: Action): Lines {
  const modifiers =
    action.requires ||
    action.hiddenIf ||
    action.tags?.length ||
    action.onSuccess?.length ||
    action.onFailure?.length ||
    action.onUnfinished?.length ||
    (action.kind !== undefined && action.kind !== 'duration') ||
    action.time !== undefined ||
    action.rate !== undefined ||
    action.accuracy ||
    action.damage ||
    action.depletes ||
    action.attempts !== undefined;

  if (!modifiers && action.results.length === 1 && !spansLines(action.results)) return [`${action.label}: ${resultList.print(action.results)}`];

  // A `+` line adds to what this block overlays, so the marker is part of the
  // field rather than of the value, and dropping it would turn an addition into
  // a replacement on reload.
  const appended = new Set(action.appended ?? []);
  const at = (name: keyof Action): string => (appended.has(name) ? '  +' : '  ');
  const lines = [`${action.label}:`];
  if (action.requires) lines.push(`${at('requires')}requires: ${condition.print(action.requires)}`);
  if (action.hiddenIf) lines.push(`${at('hiddenIf')}hidden if: ${condition.print(action.hiddenIf)}`);
  if (action.kind !== undefined && action.kind !== 'duration') lines.push(`  ${action.kind}`);
  // The tags the kind above already spells; re-emitting one would round-trip
  // into a second copy of the same fact.
  const lifted = new Set(['instant', 'continuous']);
  const tags = (action.tags ?? []).filter((each) => each.kind !== 'keyword' || !lifted.has(each.value));
  if (tags.length > 0) lines.push(`  ${tags.map((each) => tagClause.print(each)).join(', ')}`);
  if (action.time !== undefined) lines.push(`  time: ${action.time}`);
  if (action.rate !== undefined) lines.push(`  rate: ${typeof action.rate === 'number' ? action.rate : sided(action.rate)}`);
  if (action.accuracy) lines.push(`  accuracy: ${contest(action.accuracy)}`);
  if (action.damage) lines.push(`  damage: ${contest(action.damage)}`);
  if (action.depletes) lines.push(`  depletes: ${sided(action.depletes)}`);
  if (action.attempts !== undefined) lines.push(`  attempts: ${action.attempts}`);
  lines.push(...indentLines(action.results.flatMap(resultLines)));
  printResultBlock(lines, `${at('onSuccess')}on success`, action.onSuccess, 4);
  printResultBlock(lines, `${at('onFailure')}on failure`, action.onFailure, 4);
  printResultBlock(lines, `${at('onUnfinished')}on unfinished`, action.onUnfinished, 4);
  return lines;
}

// Exported because the load path records a spoken line's authored words as the
// entry a `# locale` translates, and what it records has to be the same
// spelling a translator will read back and write beside.
export function printSegments(values: readonly TextSegment[] | undefined): string {
  return (values ?? [])
    .map((segment) => {
      if (segment.kind === 'literal') return segment.text;
      if (segment.kind === 'interpolate') return `{${printReference(segment.reference)}}`;
      return `{${condition.print(segment.condition)}: ${segment.text}}`;
    })
    .join('');
}

// The verb, then whatever that verb's own line carries after its colon — the
// shape `begin:` and `refuse:` both take their inner directive in.
function inlined(inner: Directive, verb = inner.kind): string {
  return `${verb} ${printDirective(inner).replace(/^[a-z-]+:[ \t]*/, '')}`;
}

export function printDirective(value: Directive): string {
  switch (value.kind) {
    case 'run':
      return `run: ${value.test}`;
    case 'talk':
      return `talk: ${value.entity}`;
    case 'choose':
      return `choose: ${value.text}`;
    case 'use':
      return `use: ${usePayload(value)}`;
    case 'use-on':
      return `use: ${value.action} on ${value.target}`;
    case 'travel':
      return `travel: ${value.location}`;
    case 'goto':
      return `goto: ${value.location}`;
    case 'craft':
      return `craft: ${value.recipe}`;
    case 'begin':
      return `begin: ${inlined(value.inner, value.inner.kind === 'use-on' ? 'use' : value.inner.kind)}`;
    case 'refuse':
      return `refuse: ${inlined(value.inner)}`;
    case 'assert':
      return `assert: ${condition.print(value.condition)}`;
    case 'expect':
      return `expect: ${value.save}`;
    case 'load':
      return `load: ${value.save}`;
    case 'cancel':
      return 'cancel';
    case 'wait':
      return `wait: ${value.seconds}`;
    case 'equip':
      return `equip: ${value.item}`;
    case 'unequip':
      return `unequip: ${value.slot}`;
    case 'feed':
      return `feed: ${value.target} with ${value.food}`;
    case 'slot':
      return `slot: ${value.target} at ${hexKey(value.hex)} ${value.direction} with ${value.jewel}`;
    case 'allocate':
      return `allocate: ${value.target} at ${hexKey(value.node.hex)} ${value.node.kind === 'position' ? `position ${value.node.position}` : `slot ${value.node.direction}`}`;
    case 'apply':
      return `apply: ${value.target} at ${hexKey(value.hex)} with ${value.effect}`;
    case 'open-modal':
      return `open-modal: ${value.modal}`;
    case 'submit-modal':
      return `submit-modal: ${value.key}=${value.value}`;
    default: {
      const unreached: never = value;
      return unreached;
    }
  }
}

function moduleLocalId(moduleId: string, id: string): string {
  return id.startsWith(`${moduleId}.`) ? id.slice(moduleId.length + 1) : id;
}

// A title the loader would fill in for itself is not printed, and the load
// recorded which those were rather than leaving this to guess: comparing the
// title against `defaultTitle` drops one an author wrote that happens to equal
// the id, which is a whole entry lost on the round trip a contribution makes.
function titleLine(registry: Registry, moduleId: string, kind: string, value: { id: string; title?: string }): Lines {
  const entry = registry.locales.base.get(localeKey(moduleId, kind, value.id, 'title'));
  return value.title === undefined || entry === undefined || entry.generated ? [] : [`title: ${value.title}`];
}

// A slot's key is written under nobody, so `titleLine`'s module-scoped lookup
// cannot find it: the same rule and the same generated-title test, one segment
// shorter.
function slotTitleLine(registry: Registry, slot: Slot): Lines {
  const entry = registry.locales.base.get(localeKey(null, 'slot', slot.id, 'title'));
  return entry === undefined || entry.generated ? [] : [`title: ${slot.title}`];
}

function titled(lines: Lines, registry: Registry, moduleId: string, kind: string, value: { id: string; title?: string; examine?: string }): void {
  lines.push(...titleLine(registry, moduleId, kind, value));
  if (value.examine !== undefined) lines.push(`examine: ${value.examine}`);
}

function itemSection(registry: Registry, moduleId: string, item: Item): string {
  const lines = [`# item ${moduleLocalId(moduleId, item.id)}`];
  titled(lines, registry, moduleId, 'item', item);
  if (item.slot) lines.push(`slot: ${item.slot}`);
  if (item.tags && item.tags.length > 0) lines.push(item.tags.map((each) => tagClause.print(each)).join(', '));
  if (item.clusterJewel) lines.push(`cluster-jewel: ${item.clusterJewel}`);
  if (item.originCluster) lines.push(`origin-cluster: ${item.originCluster}`);
  if (item.clusterEffect) lines.push(`cluster-effect: ${clusterEffectValue.print(item.clusterEffect)}`);
  if (item.itemExperience !== undefined) lines.push(`item-experience: ${item.itemExperience}`);
  if (item.maxLevel !== DEFAULT_MAX_LEVEL) lines.push(`max-level: ${item.maxLevel}`);
  hookLines(lines, item);
  for (const action of item.actions ?? []) lines.push(...actionLines(action));
  return lines.join('\n');
}

function passiveSection(registry: Registry, moduleId: string, passive: Passive): string {
  const lines = [`# passive ${moduleLocalId(moduleId, passive.id)}`];
  titled(lines, registry, moduleId, 'passive', passive);
  if (passive.tags.length > 0) lines.push(passive.tags.map((each) => tagClause.print(each)).join(', '));
  hookLines(lines, passive);
  return lines.join('\n');
}

function clusterJewelSection(registry: Registry, moduleId: string, jewel: ClusterJewel): string {
  const lines = [`# cluster-jewel ${moduleLocalId(moduleId, jewel.id)}`];
  titled(lines, registry, moduleId, 'cluster-jewel', jewel);
  lines.push(`shape: ${jewel.shape}`);
  lines.push(`open-connections: ${jewel.openConnections.join(', ')}`);
  const positions = Object.keys(jewel.positions)
    .map(Number)
    .sort((one, other) => one - other);
  if (positions.length > 0) lines.push(`passives: ${positions.map((position) => positionValue.print([position, jewel.positions[position]])).join(', ')}`);
  if (jewel.modSlots !== DEFAULT_MOD_SLOTS) lines.push(`mod-slots: ${jewel.modSlots}`);
  return lines.join('\n');
}

function actionSection(moduleId: string, action: ActionDeclaration): string {
  const [, ...body] = actionLines({ ...action, label: action.label });
  // A generated label is `humanizeEn` of the id, which the loader makes again;
  // printing it would make the placeholder authored on the next load.
  const title = action.generatedLabel ? [] : [`title: ${action.label}`];
  return [`# action ${moduleLocalId(moduleId, action.id)}`, ...title, ...body.map((line) => line.replace(/^ {2}/, ''))].join('\n');
}

function eventSection(registry: Registry, moduleId: string, event: GameEvent): string {
  return [`# event ${moduleLocalId(moduleId, event.id)}`, ...titleLine(registry, moduleId, 'event', event), ...(event.resource ? [`resource: ${event.resource}`] : []), `trigger: ${event.trigger}`].join('\n');
}

function factionSection(registry: Registry, moduleId: string, faction: Faction): string {
  return [`# faction ${moduleLocalId(moduleId, faction.id)}`, ...titleLine(registry, moduleId, 'faction', faction)].join('\n');
}

// The bare line a `# skill` carries one of per thing that trains it.
const grantLine = (grant: SkillGrant): string => skillGrant.print(grant);



function entitySection(registry: Registry, moduleId: string, entity: Entity): string {
  const lines = [`# entity ${moduleLocalId(moduleId, entity.id)}`];
  titled(lines, registry, moduleId, 'entity', entity);
  if (entity.aggressive) lines.push('aggressive');
  if (entity.hiddenIf) lines.push(`hidden if: ${condition.print(entity.hiddenIf)}`);
  if (entity.respawnAfter !== undefined) lines.push(`respawn after: ${duration.print(entity.respawnAfter)}`);
  block(lines, 'stations', entity.capabilities);
  const stats = Object.entries(entity.stats).map((assignment) => statAssignmentValue.print(assignment));
  if (stats.length > 0) lines.push(`stats: ${stats.join(', ')}`);
  if (entity.skills.length > 0) lines.push(`skills: ${entity.skills.join(', ')}`);
  if (entity.passives.length > 0) lines.push(`passives: ${entity.passives.join(', ')}`);
  if (entity.equipmentSlots.length > 0) lines.push(`equipment-slots: ${entity.equipmentSlots.join(', ')}`);
  if (entity.uses.length > 0) lines.push(`uses: ${entity.uses.join(', ')}`);
  if (entity.faction.length > 0) lines.push(`faction: ${entity.faction.join(', ')}`);
  if (entity.allies.length > 0) lines.push(`allies: ${entity.allies.map((each) => allyValue.print(each)).join(', ')}`);
  block(lines, 'flags', entity.flags);
  hookLines(lines, entity);
  // As authored: `actions` and `handlers` are what the linker made of these, and
  // printing those instead would write an entity's inherited actions into it.
  for (const authored of entity.blocks) lines.push(...actionLines(authored));
  return lines.join('\n');
}

function locationSection(registry: Registry, moduleId: string, location: Location): string {
  const lines = [`# location ${moduleLocalId(moduleId, location.id)}`];
  if (location.relative) lines.push(relativeValue.print(location.relative));
  else lines.push(`x: ${location.x}, y: ${location.y}, z: ${location.z}`);
  titled(lines, registry, moduleId, 'location', location);
  if (location.starting) lines.push('starting');
  block(lines, 'entities', location.entities.map((each) => populationValue.print(each)));
  block(
    lines,
    'adjacent',
    location.adjacent.map((each) => edgeValue.print(each)),
  );
  block(lines, 'flags', location.flags);
  for (const action of location.actions) lines.push(...actionLines(action));
  return lines.join('\n');
}

function recipeSection(moduleId: string, recipe: Recipe): string {
  const lines = [`# recipe ${moduleLocalId(moduleId, recipe.id)}`];
  if (recipe.requiresCapability) lines.push(`station: ${recipe.requiresCapability}`);
  block(lines, 'in', recipe.in.map((each) => quantified.print(each)));
  block(lines, 'out', recipe.out.map((each) => produced.print(each)));
  if (recipe.skill) lines.push(`skill: ${recipeSkillValue.print(recipe.skill)}`);
  if (recipe.say) lines.push(`say: ${recipe.say}`);
  if (recipe.time !== undefined) lines.push(`time: ${recipe.time}`);
  if (recipe.rate !== undefined) lines.push(`rate: ${recipe.rate}`);
  if (recipe.accuracy) lines.push(`accuracy: ${recipe.accuracy}`);
  if (recipe.evasion) lines.push(`evasion: ${recipe.evasion}`);
  block(lines, 'burnt', recipe.burnt.map((each) => produced.print(each)));
  return lines.join('\n');
}

function resourceSection(registry: Registry, moduleId: string, resource: Resource): string {
  const lines = [`# resource ${moduleLocalId(moduleId, resource.id)}`];
  lines.push(...titleLine(registry, moduleId, 'resource', resource));
  if (resource.rate) lines.push(`rate: ${resource.rate}`);
  lines.push(`max: ${resource.max}`);
  if (resource.start !== undefined) lines.push(`start: ${resource.start}`);
  lines.push(`display: ${resource.display}`);
  return lines.join('\n');
}

function dropTableSection(moduleId: string, table: DropTable): string {
  return [`# droptable ${moduleLocalId(moduleId, table.id)}`, ...table.results.flatMap(resultLines)].join('\n');
}

function dialogueSection(moduleId: string, dialogue: Dialogue): string {
  const lines = [`# dialogue ${moduleLocalId(moduleId, dialogue.id)}`];
  if (dialogue.owner) lines.push(`owner = ${dialogue.owner}`);
  for (const node of dialogue.nodes) {
    if (lines.length > 1) lines.push('');
    lines.push(`node ${node.name}:`);
    if (node.when) lines.push(`  when: ${condition.print(node.when)}`);
    if (node.once) lines.push('  once');
    if (node.sticky) lines.push('  sticky');
    if (node.again) lines.push(`  again: ${printSegments(node.again.segments)}`);
    for (const step of node.steps) {
      if (step.kind === 'say') lines.push(`  ${printSegments(step.segments)}`);
      else if (step.kind === 'effect') lines.push(...indentLines(resultLines(step.result)));
      else if (step.kind === 'goto') lines.push(`  goto ${step.target}`);
      else {
        for (const choice of step.choices) {
          lines.push(`  -> ${printSegments(choice.segments)}${choice.when ? ` (when ${condition.print(choice.when)})` : ''}`);
          if (choice.goto) lines.push(`    goto ${choice.goto}`);
          for (const effect of choice.effects) lines.push(...indentLines(resultLines(effect), 4));
        }
      }
    }
  }
  return lines.join('\n');
}

function saveSection(moduleId: string, id: string, save: ParsedSave): string {
  return [`# save ${moduleLocalId(moduleId, id)}`, JSON.stringify({ version: save.version, ...save.diff })].join('\n');
}

function testSection(moduleId: string, test: Test): string {
  return [`# test ${moduleLocalId(moduleId, test.id)}`, ...test.directives.map(printDirective)].join('\n');
}

function infoLines(info: SerializeModuleOptions['info']): Lines {
  const lines = [`# info ${info.id}`];
  const version: Version = info.version ?? [0, 0, 0];
  lines.push(`version: ${versionParser.print(version)}`);
  if (info.pack) lines.push(`pack: ${info.pack}`);
  if (info.language !== undefined && info.language !== DEFAULT_LANGUAGE) lines.push(`language: ${info.language}`);
  if (info.dependencies && info.dependencies.length > 0) lines.push('dependencies:', ...indentLines(info.dependencies.map((each) => dependency.print(each))));
  return lines;
}

function inModule(moduleId: string, id: string): boolean {
  return id.startsWith(`${moduleId}.`);
}

// A section this module prints, beside the key it hangs under. Every registry
// map is keyed by the id its value declares, except `saves`, whose value has no
// id of its own — so the key is what both the own-module filter and the printer
// read, and neither has to know which kind is the exception.
interface Printed {
  id: string;
  section: ModuleSection;
}

const mapOf = (registry: Registry, kind: SectionKind): ReadonlyMap<string, object> => registry[registryMapOf(kind)!] as ReadonlyMap<string, object>;

// What a module prints, in the order it prints it, walked off the row rather
// than written out as one loop per kind. A kind added to the row is carried by
// this walk with no edit, which is the whole repair: `# passive` was parsed for
// a day and a half while a loop nobody remembered to add discarded it.
function printedSections(registry: Registry, options: SerializeModuleOptions): Printed[] {
  const moduleId = options.info.id;
  const printed: Printed[] = [];
  let globalsDone = false;
  for (const kind of SECTION_KINDS) {
    const row = SECTION_KIND[kind];
    // A global id belongs to nobody, so the module says which it declared and
    // the whole group prints in that one order — by id, across the kinds,
    // rather than kind by kind. Emitted where the row first reaches a global
    // kind, which is what keeps the group's place in the order the row's.
    if (row.ids === 'global') {
      if (globalsDone) continue;
      globalsDone = true;
      for (const id of options.globals ?? []) {
        for (const global of GLOBAL_SECTION_KINDS) {
          const value = mapOf(registry, global).get(id);
          if (value !== undefined) printed.push({ id, section: sectionOf(global, value) });
        }
      }
      continue;
    }
    // A locale belongs to the module that wrote it rather than to any id, so it
    // is printed by attribution and never by `inModule`.
    if (kind === 'locale') {
      for (const declared of moduleLocaleSections(registry.locales, moduleId)) printed.push({ id: declared.language, section: sectionOf('locale', declared) });
      continue;
    }
    if (row.map === null) continue;
    for (const [id, value] of mapOf(registry, kind)) if (inModule(moduleId, id)) printed.push({ id, section: sectionOf(kind, value) });
  }
  return printed;
}

// One section's text. Total over the kinds by a `never` guard, so a kind the
// row declares and this cannot print is a compile error rather than a section
// that disappears on republish.
function sectionText(registry: Registry, moduleId: string, { id, section }: Printed): string {
  const value = section.value;
  switch (section.kind) {
    case 'stat': {
      const stat = value as Stat;
      return [`# stat ${moduleLocalId(moduleId, stat.id)}`, ...titleLine(registry, moduleId, 'stat', stat), `base: ${range.print(stat.base)}`].join('\n');
    }
    case 'skill': {
      const skill = value as Skill;
      return [
        `# skill ${moduleLocalId(moduleId, skill.id)}`,
        ...titleLine(registry, moduleId, 'skill', skill),
        ...(skill['stat-id'] ? [`stat-id: ${skill['stat-id']}`] : []),
        ...(skill['per-level'] ? [`per-level: ${bonusAmount.print(skill['per-level'])}`] : []),
        ...skill.grants.map(grantLine),
      ].join('\n');
    }
    case 'item':
      return itemSection(registry, moduleId, value as Item);
    case 'passive':
      return passiveSection(registry, moduleId, value as Passive);
    case 'cluster-jewel':
      return clusterJewelSection(registry, moduleId, value as ClusterJewel);
    case 'faction':
      return factionSection(registry, moduleId, value as Faction);
    case 'event':
      return eventSection(registry, moduleId, value as GameEvent);
    case 'action':
      return actionSection(moduleId, value as ActionDeclaration);
    case 'entity':
      return entitySection(registry, moduleId, value as Entity);
    case 'location':
      return locationSection(registry, moduleId, value as Location);
    case 'recipe':
      return recipeSection(moduleId, value as Recipe);
    case 'resource':
      return resourceSection(registry, moduleId, value as Resource);
    case 'droptable':
      return dropTableSection(moduleId, value as DropTable);
    case 'dialogue':
      return dialogueSection(moduleId, value as Dialogue);
    case 'flag':
      return `# flag ${moduleLocalId(moduleId, (value as Flag).id)}`;
    case 'slot': {
      const slot = value as Slot;
      return [`# slot ${slot.id}`, ...slotTitleLine(registry, slot)].join('\n');
    }
    case 'variable': {
      const variable = value as Variable;
      return [`# variable ${variable.id}`, ...(variable.value !== undefined ? [`value: ${variable.value}`] : [])].join('\n');
    }
    case 'locale': {
      const declared = value as LocaleDeclaration;
      return [`# locale ${declared.language}`, ...declared.entries.map((entry) => `${entry.key}: ${entry.value}`)].join('\n');
    }
    case 'save':
      return saveSection(moduleId, id, value as ParsedSave);
    case 'test':
      return testSection(moduleId, value as Test);
    // Neither is a section a module prints back: the header is `infoLines`
    // above, written from the options rather than from the registry, and a
    // `# remove` is spent at merge and leaves nothing behind to print.
    case 'info':
    case 'remove':
      throw new Error(`# ${section.kind} is not a section a printed module carries`);
    default: {
      const unreached: never = section;
      void unreached;
      return '';
    }
  }
}

// Not exported, so that printed content cannot leave this file without the
// comparison the three round trips below make of it.
function serializeRegistryModule(registry: Registry, options: SerializeModuleOptions): string {
  const sections = printedSections(registry, options).map((each) => sectionText(registry, options.info.id, each));
  return [infoLines(options.info).join('\n'), ...sections].join('\n\n').trimEnd() + '\n';
}

export interface RoundTrip {
  printed: string;
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

export function declaredGlobalIds(module: ParsedModule): string[] {
  return module.sections
    .filter((section) => GLOBAL_SECTION_KINDS.includes(section.kind))
    .map((section) => (section.value as { id: string }).id)
    .sort();
}

function compare(loaded: Registry, printed: string, checked: UniverseLoadResult): RoundTrip {
  if (checked.diagnostics.length > 0) return { printed, diagnostics: checked.diagnostics, differences: [] };
  return { printed, diagnostics: [], differences: registryDiff(loaded, checked.registry) };
}

// The reload is supplied rather than performed: a caller decides which other
// sources the printed module is reloaded beside, and squashing reloads against
// a different set than probing does.
export function roundTripModule(loaded: Registry, options: SerializeModuleOptions, reload: (printed: string) => UniverseLoadResult): RoundTrip {
  const printed = serializeRegistryModule(loaded, options);
  return compare(loaded, printed, reload(printed));
}

export interface Republished {
  // Null when the round trip refused, which is a caller's cue to publish the
  // author's own bytes rather than a print that would lose something.
  printed: string | null;
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

// A module serialized under an id other than the one it loaded under. The round
// trip is taken first and under the loaded id, because that is the only
// comparison whose two sides hold the same keys: renaming a module moves the
// compiled locale keys and inline action ids with it, and a diff against a
// hand-renamed registry reports every one of those as a loss. What the trip
// proves is the thing the rename does not touch — that the serializer carries
// this module whole, which is what an edit to another module's content is not.
export function republishModule(
  loaded: Registry,
  options: SerializeModuleOptions,
  reload: (printed: string) => UniverseLoadResult,
  as: { registry: Registry; options: SerializeModuleOptions },
): Republished {
  const trip = roundTripModule(loaded, options, reload);
  if (trip.diagnostics.length > 0 || trip.differences.length > 0) return { printed: null, diagnostics: trip.diagnostics, differences: trip.differences };
  return { printed: serializeRegistryModule(as.registry, as.options), diagnostics: [], differences: [] };
}

// Deliberately not a RoundTrip. A universe has no single reloadable text — the
// concatenation of several modules declares `# info` more than once and will not
// load — so `printed` would carry a second meaning on an inherited field.
export interface UniverseRoundTrip {
  sources: ModuleSource[];
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

// Every source is replaced at once. A module is serialized from the merged
// registry, so it already carries what other modules did to its ids; leaving any
// original source in the reload would apply those edits a second time.
export function roundTripUniverse(loaded: Registry, modules: readonly ParsedModule[], reload: (printed: readonly ModuleSource[]) => UniverseLoadResult): UniverseRoundTrip {
  const sources = modules.map((module) => ({ ...module.source, text: serializeRegistryModule(loaded, { info: module.info, globals: declaredGlobalIds(module) }) }));
  const { diagnostics, differences } = compare(loaded, '', reload(sources));
  return { sources, diagnostics, differences };
}

export const canSerialize = (module: ParsedModule): boolean => module.namespace !== null;
