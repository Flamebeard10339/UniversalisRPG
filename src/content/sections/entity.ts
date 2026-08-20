import { Action, actionBody } from '../../grammar/action';
import { ActionResult, resultBlock, resultList } from '../../grammar/actionResult';
import { Condition, condition } from '../../grammar/condition';
import { HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
import { DslError, Parser } from '../../grammar/parser';
import { Range, range } from '../../grammar/range';
import { EntryBody, listMembers } from '../../grammar/section';
import { duration, id, text } from '../../grammar/values';
import { condition as visitCondition, hooks, put, results, strings, visitAction, type Loose, type Visit } from '../refs';
import { section } from './define';
import { TITLE_FIELD } from './info';

export type { Action } from '../../grammar/action';

// The id an action was declared under, present on the ones an entity performs
// through `uses:` and absent on the one-offs it writes inline.
export const declaredId = (action: Action): string | undefined => (action as { id?: string }).id;

// A roster line names a type and how many of it. A count is what spawns, so
// `2 bandit` mints two fight-scoped bandits and a bare name is the one that
// already exists, joining from wherever it is.
export interface Ally {
  count?: number;
  entity: string;
}

// A name bound to a trigger, and what happens to the entity it happened to.
export interface Handler {
  event: string;
  results: ActionResult[];
}

// A handler as authored. The label stays as written and the event name beside it
// is the reference, so resolving one never rewrites the heading a reload has to
// read back.
export interface HandlerBlock extends Handler {
  label: string;
}

export type EntityBlock = Action | HandlerBlock;

// What an entity's body says before `uses:` is resolved against the actions it
// names. `blocks` holds every labelled block as authored — an inline action, an
// overload of an action this entity uses, or an `on <event>:` handler.
export interface AuthoredEntity extends HookCarrier {
  id: string;
  title: string;
  examine?: string;
  capabilities: string[];
  // Replaces the global `# stat` default per name, for this entity alone.
  stats: Record<string, Range>;
  skills: string[];
  passives: string[];
  equipmentSlots: string[];
  flags: string[];
  uses: string[];
  faction: string[];
  allies: Ally[];
  aggressive: boolean;
  // Seconds after this leaves the world before it returns; absent means never.
  respawnAfter?: number;
  hiddenIf?: Condition;
  blocks: EntityBlock[];
}

// The linked form the registry holds: `blocks` split into the actions this
// entity performs — its own, and the ones it `uses:` with its overloads applied
// — and the handlers it answers events with.
export interface Entity extends AuthoredEntity {
  actions: Action[];
  handlers: Handler[];
}

// An assignment, not the `+4-7 attack` shift a bonus tag clause carries.
export const statAssignmentValue: Parser<[string, Range]> = {
  parse(cursor) {
    const statId = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return [statId, range.parse(cursor)];
  },
  print: ([statId, value]) => `${id.print(statId)} ${range.print(value)}`,
  examples: ['attack 4', 'attack 4-7'],
};

export const allyValue: Parser<Ally> = {
  parse(cursor) {
    const count = cursor.take(/\d+(?![\w-])/);
    if (count === null) return { entity: id.parse(cursor) };
    if (Number(count) === 0)
      throw new DslError('a roster of 0 brings nobody, so leave the line out', {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });
    cursor.take(/[ \t]+/);
    return { count: Number(count), entity: id.parse(cursor) };
  },
  print: (value) => (value.count === undefined ? value.entity : `${value.count} ${id.print(value.entity)}`),
  examples: ['bandit', '2 bandit'],
};

// `on <event>:` is the one label shape whose body is results rather than an
// action, because a handler is what happens rather than something to perform.
const HANDLER_LABEL = /^on[ \t]+(?<event>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)$/;

export const handlerEvent = (label: string): string | undefined => HANDLER_LABEL.exec(label)?.groups?.event;

export const isHandlerBlock = (block: EntityBlock): block is HandlerBlock => 'event' in block;

// One body reader for both, chosen by the label, because the label is the only
// thing that says which of the two a block is.
const entityBlock: EntryBody = {
  parse(cursor, label) {
    const event = handlerEvent(label);
    return event === undefined ? actionBody.parse(cursor, label) : { event, results: resultList.parse(cursor) };
  },
  parseBlock(lines, label) {
    const event = handlerEvent(label);
    return event === undefined ? actionBody.parseBlock(lines, label) : { event, results: resultBlock(lines) };
  },
};

export const entity = section<AuthoredEntity, 'aggressive', 'blocks'>()({
  kind: 'entity',
  ids: 'owned',
  // `actions` and `handlers` are what `blocks` becomes once `uses:` can be read
  // against the actions it names, which is after every section is in.
  maps: {
    entities: (value: AuthoredEntity): readonly (readonly [string, Entity])[] => [[value.id, { ...value, actions: [], handlers: [] }]],
  },
  nestsActions: true,
  text: ['title', 'examine'],
  fields: {
    title: TITLE_FIELD,
    examine: { parser: text },
    hiddenIf: { parser: condition, keyword: 'hidden if' },
    respawnAfter: { parser: duration, keyword: 'respawn after' },
    capabilities: {
      parser: list(id),
      keyword: 'stations',
      default: () => [],
      block: true,
    },
    stats: {
      parser: list(statAssignmentValue),
      hydrate: (parsed) => Object.fromEntries(parsed as [string, Range][]),
      dehydrate: (held) => Object.entries(held),
      default: () => ({}),
    },
    skills: {
      parser: list(id),
      hydrate: (parsed) => [...new Set(parsed as string[])],
      default: () => [],
    },
    passives: { parser: list(id), default: () => [] },
    equipmentSlots: {
      parser: list(id),
      keyword: 'equipment-slots',
      default: () => [],
    },
    uses: { parser: list(id), default: () => [] },
    faction: { parser: list(id), default: () => [] },
    allies: { parser: list(allyValue), default: () => [] },
    flags: { parser: list(id), default: () => [], block: true },
    // Claimed as fields, so `on hit:` is a hook before the label dispatch above
    // can read it as an `on <event>:` handler.
    ...HOOK_FIELDS,
  },
  keywords: ['aggressive'],
  keywordsAfter: 'examine',
  entries: { into: 'blocks', body: entityBlock },
  visit: (value, where, visit) => {
    const held = value as unknown as Loose;
    // A stat sheet is authored as a list of assignments; the stat id leading
    // each one is the reference.
    for (const assignment of listMembers<[string, unknown]>(held.stats)) assignment[0] = visit('stat', assignment[0], `${where} stats:`);
    strings(held, 'uses', 'action', `${where} uses:`, visit);
    strings(held, 'faction', 'faction', `${where} faction:`, visit);
    strings(held, 'skills', 'skill', `${where} skills:`, visit);
    strings(held, 'passives', 'passive', `${where} passives:`, visit);
    for (const entry of listMembers<Ally>(held.allies)) put(entry, 'entity', 'entity', `${where} allies:`, visit);
    visitCondition(held.hiddenIf as Condition | undefined, `${where} hidden if:`, visit);
    blocks(held.blocks, where, visit);
    hooks(held, where, visit);
  },
});

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
