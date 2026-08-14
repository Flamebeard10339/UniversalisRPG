import { defaultTitle } from './info';
import { Action, actionBody } from '../grammar/action';
import { ActionResult, resultBlock, resultList } from '../grammar/actionResult';
import { Condition, condition } from '../grammar/condition';
import { HOOK_FIELDS, HookCarrier } from '../grammar/hook';
import { list } from '../grammar/list';
import { DslError, Parser } from '../grammar/parser';
import { Range, range } from '../grammar/range';
import { EntryBody, SectionSchema } from '../grammar/section';
import { duration, id, text } from '../grammar/values';

export type { Action } from '../grammar/action';

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
const statAssignment: Parser<[string, Range]> = {
  parse(cursor) {
    const statId = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return [statId, range.parse(cursor)];
  },
};

const ally: Parser<Ally> = {
  parse(cursor) {
    const count = cursor.take(/\d+(?![\w-])/);
    if (count === null) return { entity: id.parse(cursor) };
    if (Number(count) === 0) throw new DslError('a roster of 0 brings nobody, so leave the line out', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    cursor.take(/[ \t]+/);
    return { count: Number(count), entity: id.parse(cursor) };
  },
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

export const entitySchema: SectionSchema<AuthoredEntity, 'aggressive', 'blocks'> = {
  kind: 'entity',
  fields: {
    title: { parser: text, default: defaultTitle },
    examine: { parser: text },
    capabilities: { parser: list(id), keyword: 'stations', default: () => [] },
    stats: {
      parser: list(statAssignment),
      hydrate: (parsed) => Object.fromEntries(parsed as [string, Range][]),
      default: () => ({}),
    },
    skills: { parser: list(id), hydrate: (parsed) => [...new Set(parsed as string[])], default: () => [] },
    equipmentSlots: { parser: list(id), keyword: 'equipment-slots', default: () => [] },
    flags: { parser: list(id), default: () => [] },
    uses: { parser: list(id), default: () => [] },
    faction: { parser: list(id), default: () => [] },
    allies: { parser: list(ally), default: () => [] },
    respawnAfter: { parser: duration, keyword: 'respawn after' },
    hiddenIf: { parser: condition, keyword: 'hidden if' },
    // Claimed as fields, so `on hit:` is a hook before the label dispatch below
    // can read it as an `on <event>:` handler.
    ...HOOK_FIELDS,
  },
  keywords: ['aggressive'],
  entries: { into: 'blocks', body: entityBlock },
};
