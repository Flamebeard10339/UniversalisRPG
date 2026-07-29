import { Action } from '../grammar/action';
import { ActionResult } from '../grammar/actionResult';
import { Condition, isEngineRoot, Reference, VISITS, visitedNode } from '../grammar/condition';
import { Dialogue, TextSegment } from './dialogue';
import { Directive } from './test';
import { Edge, Relative } from './location';
import { isFieldEdits, listMembers } from '../grammar/section';
import { Quantified } from '../grammar/values';
import { TagClause } from '../grammar/tagClause';

export type ReferenceKind = 'stat' | 'resource' | 'entity' | 'location' | 'item' | 'skill' | 'recipe' | 'save' | 'test' | 'capability' | 'flag' | 'node';

// Returns what the id should become. Resolution rewrites it into a namespaced
// key; validation hands it back and throws if it names nothing.
export type Visit = (kind: ReferenceKind, id: string, where: string) => string;

type Loose = Record<string, unknown>;

// Hydrated fields are defined without a setter, so an unchanged id must not be
// written back — validation walks the same sites as resolution and changes none.
function put<T extends object>(holder: T, key: keyof T & string, kind: ReferenceKind, where: string, visit: Visit): void {
  const current = (holder as Loose)[key];
  if (typeof current !== 'string') return;
  const next = visit(kind, current, where);
  if (next !== current) (holder as Loose)[key] = next;
}

function strings(holder: Loose, key: string, kind: ReferenceKind, where: string, visit: Visit): void {
  const list = holder[key];
  const rewrite = (values: unknown[]): void => {
    values.forEach((value, index) => {
      if (typeof value === 'string') values[index] = visit(kind, value, where);
    });
  };
  if (isFieldEdits(list)) for (const op of list.ops) rewrite(op.values);
  else if (Array.isArray(list)) rewrite(list);
}

// A reference in a condition names a flag, or a node whose visits the engine
// counts. Either way the owner is a path and resolves like one; only the clock
// and the player sheet belong to nobody and are left as written.
function reference(value: Reference | undefined, where: string, visit: Visit): void {
  if (!value || isEngineRoot(value.path)) return;
  const node = visitedNode(value.path);
  const raw = (node ?? value.path).join('.');
  const resolved = visit(node ? 'node' : 'flag', raw, where);
  value.path = node ? [...resolved.split('.'), VISITS] : resolved.split('.');
}

function segments(list: TextSegment[] | undefined, where: string, visit: Visit): void {
  for (const segment of list ?? []) {
    if (segment.kind === 'conditional') condition(segment.condition, where, visit);
    if (segment.kind === 'interpolate') reference(segment.reference, where, visit);
  }
}

function quantified(list: unknown, kind: ReferenceKind, where: string, visit: Visit): void {
  for (const entry of listMembers<Quantified>(list)) put(entry, 'item', kind, where, visit);
}

function condition(value: Condition | undefined, where: string, visit: Visit): void {
  if (!value) return;
  switch (value.kind) {
    case 'has':
      put(value, 'item', 'item', `${where} has`, visit);
      return;
    case 'reference':
      reference(value.reference, where, visit);
      return;
    case 'comparison':
      reference(value.left, where, visit);
      return;
    case 'not':
      condition(value.condition, where, visit);
      return;
    case 'and':
    case 'or':
      for (const inner of value.conditions) condition(inner, where, visit);
  }
}

function results(list: ActionResult[] | undefined, where: string, visit: Visit): void {
  for (const result of list ?? []) {
    switch (result.kind) {
      case 'give':
      case 'take':
        put(result, 'item', 'item', `${where} ${result.kind}:`, visit);
        break;
      case 'xp':
        put(result, 'skill', 'skill', `${where} xp:`, visit);
        break;
      case 'relocate':
      case 'discover':
        put(result, 'location', 'location', `${where} ${result.kind}:`, visit);
        break;
      case 'pool':
        put(result, 'resource', 'resource', `${where} ${result.delta < 0 ? 'drain' : 'restore'}:`, visit);
        break;
      case 'set':
      case 'unset':
      case 'add':
        put(result, 'variable', 'flag', `${where} ${result.kind}:`, visit);
        break;
    }
  }
}

function tags(list: unknown, where: string, visit: Visit): void {
  for (const tag of listMembers<TagClause>(list)) if (tag.kind === 'stat-bonus') put(tag, 'statId', 'stat', `${where} tag`, visit);
}

export function visitAction(action: Action, where: string, visit: Visit): void {
  for (const field of ['speed', 'accuracy', 'evasion', 'ability', 'dr'] as const) put(action, field, 'stat', `${where} ${field}:`, visit);
  put(action, 'target', 'resource', `${where} target:`, visit);
  tags(action.tags, where, visit);
  condition(action.requires, `${where} requires:`, visit);
  condition(action.hiddenIf, `${where} hidden if:`, visit);
  for (const group of [action.results, action.onSuccess, action.onFailure, action.onEscape]) results(group, where, visit);
}

function actions(list: unknown, where: string, visit: Visit): void {
  for (const action of listMembers<Action>(list)) visitAction(action, `${where} action ${JSON.stringify(action.label)}`, visit);
}

// Exported because a directive also arrives typed at the CLI, where the names
// are as short as an author's and want the same resolution.
export function visitDirective(value: Directive, where: string, visit: Visit): void {
  switch (value.kind) {
    case 'run':
      put(value, 'test', 'test', `${where} run:`, visit);
      return;
    case 'talk':
      put(value, 'entity', 'entity', `${where} talk:`, visit);
      return;
    case 'travel':
      put(value, 'location', 'location', `${where} travel:`, visit);
      return;
    case 'craft':
      put(value, 'recipe', 'recipe', `${where} craft:`, visit);
      return;
    case 'expect':
    case 'load':
      put(value, 'save', 'save', `${where} ${value.kind}:`, visit);
      return;
    case 'assert':
      condition(value.condition, `${where} assert:`, visit);
      return;
    case 'begin':
      visitDirective(value.inner, `${where} begin:`, visit);
      return;
    case 'use':
      // `obj` names the kind, so the object it addresses is resolved as one.
      if (value.obj === 'entity' || value.obj === 'location' || value.obj === 'item') put(value, 'objId', value.obj, `${where} use:`, visit);
  }
}

function dialogue(value: Dialogue, where: string, visit: Visit): void {
  put(value, 'owner', 'entity', `${where} owner`, visit);
  for (const node of value.nodes ?? []) {
    const at = `${where} node ${node.name}`;
    condition(node.when, `${at} when:`, visit);
    segments(node.again, at, visit);
    for (const step of node.steps ?? []) {
      if (step.kind === 'effect') results([step.result], at, visit);
      if (step.kind === 'say') segments(step.segments, at, visit);
      if (step.kind === 'menu') {
        for (const choice of step.choices) {
          segments(choice.segments, `${at} choice`, visit);
          condition(choice.when, `${at} choice when`, visit);
          results(choice.effects, `${at} choice`, visit);
        }
      }
    }
  }
}

// Every place the grammar can carry a reference to a named object, in one
// traversal, so that resolving one and validating one cannot drift apart.
export function visitSection(kind: string, value: object, where: string, visit: Visit): void {
  const section = value as Loose;
  switch (kind) {
    case 'entity': {
      // A stat sheet is authored as a list of assignments; the stat id leading
      // each one is the reference.
      for (const assignment of listMembers<[string, unknown]>(section.stats)) assignment[0] = visit('stat', assignment[0], `${where} stats:`);
      actions(section.actions, where, visit);
      return;
    }
    case 'item':
      tags(section.tags, where, visit);
      actions(section.actions, where, visit);
      return;
    case 'location':
      strings(section, 'entities', 'entity', `${where} entities:`, visit);
      for (const edge of listMembers<Edge>(section.adjacent)) {
        put(edge, 'target', 'location', `${where} adjacent:`, visit);
        condition(edge.condition, `${where} adjacent: ${edge.target} while`, visit);
      }
      if (section.relative) put(section.relative as Relative, 'of', 'location', `${where} relative`, visit);
      actions(section.actions, where, visit);
      return;
    case 'recipe':
      for (const field of ['in', 'out', 'burnt'] as const) quantified(section[field], 'item', `${where} ${field}:`, visit);
      for (const field of ['speed', 'accuracy', 'evasion'] as const) put(section, field, 'stat', `${where} ${field}:`, visit);
      put(section, 'requiresCapability', 'capability', `${where} station`, visit);
      if (section.skill) put(section.skill as Loose & { skill: string }, 'skill', 'skill', `${where} skill:`, visit);
      return;
    case 'resource':
      put(section, 'max', 'stat', `${where} max:`, visit);
      put(section, 'rate', 'stat', `${where} rate:`, visit);
      results(section.onEmpty as ActionResult[], `${where} on empty:`, visit);
      results(section.onFull as ActionResult[], `${where} on full:`, visit);
      return;
    case 'dialogue':
      dialogue(value as Dialogue, where, visit);
      return;
    case 'test':
      for (const each of (section.directives as Directive[]) ?? []) visitDirective(each, where, visit);
  }
}
