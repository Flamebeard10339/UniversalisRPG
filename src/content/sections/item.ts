import { actionResultLists } from '../../grammar/action';
import { Action, actionBody } from '../../grammar/action';
import { HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
import { Cursor, DslError, Parser } from '../../grammar/parser';
import { range, Range } from '../../grammar/range';
import { TagClause, tagClause } from '../../grammar/tagClause';
import { id, number, text } from '../../grammar/values';
import { actions, hooks, pruneActions, pruneHook, pruneTags, put, visitTags, type Loose } from '../refs';
import { section } from './define';
import { GROUP_FIELD } from './group';
import { TITLE_FIELD } from './info';

export interface ClusterEffect {
  statId: string;
  percent: number;
}

export interface Item extends HookCarrier {
  id: string;
  title: string;
  examine?: string;
  slot?: string;
  tags: TagClause[];
  actions: Action[];
  clusterJewel?: string;
  originCluster?: string;
  clusterEffect?: ClusterEffect;
  itemLevel?: Range;
  group?: string;
  value?: number;
}

const CLUSTER_EFFECT = /^(?<sign>[+-])(?<amount>\d+)%[ \t]+(?<stat>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)$/;

export const clusterEffectValue: Parser<ClusterEffect> = {
  parse(cursor: Cursor) {
    const start = cursor.pos;
    const raw = (cursor.take(/[^\n]+/) ?? '').trim();
    const groups = CLUSTER_EFFECT.exec(raw)?.groups;
    if (!groups) throw new DslError(`expected a percent stat bonus like +25% max-health, got ${JSON.stringify(raw)}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    return {
      statId: groups.stat!,
      percent: Number(groups.amount) * (groups.sign === '-' ? -1 : 1),
    };
  },
  print: (value) => `${value.percent < 0 ? '-' : '+'}${Math.abs(value.percent)}% ${value.statId}`,
  forms: ['+<percent>% <stat>', '-<percent>% <stat>'],
  examples: ['+25% max-health', '-10% max-health'],
};

export const isBase = (item: Item): boolean => item.itemLevel !== undefined;

function roleProblem(item: Item): string | undefined {
  if (item.value !== undefined && item.value <= 0) {
    return `value: is what a shop prices one of these at, and ${item.value} prices it at nothing: leave the line out and ${item.id} is untradable`;
  }
  if (item.itemLevel !== undefined && item.itemLevel.min < 1) {
    return `item-level: is how many points one of these drops carrying, and ${range.print(item.itemLevel)} lets one drop with none: the lowest a base rolls is 1`;
  }
  if (item.itemLevel !== undefined && item.slot === undefined) {
    return `item-level: gives ${item.id} a plane, and a plane is only ever read off what the player is wearing: give it a slot: or drop the field`;
  }
  if (item.clusterJewel !== undefined && (isBase(item) || item.originCluster !== undefined)) {
    return `cluster-jewel: makes ${item.id} a jewel, which is exclusive with the ${isBase(item) ? 'item-level:' : 'origin-cluster:'} that makes it a base`;
  }
  if (item.clusterEffect !== undefined && (isBase(item) || item.originCluster !== undefined)) {
    return `cluster-effect: makes ${item.id} an orb, which is exclusive with the ${isBase(item) ? 'item-level:' : 'origin-cluster:'} that makes it a base`;
  }
  if (item.originCluster !== undefined && !isBase(item)) {
    return `origin-cluster: is the cluster hex (0,0) of ${item.id}'s plane, and only a base has one: give it an item-level: or drop the field`;
  }
  return undefined;
}

export const item = section<Item, never, 'actions'>()({
  says: (value) => [...value.actions.flatMap(actionResultLists), value.onHit, value.whenHit],
  kind: 'item',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'items',
  nestsActions: 'wherever the player is carrying one, since an item goes where the player goes',
  text: ['title', 'examine'],
  fields: {
    title: TITLE_FIELD,
    group: GROUP_FIELD,
    examine: { parser: text },
    slot: { parser: id, note: 'the slots are every id any equipment-slots: names, so this declares one as much as it uses one; a # slot only supplies display words for it' },
    itemLevel: {
      parser: range,
      keyword: 'item-level',
      note: 'how many points one of these drops carrying, rolled once on arrival and fixed on that copy; declaring it is what gives the item a plane, and what makes two copies different enough that neither joins a stack',
    },
    tags: { parser: list(tagClause), default: () => [] },
    clusterJewel: { parser: id, keyword: 'cluster-jewel', names: { id: 'cluster-jewel' } },
    originCluster: { parser: id, keyword: 'origin-cluster', names: { id: 'cluster-jewel' }, standsWithout: true },
    clusterEffect: { parser: clusterEffectValue, keyword: 'cluster-effect' },
    value: { parser: number, note: 'what one of these is worth in coin, and the only thing that makes it tradable: an item declaring no value is one no shop will price' },
    ...HOOK_FIELDS,
  },
  clauses: 'tags',
  entries: { into: 'actions', body: actionBody },
  validate: roleProblem,
  visit: (value, where, visit) => {
    const held = value as unknown as Loose;
    visitTags(held.tags, where, visit);
    actions(held.actions, where, visit);
    hooks(held, where, visit);
    if (held.clusterEffect) put(held.clusterEffect as Loose & { statId: string }, 'statId', 'stat', `${where} cluster-effect:`, visit);
  },
  prune: (value, at, where) => {
    const tags = pruneTags(value.tags, where, at);
    const kept = pruneActions(value.actions, where, at);
    const onHit = pruneHook(value.onHit, `${where} on hit:`, at);
    const whenHit = pruneHook(value.whenHit, `${where} when hit:`, at);
    const clusterEffect = value.clusterEffect?.statId === undefined || !at.gone('stat', value.clusterEffect.statId, `${where} cluster-effect:`) ? value.clusterEffect : undefined;
    return tags.length === value.tags.length && kept.length === value.actions.length && onHit === value.onHit && whenHit === value.whenHit && clusterEffect === value.clusterEffect
      ? value
      : { ...value, tags, actions: kept, onHit, whenHit, clusterEffect };
  },
});
