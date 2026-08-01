import { Action } from '../grammar/action';
import { ActionResult } from '../grammar/actionResult';
import { Condition, Reference } from '../grammar/condition';
import { formatDependency, formatVersion, Version } from '../grammar/dependency';
import { isPoint, Range } from '../grammar/range';
import { TagClause } from '../grammar/tagClause';
import { Quantified } from '../grammar/values';
import { Dialogue, TextSegment } from './dialogue';
import { Entity } from './entity';
import { Item } from './item';
import { Location } from './location';
import { Recipe } from './recipe';
import { Registry } from './registry';
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
      return `give: ${quantified({ item: value.item, amount: value.amount })}`;
    case 'take':
      return `take: ${quantified({ item: value.item, amount: value.amount })}`;
    case 'xp':
      return `xp: ${value.skill} ${n(value.amount)}`;
    case 'relocate':
      return `relocate: ${value.location}`;
    case 'discover':
      return `discover: ${value.location}`;
    case 'open-modal':
      return `open modal: ${value.modal}`;
    case 'pool':
      return `${value.delta < 0 ? 'drain' : 'restore'}: ${n(Math.abs(value.delta))} ${value.resource}`;
    case 'stop':
      return 'stop';
  }
}

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
  lines.push(`${label}:`, ...indented(values.map(result), childSpaces));
}

function actionLines(action: Action): Lines {
  const modifiers =
    action.requires ||
    action.hiddenIf ||
    action.tags?.length ||
    action.onSuccess?.length ||
    action.onFailure?.length ||
    action.onEscape?.length ||
    action.time !== undefined ||
    action.speed ||
    action.accuracy ||
    action.evasion ||
    action.ability ||
    action.target ||
    action.dr ||
    action.escapeAfter !== undefined ||
    action.repeating ||
    action.retaliates;

  if (!modifiers && action.results.length === 1) return [`${action.label}: ${results(action.results)}`];

  const lines = [`${action.label}:`];
  if (action.requires) lines.push(`  requires: ${condition(action.requires)}`);
  if (action.hiddenIf) lines.push(`  hidden if: ${condition(action.hiddenIf)}`);
  if (action.repeating) lines.push('  repeating');
  if (action.retaliates) lines.push('  retaliates');
  const tags = (action.tags ?? []).filter((each) => each.kind !== 'keyword' || (each.value !== 'repeating' && each.value !== 'retaliates'));
  if (tags.length > 0) lines.push(`  ${tags.map(tag).join(', ')}`);
  if (action.time !== undefined) lines.push(`  time: ${n(action.time)}`);
  if (action.speed) lines.push(`  speed: ${action.speed}`);
  if (action.accuracy) lines.push(`  accuracy: ${action.accuracy}`);
  if (action.evasion) lines.push(`  evasion: ${action.evasion}`);
  if (action.ability) lines.push(`  ability: ${action.ability}`);
  if (action.target) lines.push(`  target: ${action.target}`);
  if (action.dr) lines.push(`  dr: ${action.dr}`);
  if (action.escapeAfter !== undefined) lines.push(`  escape after ${n(action.escapeAfter)}`);
  lines.push(...indented(action.results.map(result)));
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

function entitySection(moduleId: string, entity: Entity): string {
  const lines = [`# entity ${moduleLocalId(moduleId, entity.id)}`];
  titled(lines, entity);
  block(lines, 'stations', entity.capabilities);
  const stats = Object.entries(entity.stats).map(([statId, value]) => `${statId} ${range(value)}`);
  if (stats.length > 0) lines.push(`stats: ${stats.join(', ')}`);
  block(lines, 'flags', entity.flags);
  for (const action of entity.actions) lines.push(...actionLines(action));
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
  block(lines, 'out', recipe.out.map(quantified));
  if (recipe.skill) lines.push(`skill: ${recipe.skill.skill} ${n(recipe.skill.amount)}`);
  if (recipe.say) lines.push(`say: ${recipe.say}`);
  if (recipe.time !== undefined) lines.push(`time: ${n(recipe.time)}`);
  if (recipe.speed) lines.push(`speed: ${recipe.speed}`);
  if (recipe.accuracy) lines.push(`accuracy: ${recipe.accuracy}`);
  if (recipe.evasion) lines.push(`evasion: ${recipe.evasion}`);
  block(lines, 'burnt', recipe.burnt.map(quantified));
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
      else if (step.kind === 'effect') lines.push(`  ${result(step.result)}`);
      else if (step.kind === 'goto') lines.push(`  goto ${step.target}`);
      else {
        for (const choice of step.choices) {
          lines.push(`  -> ${textSegments(choice.segments)}${choice.when ? ` (when ${condition(choice.when)})` : ''}`);
          if (choice.goto) lines.push(`    goto ${choice.goto}`);
          for (const effect of choice.effects) lines.push(`    ${result(effect)}`);
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
  for (const entity of registry.entities.values()) if (inModule(moduleId, entity.id)) sections.push(entitySection(moduleId, entity));
  for (const location of registry.locations.values()) if (inModule(moduleId, location.id)) sections.push(locationSection(moduleId, location));
  for (const recipe of registry.recipes.values()) if (inModule(moduleId, recipe.id)) sections.push(recipeSection(moduleId, recipe));
  for (const resource of registry.resources.values()) if (inModule(moduleId, resource.id)) sections.push(resourceSection(moduleId, resource));
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
