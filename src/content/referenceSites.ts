import { Action, Sided } from '../grammar/action';
import { ActionResult, nestedResults } from '../grammar/actionResult';
import { Condition, isEngineRoot, Reference, VISITS, visitedNode } from '../grammar/condition';
import { Dialogue, TextSegment } from './dialogue';
import { Directive } from './test';
import { Ally, EntityBlock, isHandlerBlock } from './entity';
import { Edge, Population, Relative } from './location';
import { isFieldEdits, listMembers } from '../grammar/section';
import { mayBeInstanceId } from './instanceId';
import { Quantified } from '../grammar/values';
import { TagClause } from '../grammar/tagClause';

export type ReferenceKind = 'stat' | 'resource' | 'entity' | 'action' | 'event' | 'faction' | 'location' | 'item' | 'skill' | 'recipe' | 'droptable' | 'save' | 'test' | 'capability' | 'flag' | 'node' | 'passive' | 'cluster-jewel';

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

// A directive naming what the player carries may name a stack by its item id
// or one grown copy by the id minting gave it, and only the first is declared
// anywhere. The shape is what tells them apart, so a name that could not have
// been minted is still resolved and a typo'd item id is still caught, while a
// bare number is left for the runtime, which alone knows what is live.
function putCarried<T extends object>(holder: T, key: keyof T & string, where: string, visit: Visit): void {
  const current = (holder as Loose)[key];
  if (typeof current === 'string' && mayBeInstanceId(current)) return;
  put(holder, key, 'item', where, visit);
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

export function visitResults(list: ActionResult[] | undefined, where: string, visit: Visit): void {
  results(list, where, visit);
}

function results(list: ActionResult[] | undefined, where: string, visit: Visit): void {
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
    }
  }
}

// A counter is what a `per` names, and this branch's counter is a resource's
// level. A second source joins by resolving here, not by a second walk.
export function visitTags(list: unknown, where: string, visit: Visit): void {
  for (const tag of listMembers<TagClause>(list)) {
    if (tag.kind !== 'stat-bonus') continue;
    put(tag, 'statId', 'stat', `${where} tag`, visit);
    if (tag.per !== undefined) put(tag, 'per', 'resource', `${where} tag per`, visit);
  }
}

// The two blocks a character modifier carries, walked wherever one is carried.
// Through `listMembers` because a hook is a list field: `+on hit:` in a patch
// module holds the operations until merge resolves them, and resolution runs
// first.
function hooks(carrier: Loose, where: string, visit: Visit): void {
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

function actions(list: unknown, where: string, visit: Visit): void {
  for (const action of listMembers<Action>(list)) visitAction(action, `${where} action ${JSON.stringify(action.label)}`, visit);
}

// An entity's labelled blocks. A handler's event name is the reference its label
// carries, and it is rewritten in place so `on death:` resolves the way `uses:`
// does rather than being matched by spelling later.
function blocks(list: unknown, where: string, visit: Visit): void {
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
      return;
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
    // refused where it is raised.
    case 'unequip':
    case 'open-modal':
    case 'submit-modal':
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
      strings(section, 'uses', 'action', `${where} uses:`, visit);
      strings(section, 'faction', 'faction', `${where} faction:`, visit);
      strings(section, 'skills', 'skill', `${where} skills:`, visit);
      for (const entry of listMembers<Ally>(section.allies)) put(entry, 'entity', 'entity', `${where} allies:`, visit);
      condition(section.hiddenIf as Condition | undefined, `${where} hidden if:`, visit);
      // A block is an action unless its label names an event, which is the one
      // label shape whose name is a reference rather than a title.
      blocks(section.blocks, where, visit);
      hooks(section, where, visit);
      return;
    }
    case 'action':
      visitAction(value as Action, where, visit);
      return;
    case 'event':
      put(section, 'resource', 'resource', `${where} resource:`, visit);
      return;
    case 'faction':
      return;
    case 'item':
      visitTags(section.tags, where, visit);
      actions(section.actions, where, visit);
      hooks(section, where, visit);
      put(section, 'clusterJewel', 'cluster-jewel', `${where} cluster-jewel:`, visit);
      put(section, 'originCluster', 'cluster-jewel', `${where} origin-cluster:`, visit);
      if (section.clusterEffect) put(section.clusterEffect as Loose & { statId: string }, 'statId', 'stat', `${where} cluster-effect:`, visit);
      return;
    case 'passive':
      visitTags(section.tags, where, visit);
      return;
    case 'cluster-jewel':
      // Positions are authored as `<position> <passive>` pairs, the same
      // list-of-pairs shape `# entity stats:` walks above — the key here is a
      // position number rather than a stat id, so only the value resolves.
      for (const assignment of listMembers<[number, string]>(section.positions)) {
        assignment[1] = visit('passive', assignment[1], `${where} passives:`);
      }
      return;
    case 'location':
      for (const entry of listMembers<Population>(section.entities)) put(entry, 'entity', 'entity', `${where} entities:`, visit);
      for (const edge of listMembers<Edge>(section.adjacent)) {
        put(edge, 'target', 'location', `${where} adjacent:`, visit);
        condition(edge.condition, `${where} adjacent: ${edge.target} while`, visit);
      }
      if (section.relative) put(section.relative as Relative, 'of', 'location', `${where} relative`, visit);
      actions(section.actions, where, visit);
      return;
    case 'skill':
      put(section, 'stat-id', 'stat', `${where} stat-id:`, visit);
      return;
    case 'recipe':
      for (const field of ['in', 'out', 'burnt'] as const) quantified(section[field], 'item', `${where} ${field}:`, visit);
      for (const field of ['rate', 'accuracy', 'evasion'] as const) put(section, field, 'stat', `${where} ${field}:`, visit);
      put(section, 'requiresCapability', 'capability', `${where} station`, visit);
      if (section.skill) put(section.skill as Loose & { skill: string }, 'skill', 'skill', `${where} skill:`, visit);
      return;
    case 'resource':
      put(section, 'max', 'stat', `${where} max:`, visit);
      put(section, 'rate', 'stat', `${where} rate:`, visit);
      return;
    case 'droptable':
      results(section.results as ActionResult[], where, visit);
      return;
    case 'dialogue':
      dialogue(value as Dialogue, where, visit);
      return;
    case 'test':
      for (const each of (section.directives as Directive[]) ?? []) visitDirective(each, where, visit);
  }
}
