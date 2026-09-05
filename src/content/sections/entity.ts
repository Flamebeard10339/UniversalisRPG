import { actionResultLists } from '../../grammar/action';
import { Action, actionBody } from '../../grammar/action';
import { ActionResult, resultBlock, resultGrammar, resultList } from '../../grammar/actionResult';
import { Condition } from '../../grammar/condition';
import { HOOK_FAMILY, HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
import { Parser } from '../../grammar/parser';
import { Range, range } from '../../grammar/range';
import { REFERENCE } from '../../grammar/structure';
import { EntryBody, isFieldEdits, listMembers } from '../../grammar/section';
import { statBonus, TagClause } from '../../grammar/tagClause';
import { counted, duration, id, number, text } from '../../grammar/values';
import { localeKey } from '../locale';
import { put, results, visitAction, type Loose, type Pruning, type Visit } from '../refs';
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
  stats: [string, Range][];
  modifiers: TagClause[];
  skills: string[];
  passives: string[];
  equipmentSlots: string[];
  flags: string[];
  shop?: string;
  uses: string[];
  faction: string[];
  allies: Ally[];
  aggressive: boolean;
  tier?: string;
  profile?: string;
  level?: number;
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

export const SHAPE_FIELDS = ['tier', 'profile', 'level'] as const;

const A_SHEET = ['stats', ...SHAPE_FIELDS] as const;

export interface WrittenStats {
  stats: readonly (readonly [string, Range])[];
}

export const statWritten = (sheet: WrittenStats | undefined, statId: string): Range | undefined => sheet?.stats.find(([each]) => each === statId)?.[1];

export const statsWrittenOn = (sheet: WrittenStats): string[] => sheet.stats.map(([statId]) => statId);

export const carriesASheet = (entity: AuthoredEntity): boolean => entity.stats.length > 0 || entity.modifiers.length > 0 || SHAPE_FIELDS.some((field) => entity[field] !== undefined);

export function offersNothing(entity: Entity, dialogues: ReadonlyMap<string, Dialogue>, stoodIn: string): string | undefined {
  if (entity.actions.length > 0 || entity.shop !== undefined || entity.capabilities.length > 0) return undefined;
  if (carriesASheet(entity) || spokenBy(dialogues, entity.id).length > 0) return undefined;
  return `stands in ${stoodIn} and offers a player nothing there: no examine:, no action of its own or named in uses:, no stations:, no keeps shop:, no stats: to fight and no # dialogue that owns it. Give it something to do, or take it out of that location's entities:.`;
}

export const statAssignmentValue: Parser<[string, Range]> = {
  parse(cursor) {
    const statId = id.parse(cursor);
    cursor.take(/[ \t]+/);
    return [statId, range.parse(cursor)];
  },
  print: ([statId, value]) => `${id.print(statId)} ${range.print(value)}`,
  lands: [{ how: 'ref', field: '0', names: 'stat' }],
  forms: ['<stat> <amount>'],
  examples: ['attack 4', 'attack 4-7'],
};

const sheetAfter = (held: unknown, written: unknown): [string, Range][] => {
  const by = new Map<string, [string, Range]>();
  if (!isFieldEdits(written)) {
    for (const assignment of written as [string, Range][]) by.set(assignment[0], assignment);
    return [...by.values()];
  }
  for (const assignment of listMembers<[string, Range]>(held)) by.set(assignment[0], assignment);
  for (const { op, values } of written.ops)
    for (const assignment of values as [string, Range][]) {
      if (op === '-') by.delete(assignment[0]);
      else by.set(assignment[0], assignment);
    }
  return [...by.values()];
};

export const allyValue: Parser<Ally> = counted('a roster of 0 brings nobody, so leave the line out', ['bandit', '2 bandit']);

const HANDLER_LABEL = new RegExp(`^on[ \\t]+(?<event>${REFERENCE.source})$`);

export const handlerEvent = (label: string): string | undefined => HANDLER_LABEL.exec(label)?.groups?.event;

export const isHandlerBlock = (block: EntityBlock): block is HandlerBlock => 'event' in block;

const entityBlock: EntryBody = {
  reads: [...actionBody.reads, ['on <event>', resultList]],
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
    tier: {
      parser: id,
      names: { id: 'tier' },
      standsWithout: true,
      note: 'what this is worth fighting, which is what its toughness, its damage and what an hour of it pays are all read against. A body that names none is not audited against any of them',
    },
    profile: {
      parser: id,
      names: { id: 'profile' },
      standsWithout: true,
      note: 'the shape this fights in: how the budget its tier allows is spent across how hard it hits, how often, and how much it can stand. A body that names none is shaped however its own stats fell out',
    },
    level: {
      parser: number,
      standsWithout: true,
      note: 'the level a player is meant to meet this at, which is the character its tier and its profile are both read against. A body that names none is read at whatever level its own numbers happen to answer to',
    },
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
      default: () => [],
      merge: sheetAfter,
      note: 'the whole of a stat, written out. It stands in place of whatever a tier:, a profile: and a level: would otherwise have derived for that stat, and is what to write where a number is load-bearing for the encounter rather than a consequence of the shape',
    },
    modifiers: {
      parser: list(statBonus),
      default: () => [],
      block: true,
      note: 'what this body carries, laid over the stat each names rather than replacing it — so a modifier moves a derived number without pinning it. Flat and percent fold together the way they do on an item or a passive: everything added first, then every percent at once',
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
  needs: { respawnAfter: A_SHEET, onHit: A_SHEET, whenHit: A_SHEET, aggressive: A_SHEET, allies: A_SHEET },
  keywordsAfter: 'examine',
  entries: { into: 'blocks', body: entityBlock },
  visit: (value, where, visit) => blocks((value as unknown as Loose).blocks, where, visit),
  prune: (value, at, where) => {
    const kept = pruneBlocks(value.blocks, where, at);
    return kept.length === value.blocks.length ? value : { ...value, blocks: kept };
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

export const shapedByItsTags = (entity: AuthoredEntity): boolean => SHAPE_FIELDS.every((field) => entity[field] !== undefined);
