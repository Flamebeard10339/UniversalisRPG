import type { TextSegment } from '../grammar/segment';
import { Action, Sided } from '../grammar/action';
import { ActionResult, nestedResults } from '../grammar/actionResult';
import { Condition, isEngineRoot, Reference, rootedKind, VISITS, visitedNode } from '../grammar/condition';
import { DslError } from '../grammar/parser';
import { isFieldEdits, listMembers } from '../grammar/section';
import { mayBeInstanceId } from './instanceId';
import { Quantified } from '../grammar/values';
import { TagClause } from '../grammar/tagClause';

export const INFLICT_SITE = 'inflict:';

export type ReferenceKind = string;

export type Visit = (kind: ReferenceKind, id: string, where: string) => string;

export interface Pruning {
  intact(walk: () => void): boolean;
  gone(kind: ReferenceKind, id: string, where: string): boolean;
  visit: Visit;
}

export type Loose = Record<string, unknown>;

export function put<T extends object>(holder: T, key: keyof T & string, kind: ReferenceKind, where: string, visit: Visit): void {
  const current = (holder as Loose)[key];
  if (typeof current !== 'string') return;
  const next = visit(kind, current, where);
  if (next !== current) (holder as Loose)[key] = next;
}

export function putCarried<T extends object>(holder: T, key: keyof T & string, where: string, visit: Visit): void {
  const current = (holder as Loose)[key];
  if (typeof current === 'string' && mayBeInstanceId(current)) return;
  put(holder, key, 'item', where, visit);
}

export function strings(holder: Loose, key: string, kind: ReferenceKind, where: string, visit: Visit): void {
  const list = holder[key];
  const rewrite = (values: unknown[]): void => {
    values.forEach((value, index) => {
      if (typeof value === 'string') values[index] = visit(kind, value, where);
    });
  };
  if (isFieldEdits(list)) for (const op of list.ops) rewrite(op.values);
  else if (Array.isArray(list)) rewrite(list);
}

export function reference(value: Reference | undefined, where: string, visit: Visit): void {
  if (!value) return;
  const rooted = rootedKind(value.path[0]);
  if (rooted !== null) {
    const under = value.path.slice(1).join('.');
    if (under === '') throw new DslError(`${where} reads ${value.path[0]} on its own, which names no ${rooted}: write ${value.path[0]}.<${rooted}>`);
    value.path = [value.path[0], ...visit(rooted, under, where).split('.')];
    return;
  }
  if (isEngineRoot(value.path)) return;
  const node = visitedNode(value.path);
  const raw = (node ?? value.path).join('.');
  const resolved = visit(node ? 'node' : 'flag', raw, where);
  value.path = node ? [...resolved.split('.'), VISITS] : resolved.split('.');
}

export function segments(list: TextSegment[] | undefined, where: string, visit: Visit): void {
  for (const segment of list ?? []) {
    if (segment.kind === 'conditional') condition(segment.condition, where, visit);
    if (segment.kind === 'interpolate') reference(segment.reference, where, visit);
  }
}

export function quantified(list: unknown, kind: ReferenceKind, where: string, visit: Visit): void {
  for (const entry of listMembers<Quantified>(list)) put(entry, 'item', kind, where, visit);
}

export function condition(value: Condition | undefined, where: string, visit: Visit): void {
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
      return;
    default: {
      const unreached: never = value;
      void unreached;
    }
  }
}

export function results(list: ActionResult[] | undefined, where: string, visit: Visit): void {
  for (const result of list ?? []) {
    for (const nested of nestedResults(result)) results(nested, where, visit);
    switch (result.kind) {
      case 'give':
      case 'take':
        put(result, 'item', 'item', `${where} ${result.kind}:`, visit);
        break;
      case 'roll':
        put(result, 'table', 'droptable', `${where} roll:`, visit);
        break;
      case 'inflict':
        put(result, 'buff', 'item', `${where} ${INFLICT_SITE}`, visit);
        break;
      case 'contest':
        for (const side of ['left', 'right'] as const) put(result, side, 'stat', `${where} vs:`, visit);
        break;
      case 'gate':
        condition(result.condition, `${where} if:`, visit);
        break;
      case 'one-of':
        for (const row of result.rows) {
          put(row, 'weight', 'stat', `${where} one of: row`, visit);
          condition(row.requires, `${where} one of: row if`, visit);
        }
        break;
      case 'xp':
        put(result, 'skill', 'skill', `${where} xp:`, visit);
        break;
      case 'relocate':
      case 'discover':
        put(result, 'location', 'location', `${where} ${result.kind}:`, visit);
        break;
      case 'pool':
        put(result, 'resource', 'resource', `${where} ${result.delta.max < 0 ? 'drain' : 'restore'}:`, visit);
        break;
      case 'set':
      case 'unset':
      case 'add':
        put(result, 'variable', 'flag', `${where} ${result.kind}:`, visit);
        break;
      case 'open-modal':
        put(result, 'modal', 'modal', `${where} open modal:`, visit);
        break;
      case 'say':
      case 'stop':
      case 'chance':
      case 'credit':
        break;
      default: {
        const unreached: never = result;
        void unreached;
      }
    }
  }
}

export function visitTags(list: unknown, where: string, visit: Visit): void {
  for (const tag of listMembers<TagClause>(list)) {
    if (tag.kind !== 'stat-bonus') continue;
    put(tag, 'statId', 'stat', `${where} tag`, visit);
    if (tag.per !== undefined) put(tag.per, 'id', tag.per.kind === 'stack' ? 'item' : 'resource', `${where} tag per`, visit);
  }
}

export function hooks(carrier: Loose, where: string, visit: Visit): void {
  results(listMembers<ActionResult>(carrier.onHit), `${where} on hit:`, visit);
  results(listMembers<ActionResult>(carrier.whenHit), `${where} when hit:`, visit);
}

function sidedNames(action: Action): { held: Sided; kind: ReferenceKind; written: string }[] {
  const sites: { held: Sided; kind: ReferenceKind; written: string }[] = [];
  if (typeof action.rate === 'object' && action.rate !== null) sites.push({ held: action.rate, kind: 'stat', written: 'rate' });
  for (const [written, contest] of [
    ['accuracy', action.accuracy],
    ['damage', action.damage],
  ] as const) {
    if (!contest) continue;
    sites.push({ held: contest.left, kind: 'stat', written });
    if (contest.right) sites.push({ held: contest.right, kind: 'stat', written });
  }
  if (action.depletes)
    sites.push({
      held: action.depletes,
      kind: 'resource',
      written: 'depletes',
    });
  return sites;
}

export function visitAction(action: Action, where: string, visit: Visit): void {
  for (const site of sidedNames(action)) put(site.held, 'id', site.kind, `${where} ${site.written}:`, visit);
  visitTags(action.tags, where, visit);
  condition(action.requires, `${where} requires:`, visit);
  condition(action.hiddenIf, `${where} hidden if:`, visit);
  for (const group of [action.results, action.onSuccess, action.onFailure, action.onUnfinished]) results(group, where, visit);
}

export function actions(list: unknown, where: string, visit: Visit): void {
  for (const action of listMembers<Action>(list)) visitAction(action, `${where} action ${JSON.stringify(action.label)}`, visit);
}

export const pruneActions = (list: readonly Action[], where: string, at: Pruning): Action[] =>
  list.filter((action) => at.intact(() => visitAction(action, `${where} action ${JSON.stringify(action.label)}`, at.visit)));

export const pruneTags = (list: readonly TagClause[], where: string, at: Pruning): TagClause[] => list.filter((tag) => at.intact(() => visitTags([tag], where, at.visit)));

export const pruneHook = (hook: ActionResult[], where: string, at: Pruning): ActionResult[] => (at.intact(() => results(hook, where, at.visit)) ? hook : []);
