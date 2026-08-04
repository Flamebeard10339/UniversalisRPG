import { Action } from '../grammar/action';
import { ActionResult, DropRow, nestedResults } from '../grammar/actionResult';
import { Condition, Reference } from '../grammar/condition';
import { formatDependency, formatVersion, Version } from '../grammar/dependency';
import { isPoint, Range } from '../grammar/range';
import { TagClause } from '../grammar/tagClause';
import { Produced, Quantified } from '../grammar/values';
import { Dialogue, TextSegment } from './dialogue';
import { DropTable } from './dropTable';
import { Entity } from './entity';
import { EntityType } from './entityType';
import { Item } from './item';
import { Location } from './location';
import { Recipe } from './recipe';
import { Registry } from './registry';
import { sameValue } from './registryDiff';
import { Resource } from './resource';
import { ParsedSave } from './saveSection';
import { Test, Directive } from './test';
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
      const magnitude = { min: Math.abs(value.delta.max), max: Math.abs(value.delta.min) };
      return `${value.delta.max < 0 ? 'drain' : 'restore'}: ${range(magnitude)} ${value.resource}`;
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

function statBonus(value: Extract<TagClause, { kind: 'stat-bonus' }>): string {
  if (value.percent) {
    const sign = value.amount < 0 ? '-' : '+';
    return `${sign}${n(Math.abs(value.amount))}% ${value.statId}`;
  }
  const sign = value.amount.min < 0 || value.amount.max < 0 ? '-' : '+';
  const lo = Math.min(Math.abs(value.amount.min), Math.abs(value.amount.max));
  const hi = Math.max(Math.abs(value.amount.min), Math.abs(value.amount.max));
  return lo === hi ? `${sign}${n(lo)} ${value.statId}` : `${sign}${n(lo)}-${n(hi)} ${value.statId}`;
}

function tag(value: TagClause): string {
  switch (value.kind) {
    case 'keyword':
      return value.value;
    case 'duration':
      return duration(value.seconds);
    case 'stat-bonus':
      return statBonus(value);
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

function actionLines(action: Action): Lines {
  const modifiers =
    action.requires ||
    action.hiddenIf ||
    action.tags?.length ||
    action.onSuccess?.length ||
    action.onFailure?.length ||
    action.onEscape?.length ||
    (action.kind !== undefined && action.kind !== 'duration') ||
    action.time !== undefined ||
    action.rate !== undefined ||
    action.accuracy ||
    action.evasion ||
    action.ability ||
    action.target ||
    action.dr ||
    action.escapeAfter !== undefined ||
    action.retaliates;

  if (!modifiers && action.results.length === 1 && !spansLines(action.results)) return [`${action.label}: ${results(action.results)}`];

  const lines = [`${action.label}:`];
  if (action.requires) lines.push(`  requires: ${condition(action.requires)}`);
  if (action.hiddenIf) lines.push(`  hidden if: ${condition(action.hiddenIf)}`);
  if (action.kind !== undefined && action.kind !== 'duration') lines.push(`  ${action.kind}`);
  if (action.retaliates) lines.push('  retaliates');
  // The tags the kind and the flags above already spell; re-emitting one would
  // round-trip into a second copy of the same fact.
  const lifted = new Set(['instant', 'continuous', 'retaliates']);
  const tags = (action.tags ?? []).filter((each) => each.kind !== 'keyword' || !lifted.has(each.value));
  if (tags.length > 0) lines.push(`  ${tags.map(tag).join(', ')}`);
  if (action.time !== undefined) lines.push(`  time: ${n(action.time)}`);
  if (action.rate !== undefined) lines.push(`  rate: ${typeof action.rate === 'string' ? action.rate : n(action.rate)}`);
  if (action.accuracy) lines.push(`  accuracy: ${action.accuracy}`);
  if (action.evasion) lines.push(`  evasion: ${action.evasion}`);
  if (action.ability) lines.push(`  ability: ${action.ability}`);
  if (action.target) lines.push(`  target: ${action.target}`);
  if (action.dr) lines.push(`  dr: ${action.dr}`);
  if (action.escapeAfter !== undefined) lines.push(`  escape after ${n(action.escapeAfter)}`);
  lines.push(...indented(action.results.flatMap(resultLines)));
  resultBlock(lines, '  on success', action.onSuccess, 4);
  resultBlock(lines, '  on failure', action.onFailure, 4);
  resultBlock(lines, '  on escape', action.onEscape, 4);
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

function directive(value: Directive): string {
  switch (value.kind) {
    case 'run':
      return `run: ${value.test}`;
    case 'talk':
      return `talk: ${value.entity}`;
    case 'choose':
      return `choose: ${value.text}`;
    case 'use':
      return `use: ${value.obj}.${value.objId}.${value.actionId}`;
    case 'travel':
      return `travel: ${value.location}`;
    case 'craft':
      return `craft: ${value.recipe}`;
    case 'begin': {
      const inner = value.inner.kind === 'use' ? `${value.inner.obj}.${value.inner.objId}.${value.inner.actionId}` : value.inner.kind === 'travel' ? value.inner.location : value.inner.recipe;
      return `begin: ${value.inner.kind} ${inner}`;
    }
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
  for (const action of item.actions ?? []) lines.push(...actionLines(action));
  return lines.join('\n');
}

function entityTypeSection(moduleId: string, entityType: EntityType): string {
  const lines = [`# entitytype ${moduleLocalId(moduleId, entityType.id)}`];
  for (const action of entityType.actions) lines.push(...actionLines(action));
  return lines.join('\n');
}

// What the entity said about an action its template already defines: the fields
// that differ, and nothing else. Printing the inherited ones back would make the
// reload merge them onto the template a second time — which is a load error the
// moment the entity changed the kind or the cadence — and would freeze the
// entity against edits to the template it still claims to follow.
function actionOverride(action: Action, inherited: Action): Lines {
  const kept = Object.keys(action).filter((key) => key !== 'label' && !sameValue(action[key as keyof Action], inherited[key as keyof Action]));
  if (kept.length === 0) return [];
  const override: Record<string, unknown> = { label: action.label, results: [] };
  for (const key of kept) override[key] = action[key as keyof Action];
  return actionLines(override as unknown as Action);
}

function entitySection(moduleId: string, entity: Entity, template: EntityType | undefined): string {
  const lines = [`# entity ${moduleLocalId(moduleId, entity.id)}`];
  if (entity.type) lines.push(`type: ${entity.type}`);
  titled(lines, entity);
  block(lines, 'stations', entity.capabilities);
  const stats = Object.entries(entity.stats).map(([statId, value]) => `${statId} ${range(value)}`);
  if (stats.length > 0) lines.push(`stats: ${stats.join(', ')}`);
  block(lines, 'flags', entity.flags);

  const inheritable = new Map((template?.actions ?? []).map((action) => [action.label, action]));
  for (const action of entity.actions) {
    const inherited = inheritable.get(action.label);
    lines.push(...(inherited ? actionOverride(action, inherited) : actionLines(action)));
  }
  // A template action the entity no longer has was removed, and only `-label:`
  // says so; without it the reload would inherit it straight back.
  const held = new Set(entity.actions.map((action) => action.label));
  for (const label of inheritable.keys()) if (!held.has(label)) lines.push(`-${label}:`);
  return lines.join('\n');
}

function locationSection(moduleId: string, location: Location): string {
  const lines = [`# location ${moduleLocalId(moduleId, location.id)}`];
  if (location.relative) lines.push(`${location.relative.direction} of ${location.relative.of}`);
  else lines.push(`x: ${n(location.x)}, y: ${n(location.y)}, z: ${n(location.z)}`);
  titled(lines, location);
  if (location.starting) lines.push('starting');
  block(lines, 'entities', location.entities);
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
  resultBlock(lines, 'on empty', resource.onEmpty);
  resultBlock(lines, 'on full', resource.onFull);
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
  return [`# test ${moduleLocalId(moduleId, test.id)}`, ...test.directives.map(directive)].join('\n');
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
  for (const skill of registry.skills.values()) if (inModule(moduleId, skill.id)) sections.push([`# skill ${moduleLocalId(moduleId, skill.id)}`, `title: ${skill.title}`, ...(skill['stat-id'] ? [`stat-id: ${skill['stat-id']}`] : [])].join('\n'));
  for (const item of registry.items.values()) if (inModule(moduleId, item.id)) sections.push(itemSection(moduleId, item));
  for (const entityType of registry.entityTypes.values()) if (inModule(moduleId, entityType.id)) sections.push(entityTypeSection(moduleId, entityType));
  for (const entity of registry.entities.values()) if (inModule(moduleId, entity.id)) sections.push(entitySection(moduleId, entity, entity.type ? registry.entityTypes.get(entity.type) : undefined));
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
