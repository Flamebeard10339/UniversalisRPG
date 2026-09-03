import { actionResultLists } from '../../grammar/action';
import { Action, actionBody } from '../../grammar/action';
import { ActionResult, resultBlock, resultGrammar, resultList } from '../../grammar/actionResult';
import { Condition } from '../../grammar/condition';
import { HOOK_FAMILY, HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
import { DslError, Parser } from '../../grammar/parser';
import { Range, range } from '../../grammar/range';
import { EntryBody, listMembers } from '../../grammar/section';
import { duration, id, text } from '../../grammar/values';
import { localeKey } from '../locale';
import { hooks, pruneHook, put, results, visitAction, type Loose, type Pruning, type Visit } from '../refs';
import { hiddenIf, MintedAction, section, TOUCHED } from './define';
import { Dialogue, spokenBy } from './dialogue';
import { GROUP_FIELD } from './group';
import { TITLE_FIELD } from './info';

export type { Action } from '../../grammar/action';

export const declaredId = (action: Action): string | undefined => (action as { id?: string }).id;

export interface Ally {
  count?: number;
  entity: string;
}

export interface Handler {
  event: string;
  results: ActionResult[];
}

export interface HandlerBlock extends Handler {
  label: string;
}

export type EntityBlock = Action | HandlerBlock;

export interface AuthoredEntity extends HookCarrier {
  id: string;
  title: string;
  examine?: string;
  group?: string;
  capabilities: string[];
  stats: Record<string, Range>;
  skills: string[];
  passives: string[];
  equipmentSlots: string[];
  flags: string[];
  shop?: string;
  uses: string[];
  faction: string[];
  allies: Ally[];
  aggressive: boolean;
  respawnAfter?: number;
  hiddenIf?: Condition;
  blocks: EntityBlock[];
}

export interface Entity extends AuthoredEntity {
  actions: Action[];
  handlers: Handler[];
}

export const EXAMINE_FIELD = 'examine';

export function mintedActions(value: { id: string; examine?: string }, namespace: string | null): Action[] {
  if (value.examine === undefined) return [];
  const said: ActionResult = { kind: 'say', text: value.examine, key: localeKey(namespace, 'entity', value.id, EXAMINE_FIELD) };
  const marked: ActionResult = { kind: 'set', variable: `${value.id}.${TOUCHED}` };
  return [{ id: EXAMINE_FIELD, label: EXAMINE_FIELD, generatedLabel: true, kind: 'instant', results: [said, marked] } as Action];
}

const mintedOffers = (value: { id: string; examine?: string }): MintedAction[] => mintedActions(value, null).map((action) => ({ action, from: `${EXAMINE_FIELD}:` }));

export const isMintedAction = (action: Action): boolean => declaredId(action) === EXAMINE_FIELD;

export function offersNothing(entity: Entity, dialogues: ReadonlyMap<string, Dialogue>, stoodIn: string): string | undefined {
  if (entity.actions.length > 0 || entity.shop !== undefined || entity.capabilities.length > 0) return undefined;
  if (Object.keys(entity.stats).length > 0 || spokenBy(dialogues, entity.id).length > 0) return undefined;
  return `stands in ${stoodIn} and offers a player nothing there: no examine:, no action of its own or named in uses:, no stations:, no keeps shop:, no stats: to fight and no # dialogue that owns it. Give it something to do, or take it out of that location's entities:.`;
}

export const statAssignmentValue: Parser<[string, Range]> = {
  parse(cursor) {
    const statId = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return [statId, range.parse(cursor)];
  },
  print: ([statId, value]) => `${id.print(statId)} ${range.print(value)}`,
  forms: ['<stat> <amount>'],
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
  forms: ['<entity>', '<count> <entity>'],
  examples: ['bandit', '2 bandit'],
};

const HANDLER_LABEL = /^on[ \t]+(?<event>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)$/;

export const handlerEvent = (label: string): string | undefined => HANDLER_LABEL.exec(label)?.groups?.event;

export const isHandlerBlock = (block: EntityBlock): block is HandlerBlock => 'event' in block;

const entityBlock: EntryBody = {
  grammar: [...actionBody.grammar, { form: 'on <event>:', example: 'on death:', family: HOOK_FAMILY, block: resultGrammar }],
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
  flags: [TOUCHED],
  says: (value) => [...value.blocks.flatMap((block) => (isHandlerBlock(block) ? [block.results] : actionResultLists(block))), value.onHit, value.whenHit],
  kind: 'entity',
  ids: 'owned',
  vocabulary: 'declared',
  maps: {
    entities: (value: AuthoredEntity): readonly (readonly [string, Entity])[] => [[value.id, { ...value, actions: [], handlers: [] }]],
  },
  nestsActions: 'only while the player stands in a location this entity stands in',
  mintedActions: mintedOffers,
  text: ['title', EXAMINE_FIELD],
  fields: {
    title: TITLE_FIELD,
    group: GROUP_FIELD,
    examine: { parser: text, note: `offered as an action addressed \`${EXAMINE_FIELD}\`, which says these words. Until it is taken, this thing stands under a placeholder with nothing else on offer` },
    hiddenIf: hiddenIf('the entity is not there to be met or robbed while this holds'),
    respawnAfter: { parser: duration, keyword: 'respawn after' },
    capabilities: {
      parser: list(id),
      keyword: 'stations',
      default: () => [],
      block: true,
      names: { id: 'station' },
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
      names: { id: 'skill' },
    },
    passives: { parser: list(id), default: () => [], names: { id: 'passive' } },
    equipmentSlots: {
      parser: list(id),
      keyword: 'equipment-slots',
      default: () => [],
    },
    shop: { parser: id, keyword: 'keeps shop', names: { id: 'shop' }, standsWithout: true },
    uses: { parser: list(id), default: () => [], names: { id: 'action' } },
    faction: { parser: list(id), default: () => [], names: { id: 'faction' } },
    allies: { parser: list(allyValue), default: () => [] },
    flags: { parser: list(id), default: () => [], block: true },
    ...HOOK_FIELDS,
  },
  keywords: ['aggressive'],
  needs: { respawnAfter: 'stats', onHit: 'stats', whenHit: 'stats', aggressive: 'stats', allies: 'stats' },
  keywordsAfter: 'examine',
  entries: { into: 'blocks', body: entityBlock },
  visit: (value, where, visit) => {
    const held = value as unknown as Loose;
    for (const assignment of listMembers<[string, unknown]>(held.stats)) assignment[0] = visit('stat', assignment[0], `${where} stats:`);
    for (const entry of listMembers<Ally>(held.allies)) put(entry, 'entity', 'entity', `${where} allies:`, visit);
    blocks(held.blocks, where, visit);
    hooks(held, where, visit);
  },
  prune: (value, at, where) => {
    const stats = Object.fromEntries(Object.entries(value.stats).filter(([statId]) => !at.gone('stat', statId, `${where} stats:`)));
    const blocks = pruneBlocks(value.blocks, where, at);
    const allies = value.allies.filter((entry) => !at.gone('entity', entry.entity, `${where} allies:`));
    const onHit = pruneHook(value.onHit, `${where} on hit:`, at);
    const whenHit = pruneHook(value.whenHit, `${where} when hit:`, at);
    const kept =
      Object.keys(stats).length === Object.keys(value.stats).length && blocks.length === value.blocks.length && allies.length === value.allies.length && onHit === value.onHit && whenHit === value.whenHit;
    return kept ? value : { ...value, stats, blocks, allies, onHit, whenHit };
  },
});

const pruneBlocks = (list: readonly EntityBlock[], where: string, at: Pruning): EntityBlock[] => list.filter((block) => at.intact(() => blocks([block], where, at.visit)));

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
