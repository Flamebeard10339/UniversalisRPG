import { Action, Sided } from '../grammar/action';
import { ActionResult, nestedResults } from '../grammar/actionResult';
import { Condition, isEngineRoot, Reference, VISITS, visitedNode } from '../grammar/condition';
import { Dialogue, TextSegment } from './dialogue';
import { Directive } from './test';
import { Ally, EntityBlock, isHandlerBlock } from './entity';
import { Edge, Population, Relative } from './location';
import { isFieldEdits, listMembers } from '../grammar/section';
import { ACTION_MEMBER, memberKey } from './namespace';
import { isActionOwnerKind, type ModuleSection } from './sectionKind';
import { lastSegment } from '../grammar/values';
import { mayBeInstanceId } from './instanceId';
import { Quantified } from '../grammar/values';
import { SkillGrant } from '../grammar/skillGrant';
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
  for (const [written, contest] of [['accuracy', action.accuracy], ['damage', action.damage]] as const) {
    if (!contest) continue;
    sites.push({ held: contest.left, kind: 'stat', written });
    if (contest.right) sites.push({ held: contest.right, kind: 'stat', written });
  }
  if (action.depletes) sites.push({ held: action.depletes, kind: 'resource', written: 'depletes' });
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

// An entity's labelled blocks. A handler's event name is the reference its label
// carries, and it is rewritten in place so `on death:` resolves the way `uses:`
// does rather than being matched by spelling later.
export function blocks(list: unknown, where: string, visit: Visit): void {
  for (const block of listMembers<EntityBlock>(list)) {
    if (!isHandlerBlock(block)) {
      visitAction(block, `${where} action ${JSON.stringify(block.label)}`, visit);
      continue;
    }
    const at = `${where} ${block.label}:`;
    put(block, 'event', 'event', at, visit);
    results(block.results, at, visit);
  }
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
    case 'goto':
      put(value, 'location', 'location', `${where} goto:`, visit);
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
    case 'use': {
      // `obj` names the kind, so the object it addresses is resolved as one,
      // and the action after it is that object's member — resolved second,
      // because the key it hangs under is the one the object settled on.
      if (!isActionOwnerKind(value.obj)) return;
      put(value, 'objId', value.obj, `${where} use:`, visit);
      value.actionId = lastSegment(visit(ACTION_MEMBER, memberKey(ACTION_MEMBER, value.obj, value.objId, value.actionId), `${where} use:`));
      return;
    }
    case 'use-on':
      put(value, 'action', 'action', `${where} use:`, visit);
      put(value, 'target', 'entity', `${where} use: on`, visit);
      return;
    case 'equip':
      putCarried(value, 'item', `${where} equip:`, visit);
      return;
    // A growth verb's target is what is grown; whatever it consumes comes off a
    // stack and is always an item id.
    case 'feed':
      putCarried(value, 'target', `${where} feed:`, visit);
      put(value, 'food', 'item', `${where} feed: with`, visit);
      return;
    case 'slot':
      putCarried(value, 'target', `${where} slot:`, visit);
      put(value, 'jewel', 'item', `${where} slot: with`, visit);
      return;
    case 'apply':
      putCarried(value, 'target', `${where} apply:`, visit);
      put(value, 'effect', 'item', `${where} apply: with`, visit);
      return;
    case 'allocate':
      putCarried(value, 'target', `${where} allocate:`, visit);
      return;
    case 'refuse':
      visitDirective(value.inner, `${where} refuse:`, visit);
      return;
    // `unequip:` names a slot, `open-modal:` a screen the engine defines and
    // `submit-modal:` an option key, none of which is a section's id, so they
    // resolve nothing here; a slot is checked against what items declare by
    // validateTestReferences, and a screen only the layer above can name is
    // refused where it is raised. `choose:` names an offered option by its
    // position, `cancel:` and `wait:` name nothing at all.
    case 'unequip':
    case 'open-modal':
    case 'submit-modal':
    case 'choose':
    case 'cancel':
    case 'wait':
      return;
    default: {
      const unreached: never = value;
      void unreached;
    }
  }
}

export function dialogue(value: Dialogue, where: string, visit: Visit): void {
  put(value, 'owner', 'entity', `${where} owner`, visit);
  for (const node of value.nodes ?? []) {
    const at = `${where} node ${node.name}`;
    condition(node.when, `${at} when:`, visit);
    segments(node.again?.segments, at, visit);
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
// traversal, so that resolving one and validating one cannot drift apart. Taken
// as the discriminated union rather than as a kind and a value, so that a kind
// this walk has no answer for is a compile error and not a section whose
// references nobody looked at.
