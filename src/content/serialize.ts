import { Action, Contest, Sided } from '../grammar/action';
import { ActionResult, DropRow, nestedResults } from '../grammar/actionResult';
import { Condition, Reference } from '../grammar/condition';
import { formatDependency, formatVersion, Version } from '../grammar/dependency';
import { HookCarrier } from '../grammar/hook';
import { isPoint, Range, scaleRange } from '../grammar/range';
import { BonusAmount, TagClause } from '../grammar/tagClause';
import { Produced, Quantified } from '../grammar/values';
import { Dialogue, TextSegment } from './dialogue';
import { DropTable } from './dropTable';
import { ActionDeclaration } from './action';
import { Entity } from './entity';
import { GameEvent } from './event';
import { ClusterJewel, DEFAULT_MOD_SLOTS } from './clusterJewel';
import { Passive } from './passive';
import { Faction } from './faction';
import { DEFAULT_MAX_LEVEL, Item } from './item';
import { Location, Population } from './location';
import { Recipe } from './recipe';
import { Registry } from './registry';
import { Resource } from './resource';
import { ParsedSave } from './saveSection';
import { Test, Directive } from './test';
import { hexKey } from './hex';
import { ModuleInfo } from './info';

type Lines = string[];

export interface SerializeModuleOptions {
  info: Pick<ModuleInfo, 'id'> & Partial<Pick<ModuleInfo, 'version' | 'dependencies' | 'pack'>>;
  globalVariables?: readonly string[];
}

const n = (value: number): string => String(value);

function range(value: Range): string {
  return isPoint(value) ? n(value.min) : `${n(value.min)}-${n(value.max)}`;
}

function ref(value: Reference): string {
  return value.path.join('.');
}

function condition(value: Condition): string {
  switch (value.kind) {
    case 'reference':
      return ref(value.reference);
    case 'comparison':
      return `${ref(value.left)} ${value.operator} ${n(value.right)}`;
    case 'has':
      return value.count === 1 ? `has ${value.item}` : `has ${n(value.count)} ${value.item}`;
    case 'not':
      return `not ${condition(value.condition)}`;
    case 'and':
    case 'or':
      return value.conditions.map(condition).join(` ${value.kind} `);
  }
}

function quantified(value: Quantified): string {
  return value.amount === undefined ? value.item : `${n(value.amount)} ${value.item}`;
}

// The no-draw reader of a produced amount: the range as written, not a sample of
// it. `sampleCount` is the other half of the same fork.
function producedQuantity(value: Produced): string {
  return value.amount === undefined ? value.item : `${range(value.amount)} ${value.item}`;
}

function result(value: ActionResult): string {
  switch (value.kind) {
    case 'say':
      return `say: ${value.text}`;
    case 'set':
      return `set: ${value.variable}`;
    case 'unset':
      return `unset: ${value.variable}`;
    case 'add':
      return `add: ${value.variable} ${n(value.amount)}`;
    case 'give':
      return `give: ${producedQuantity(value)}`;
    case 'take':
      return `take: ${quantified({ item: value.item, amount: value.amount })}`;
    case 'xp':
      return `xp: ${value.skill} ${range(value.amount)}`;
    case 'relocate':
      return `relocate: ${value.location}`;
    case 'discover':
      return `discover: ${value.location}`;
    case 'open-modal':
      return `open modal: ${value.modal}`;
    case 'pool': {
      // The exact inverse of what `parsePool` did: it scaled the written
      // magnitude by the verb's sign, so undoing it is the same scale again.
      // Taking abs of each bound instead inverted a restore's range — a
      // symmetric operation on a point, which is why nothing saw it.
      const magnitude = value.delta.max < 0 ? scaleRange(value.delta, -1) : value.delta;
      // The preposition follows the verb, so it is re-derived from the sign
      // rather than held: two fields agreeing by convention can disagree.
      const party = value.party === undefined ? '' : ` ${value.delta.max < 0 ? 'from' : 'to'} ${value.party}`;
      return `${value.delta.max < 0 ? 'drain' : 'restore'}: ${range(magnitude)} ${value.resource}${party}`;
    }
    case 'roll':
      return `roll: ${value.table}`;
    case 'stop':
      return 'stop';
    // A wrapper is never one line, so it has no spelling here; resultLines owns
    // it and the guard below is what stops a caller reaching this arm.
    case 'chance':
    case 'contest':
    case 'gate':
    case 'credit':
    case 'one-of':
      throw new Error(`a ${value.kind} result spans lines and cannot be inlined`);
  }
}

const side = (value: number | string): string => (typeof value === 'string' ? value : n(value));

function rowLines(row: DropRow): Lines {
  const gate = row.requires ? ` if ${condition(row.requires)}` : '';
  const label = `${typeof row.weight === 'string' ? row.weight : `${n(row.weight)}x`}${gate}:`;
  if (row.results.length === 0) return [`${label} nothing`];
  return [label, ...indented(row.results.flatMap(resultLines))];
}

// A wrapper prints as its selector over an indented body, which is the one form
// that reloads: the inline form cannot carry a nested block.
function resultLines(value: ActionResult): Lines {
  switch (value.kind) {
    case 'chance':
      return [`${n(value.numerator)} in ${n(value.denominator)}:`, ...indented(value.results.flatMap(resultLines))];
    case 'contest':
      return [`${side(value.left)} vs ${side(value.right)}:`, ...indented(value.results.flatMap(resultLines))];
    case 'gate':
      return [`if ${condition(value.condition)}:`, ...indented(value.results.flatMap(resultLines))];
    case 'credit':
      return ['credit:', ...indented(value.results.flatMap(resultLines))];
    case 'one-of':
      return ['one of:', ...indented(value.rows.flatMap(rowLines))];
    default:
      return [result(value)];
  }
}

const spansLines = (values: readonly ActionResult[] | undefined): boolean => (values ?? []).some((value) => nestedResults(value).length > 0);

function results(values: readonly ActionResult[] | undefined): string {
  return (values ?? []).map(result).join(', ');
}

function duration(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  const minutes = Math.floor(seconds / 60);
  const left = seconds - minutes * 60;
  return minutes > 0 ? `${minutes}m${left}s` : `${left}s`;
}

function bonusAmount(value: BonusAmount): string {
  if (value.percent) {
    const sign = value.amount < 0 ? '-' : '+';
    return `${sign}${n(Math.abs(value.amount))}%`;
  }
  const sign = value.amount.min < 0 || value.amount.max < 0 ? '-' : '+';
  const lo = Math.min(Math.abs(value.amount.min), Math.abs(value.amount.max));
  const hi = Math.max(Math.abs(value.amount.min), Math.abs(value.amount.max));
  return lo === hi ? `${sign}${n(lo)}` : `${sign}${n(lo)}-${n(hi)}`;
}

function tag(value: TagClause): string {
  switch (value.kind) {
    case 'keyword':
      return value.value;
    case 'duration':
      return duration(value.seconds);
    case 'stat-bonus':
      return `${bonusAmount(value)} ${value.statId}${value.per === undefined ? '' : ` per ${value.per}`}`;
  }
}

function indented(lines: readonly string[], spaces = 2): Lines {
  const pad = ' '.repeat(spaces);
  return lines.map((line) => `${pad}${line}`);
}

function block(lines: Lines, label: string, values: readonly string[]): void {
  if (values.length === 0) return;
  lines.push(`${label}:`, ...indented(values));
}

function resultBlock(lines: Lines, label: string, values: readonly ActionResult[] | undefined, childSpaces = 2): void {
  if (!values || values.length === 0) return;
  lines.push(`${label}:`, ...indented(values.flatMap(resultLines), childSpaces));
}

// Printed by every carrier, so a kind that joins the gather prints its hooks by
// calling this rather than by growing its own copy of the two labels.
function hookLines(lines: Lines, carrier: HookCarrier): void {
  resultBlock(lines, 'on hit', carrier.onHit);
  resultBlock(lines, 'when hit', carrier.whenHit);
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

  if (!modifiers && action.results.length === 1 && !spansLines(action.results)) return [`${action.label}: ${results(action.results)}`];

  // A `+` line adds to what this block overlays, so the marker is part of the
  // field rather than of the value, and dropping it would turn an addition into
  // a replacement on reload.
  const appended = new Set(action.appended ?? []);
  const at = (name: keyof Action): string => (appended.has(name) ? '  +' : '  ');
  const lines = [`${action.label}:`];
  if (action.requires) lines.push(`${at('requires')}requires: ${condition(action.requires)}`);
  if (action.hiddenIf) lines.push(`${at('hiddenIf')}hidden if: ${condition(action.hiddenIf)}`);
  if (action.kind !== undefined && action.kind !== 'duration') lines.push(`  ${action.kind}`);
  // The tags the kind above already spells; re-emitting one would round-trip
  // into a second copy of the same fact.
  const lifted = new Set(['instant', 'continuous']);
  const tags = (action.tags ?? []).filter((each) => each.kind !== 'keyword' || !lifted.has(each.value));
  if (tags.length > 0) lines.push(`  ${tags.map(tag).join(', ')}`);
  if (action.time !== undefined) lines.push(`  time: ${n(action.time)}`);
  if (action.rate !== undefined) lines.push(`  rate: ${typeof action.rate === 'number' ? n(action.rate) : sided(action.rate)}`);
  if (action.accuracy) lines.push(`  accuracy: ${contest(action.accuracy)}`);
  if (action.damage) lines.push(`  damage: ${contest(action.damage)}`);
  if (action.depletes) lines.push(`  depletes: ${sided(action.depletes)}`);
  if (action.attempts !== undefined) lines.push(`  attempts: ${n(action.attempts)}`);
  lines.push(...indented(action.results.flatMap(resultLines)));
  resultBlock(lines, `${at('onSuccess')}on success`, action.onSuccess, 4);
  resultBlock(lines, `${at('onFailure')}on failure`, action.onFailure, 4);
  resultBlock(lines, `${at('onUnfinished')}on unfinished`, action.onUnfinished, 4);
  return lines;
}

function textSegments(values: readonly TextSegment[] | undefined): string {
  return (values ?? [])
    .map((segment) => {
      if (segment.kind === 'literal') return segment.text;
      if (segment.kind === 'interpolate') return `{${ref(segment.reference)}}`;
      return `{${condition(segment.condition)}: ${segment.text}}`;
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
      return `use: ${value.obj}.${value.objId}.${value.actionId}`;
    case 'use-on':
      return `use: ${value.action} on ${value.target}`;
    case 'travel':
      return `travel: ${value.location}`;
    case 'craft':
      return `craft: ${value.recipe}`;
    case 'begin':
      return `begin: ${inlined(value.inner, value.inner.kind === 'use-on' ? 'use' : value.inner.kind)}`;
    case 'refuse':
      return `refuse: ${inlined(value.inner)}`;
    case 'assert':
      return `assert: ${condition(value.condition)}`;
    case 'expect':
      return `expect: ${value.save}`;
    case 'load':
      return `load: ${value.save}`;
    case 'cancel':
      return 'cancel';
    case 'wait':
      return `wait: ${n(value.seconds)}`;
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
  }
}

function moduleLocalId(moduleId: string, id: string): string {
  return id.startsWith(`${moduleId}.`) ? id.slice(moduleId.length + 1) : id;
}

function titled(lines: Lines, value: { title?: string; examine?: string }): void {
  if (value.title !== undefined) lines.push(`title: ${value.title}`);
  if (value.examine !== undefined) lines.push(`examine: ${value.examine}`);
}

function itemSection(moduleId: string, item: Item): string {
  const lines = [`# item ${moduleLocalId(moduleId, item.id)}`];
  titled(lines, item);
  if (item.slot) lines.push(`slot: ${item.slot}`);
  if (item.tags && item.tags.length > 0) lines.push(item.tags.map(tag).join(', '));
  if (item.clusterJewel) lines.push(`cluster-jewel: ${item.clusterJewel}`);
  if (item.originCluster) lines.push(`origin-cluster: ${item.originCluster}`);
  if (item.clusterEffect) lines.push(`cluster-effect: ${item.clusterEffect.percent < 0 ? '-' : '+'}${Math.abs(item.clusterEffect.percent)}% ${item.clusterEffect.statId}`);
  if (item.itemExperience !== undefined) lines.push(`item-experience: ${n(item.itemExperience)}`);
  if (item.maxLevel !== DEFAULT_MAX_LEVEL) lines.push(`max-level: ${n(item.maxLevel)}`);
  hookLines(lines, item);
  for (const action of item.actions ?? []) lines.push(...actionLines(action));
  return lines.join('\n');
}

function passiveSection(moduleId: string, passive: Passive): string {
  const lines = [`# passive ${moduleLocalId(moduleId, passive.id)}`];
  titled(lines, passive);
  if (passive.tags.length > 0) lines.push(passive.tags.map(tag).join(', '));
  return lines.join('\n');
}

function clusterJewelSection(moduleId: string, jewel: ClusterJewel): string {
  const lines = [`# cluster-jewel ${moduleLocalId(moduleId, jewel.id)}`];
  titled(lines, jewel);
  lines.push(`shape: ${jewel.shape}`);
  lines.push(`open-connections: ${jewel.openConnections.join(', ')}`);
  const positions = Object.keys(jewel.positions)
    .map(Number)
    .sort((one, other) => one - other);
  if (positions.length > 0) lines.push(`passives: ${positions.map((position) => `${n(position)} ${jewel.positions[position]}`).join(', ')}`);
  if (jewel.modSlots !== DEFAULT_MOD_SLOTS) lines.push(`mod-slots: ${n(jewel.modSlots)}`);
  return lines.join('\n');
}

function actionSection(moduleId: string, action: ActionDeclaration): string {
  const [, ...body] = actionLines({ ...action, label: action.label });
  return [`# action ${moduleLocalId(moduleId, action.id)}`, `title: ${action.label}`, ...body.map((line) => line.replace(/^ {2}/, ''))].join('\n');
}

function eventSection(moduleId: string, event: GameEvent): string {
  return [`# event ${moduleLocalId(moduleId, event.id)}`, `title: ${event.title}`, `resource: ${event.resource}`, `trigger: ${event.trigger}`].join('\n');
}

function factionSection(moduleId: string, faction: Faction): string {
  return [`# faction ${moduleLocalId(moduleId, faction.id)}`, `title: ${faction.title}`].join('\n');
}

const population = (value: Population): string => (value.count === undefined ? value.entity : `${n(value.count)} ${value.entity}`);

function entitySection(moduleId: string, entity: Entity): string {
  const lines = [`# entity ${moduleLocalId(moduleId, entity.id)}`];
  titled(lines, entity);
  if (entity.aggressive) lines.push('aggressive');
  if (entity.hiddenIf) lines.push(`hidden if: ${condition(entity.hiddenIf)}`);
  if (entity.respawnAfter !== undefined) lines.push(`respawn after: ${duration(entity.respawnAfter)}`);
  block(lines, 'stations', entity.capabilities);
  const stats = Object.entries(entity.stats).map(([statId, value]) => `${statId} ${range(value)}`);
  if (stats.length > 0) lines.push(`stats: ${stats.join(', ')}`);
  if (entity.skills.length > 0) lines.push(`skills: ${entity.skills.join(', ')}`);
  if (entity.equipmentSlots.length > 0) lines.push(`equipment-slots: ${entity.equipmentSlots.join(', ')}`);
  if (entity.uses.length > 0) lines.push(`uses: ${entity.uses.join(', ')}`);
  if (entity.faction.length > 0) lines.push(`faction: ${entity.faction.join(', ')}`);
  if (entity.allies.length > 0) lines.push(`allies: ${entity.allies.map((ally) => (ally.count === undefined ? ally.entity : `${n(ally.count)} ${ally.entity}`)).join(', ')}`);
  block(lines, 'flags', entity.flags);
  hookLines(lines, entity);
  // As authored: `actions` and `handlers` are what the linker made of these, and
  // printing those instead would write an entity's inherited actions into it.
  for (const authored of entity.blocks) lines.push(...actionLines(authored));
  return lines.join('\n');
}

function locationSection(moduleId: string, location: Location): string {
  const lines = [`# location ${moduleLocalId(moduleId, location.id)}`];
  if (location.relative) lines.push(`${location.relative.direction} of ${location.relative.of}`);
  else lines.push(`x: ${n(location.x)}, y: ${n(location.y)}, z: ${n(location.z)}`);
  titled(lines, location);
  if (location.starting) lines.push('starting');
  block(lines, 'entities', location.entities.map(population));
  block(
    lines,
    'adjacent',
    location.adjacent.map((edge) => (edge.condition ? `${edge.target} while ${condition(edge.condition)}` : edge.target)),
  );
  block(lines, 'flags', location.flags);
  for (const action of location.actions) lines.push(...actionLines(action));
  return lines.join('\n');
}

function recipeSection(moduleId: string, recipe: Recipe): string {
  const lines = [`# recipe ${moduleLocalId(moduleId, recipe.id)}`];
  if (recipe.requiresCapability) lines.push(`station: ${recipe.requiresCapability}`);
  block(lines, 'in', recipe.in.map(quantified));
  block(lines, 'out', recipe.out.map(producedQuantity));
  if (recipe.skill) lines.push(`skill: ${recipe.skill.skill} ${n(recipe.skill.amount)}`);
  if (recipe.say) lines.push(`say: ${recipe.say}`);
  if (recipe.time !== undefined) lines.push(`time: ${n(recipe.time)}`);
  if (recipe.rate !== undefined) lines.push(`rate: ${typeof recipe.rate === 'string' ? recipe.rate : n(recipe.rate)}`);
  if (recipe.accuracy) lines.push(`accuracy: ${recipe.accuracy}`);
  if (recipe.evasion) lines.push(`evasion: ${recipe.evasion}`);
  block(lines, 'burnt', recipe.burnt.map(producedQuantity));
  return lines.join('\n');
}

function resourceSection(moduleId: string, resource: Resource): string {
  const lines = [`# resource ${moduleLocalId(moduleId, resource.id)}`];
  lines.push(`title: ${resource.title}`);
  if (resource.rate) lines.push(`rate: ${resource.rate}`);
  lines.push(`max: ${resource.max}`);
  if (resource.start !== undefined) lines.push(`start: ${n(resource.start)}`);
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
    if (node.when) lines.push(`  when: ${condition(node.when)}`);
    if (node.once) lines.push('  once');
    if (node.sticky) lines.push('  sticky');
    if (node.again) lines.push(`  again: ${textSegments(node.again)}`);
    for (const step of node.steps) {
      if (step.kind === 'say') lines.push(`  ${textSegments(step.segments)}`);
      else if (step.kind === 'effect') lines.push(...indented(resultLines(step.result)));
      else if (step.kind === 'goto') lines.push(`  goto ${step.target}`);
      else {
        for (const choice of step.choices) {
          lines.push(`  -> ${textSegments(choice.segments)}${choice.when ? ` (when ${condition(choice.when)})` : ''}`);
          if (choice.goto) lines.push(`    goto ${choice.goto}`);
          for (const effect of choice.effects) lines.push(...indented(resultLines(effect), 4));
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
  lines.push(`version: ${formatVersion(version)}`);
  if (info.pack) lines.push(`pack: ${info.pack}`);
  if (info.dependencies && info.dependencies.length > 0) lines.push('dependencies:', ...indented(info.dependencies.map(formatDependency)));
  return lines;
}

function inModule(moduleId: string, id: string): boolean {
  return id.startsWith(`${moduleId}.`);
}

export function serializeRegistryModule(registry: Registry, options: SerializeModuleOptions): string {
  const moduleId = options.info.id;
  const sections: string[] = [];
  for (const stat of registry.stats.values()) if (inModule(moduleId, stat.id)) sections.push([`# stat ${moduleLocalId(moduleId, stat.id)}`, `title: ${stat.title}`, `base: ${range(stat.base)}`].join('\n'));
  for (const skill of registry.skills.values())
    if (inModule(moduleId, skill.id))
      sections.push(
        [`# skill ${moduleLocalId(moduleId, skill.id)}`, `title: ${skill.title}`, ...(skill['stat-id'] ? [`stat-id: ${skill['stat-id']}`] : []), ...(skill['per-level'] ? [`per-level: ${bonusAmount(skill['per-level'])}`] : [])].join('\n'),
      );
  for (const item of registry.items.values()) if (inModule(moduleId, item.id)) sections.push(itemSection(moduleId, item));
  for (const passive of registry.passives.values()) if (inModule(moduleId, passive.id)) sections.push(passiveSection(moduleId, passive));
  for (const jewel of registry.clusterJewels.values()) if (inModule(moduleId, jewel.id)) sections.push(clusterJewelSection(moduleId, jewel));
  for (const faction of registry.factions.values()) if (inModule(moduleId, faction.id)) sections.push(factionSection(moduleId, faction));
  for (const event of registry.events.values()) if (inModule(moduleId, event.id)) sections.push(eventSection(moduleId, event));
  for (const action of registry.actions.values()) if (inModule(moduleId, action.id)) sections.push(actionSection(moduleId, action));
  for (const entity of registry.entities.values()) if (inModule(moduleId, entity.id)) sections.push(entitySection(moduleId, entity));
  for (const location of registry.locations.values()) if (inModule(moduleId, location.id)) sections.push(locationSection(moduleId, location));
  for (const recipe of registry.recipes.values()) if (inModule(moduleId, recipe.id)) sections.push(recipeSection(moduleId, recipe));
  for (const resource of registry.resources.values()) if (inModule(moduleId, resource.id)) sections.push(resourceSection(moduleId, resource));
  for (const table of registry.dropTables.values()) if (inModule(moduleId, table.id)) sections.push(dropTableSection(moduleId, table));
  for (const dialogue of registry.dialogues.values()) if (inModule(moduleId, dialogue.id)) sections.push(dialogueSection(moduleId, dialogue));
  for (const flag of registry.flags.values()) if (inModule(moduleId, flag.id)) sections.push(`# flag ${moduleLocalId(moduleId, flag.id)}`);
  for (const variableId of options.globalVariables ?? []) {
    const variable = registry.variables.get(variableId);
    if (variable) sections.push([`# variable ${variable.id}`, ...(variable.value !== undefined ? [`value: ${n(variable.value)}`] : [])].join('\n'));
  }
  for (const [id, save] of registry.saves) if (inModule(moduleId, id)) sections.push(saveSection(moduleId, id, save));
  for (const test of registry.tests.values()) if (inModule(moduleId, test.id)) sections.push(testSection(moduleId, test));
  return [infoLines(options.info).join('\n'), ...sections].join('\n\n').trimEnd() + '\n';
}
