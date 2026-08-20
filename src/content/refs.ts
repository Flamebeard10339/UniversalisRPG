import type { TextSegment } from '../grammar/segment';
import { Action, Sided } from '../grammar/action';
import { ActionResult, nestedResults } from '../grammar/actionResult';
import { Condition, isEngineRoot, Reference, VISITS, visitedNode } from '../grammar/condition';
import { isFieldEdits, listMembers } from '../grammar/section';
import { mayBeInstanceId } from './instanceId';
import { Quantified } from '../grammar/values';
import { TagClause } from '../grammar/tagClause';

// The tail every `inflict:` site's `where` ends with, so the walk that writes it
// and the check that reads it cannot disagree about how it is spelled.
export const INFLICT_SITE = 'inflict:';

export type ReferenceKind = string;

// Returns what the id should become. Resolution rewrites it into a namespaced
// key; validation hands it back and throws if it names nothing.
export type Visit = (kind: ReferenceKind, id: string, where: string) => string;

export type Loose = Record<string, unknown>;

// Hydrated fields are defined without a setter, so an unchanged id must not be
// written back — validation walks the same sites as resolution and changes none.
export function put<T extends object>(holder: T, key: keyof T & string, kind: ReferenceKind, where: string, visit: Visit): void {
  const current = (holder as Loose)[key];
  if (typeof current !== 'string') return;
  const next = visit(kind, current, where);
  if (next !== current) (holder as Loose)[key] = next;
}

// A directive naming what the player carries may name a stack by its item id
// or one grown copy by the id minting gave it, and only the first is declared
// anywhere. The shape is what tells them apart, so a name that could not have
// been minted is still resolved and a typo'd item id is still caught, while a
// bare number is left for the runtime, which alone knows what is live.
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

// A reference in a condition names a flag, or a node whose visits the engine
// counts. Either way the owner is a path and resolves like one; only the clock
// and the player sheet belong to nobody and are left as written.
export function reference(value: Reference | undefined, where: string, visit: Visit): void {
  if (!value || isEngineRoot(value.path)) return;
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

export function visitResults(list: ActionResult[] | undefined, where: string, visit: Visit): void {
  results(list, where, visit);
}

export function results(list: ActionResult[] | undefined, where: string, visit: Visit): void {
  for (const result of list ?? []) {
    // A wrapper's body is an ordinary result list, so every site inside one is
    // reached by the same walk rather than by a second copy of it.
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
        // A side written as a name is a stat; a literal is left alone, exactly
        // as an action's `rate:` is.
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
      // Named rather than left to fall through, so that a kind added to the
      // union has to be sorted into one of these two lists by whoever adds it.
      // `credit` and `chance` hold only a nested list, which the walk above
      // already reached; `open-modal` names a modal the engine declares and no
      // reference kind covers; `say` and `stop` carry no id at all.
      case 'say':
      case 'stop':
      case 'chance':
      case 'credit':
      case 'open-modal':
        break;
      default: {
        const unreached: never = result;
        void unreached;
      }
    }
  }
}

// A counter is what a `per` names: a resource whose level it reads, or the
// source of the buff whose stacks it counts. A third joins by resolving here,
// not by a second walk.
export function visitTags(list: unknown, where: string, visit: Visit): void {
  for (const tag of listMembers<TagClause>(list)) {
    if (tag.kind !== 'stat-bonus') continue;
    put(tag, 'statId', 'stat', `${where} tag`, visit);
    if (tag.per !== undefined) put(tag.per, 'id', tag.per.kind === 'stack' ? 'item' : 'resource', `${where} tag per`, visit);
  }
}

// The two blocks a character modifier carries, walked wherever one is carried.
// Through `listMembers` because a hook is a list field: `+on hit:` in a patch
// module holds the operations until merge resolves them, and resolution runs
// first.
export function hooks(carrier: Loose, where: string, visit: Visit): void {
  results(listMembers<ActionResult>(carrier.onHit), `${where} on hit:`, visit);
  results(listMembers<ActionResult>(carrier.whenHit), `${where} when hit:`, visit);
}

// A side marker says which participant a name is read off; the name itself
// resolves like every other reference, whichever side carries it.
function sidedNames(action: Action): { held: Sided; kind: ReferenceKind; written: string }[] {
  const sites: { held: Sided; kind: ReferenceKind; written: string }[] = [];
  // `rate` is a stat only when it is written as a name; a per-minute literal is
  // a number and carries no side to resolve.
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

// Every place the grammar can carry a reference to a named object, in one
// traversal, so that resolving one and validating one cannot drift apart. Taken
// as the discriminated union rather than as a kind and a value, so that a kind
// this walk has no answer for is a compile error and not a section whose
// references nobody looked at.
