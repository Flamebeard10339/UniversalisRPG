import { actionResultLists } from '../../grammar/action';
import { Action, actionBody } from '../../grammar/action';
import { Condition, condition as conditionValue } from '../../grammar/condition';
import { HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
import { Cursor, DslError, Parser } from '../../grammar/parser';
import { range, Range } from '../../grammar/range';
import { TagClause, tagClause } from '../../grammar/tagClause';
import { id, number, text } from '../../grammar/values';
import { actions, condition as visitCondition, hooks, pruneActions, pruneHook, pruneTags, put, visitTags, type Loose } from '../refs';
import { carriedJewel, ClusterJewel, clusterJewel as clusterJewelSection, jewelCarried } from './clusterJewel';
import { section } from './define';
import { GROUP_FIELD } from './group';
import { TITLE_FIELD } from './info';

export interface ClusterEffect {
  statId: string;
  percent: number;
}

export interface AuthoredItem extends HookCarrier {
  id: string;
  title: string;
  examine?: string;
  slot?: string;
  requires?: Condition;
  tags: TagClause[];
  actions: Action[];
  jewel?: string | ClusterJewel;
  originCluster?: string;
  clusterEffect?: ClusterEffect;
  itemLevel?: Range;
  group?: string;
  value?: number;
}

export interface Item extends AuthoredItem {
  clusterJewel?: string;
}

// Which jewel this item is: the one it names, or the one it carries, which stands at the item's own id.
const jewelIdOf = (item: AuthoredItem): string | undefined => (typeof item.jewel === 'string' ? item.jewel : item.jewel?.id);

const jewelCarriedBy = (item: AuthoredItem): ClusterJewel | undefined => (typeof item.jewel === 'object' ? item.jewel : undefined);

const CARRIES_ONE = 'the jewel it is, written out where nothing else names one. It stands at this item\'s own id and says this item\'s title: and examine:';

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

export const isBase = (item: AuthoredItem): boolean => item.itemLevel !== undefined;

function roleProblem(item: AuthoredItem): string | undefined {
  if (item.requires !== undefined && item.slot === undefined) {
    return `requires: is what has to hold of whoever puts ${item.id} on, and nothing without a slot: is ever put on: give it a slot: or drop the field`;
  }
  if (item.value !== undefined && item.value <= 0) {
    return `value: is what a shop prices one of these at, and ${item.value} prices it at nothing: leave the line out and ${item.id} is untradable`;
  }
  if (item.itemLevel !== undefined && item.itemLevel.min < 1) {
    return `item-level: is how many points one of these drops carrying, and ${range.print(item.itemLevel)} lets one drop with none: the lowest a base rolls is 1`;
  }
  if (item.itemLevel !== undefined && item.slot === undefined) {
    return `item-level: gives ${item.id} a plane, and a plane is only ever read off what the player is wearing: give it a slot: or drop the field`;
  }
  if (item.jewel !== undefined && (isBase(item) || item.originCluster !== undefined)) {
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

export const item = section<AuthoredItem, never, 'actions'>()({
  says: (value) => [...value.actions.flatMap(actionResultLists), value.onHit, value.whenHit],
  kind: 'item',
  ids: 'owned',
  vocabulary: 'declared',
  maps: {
    items: (value): readonly (readonly [string, Item])[] => [[value.id, { ...value, clusterJewel: jewelIdOf(value) }]],
    clusterJewels: (value): readonly (readonly [string, ClusterJewel])[] => {
      const carried = jewelCarriedBy(value);
      return carried === undefined ? [] : [[value.id, carried]];
    },
  },
  nestsActions: 'wherever the player is carrying one, since an item goes where the player goes',
  text: ['title', 'examine'],
  fields: {
    title: TITLE_FIELD,
    group: GROUP_FIELD,
    examine: { parser: text },
    slot: { parser: id, note: 'the slots are every id any equipment-slots: names, so this declares one as much as it uses one; a # slot only supplies display words for it' },
    requires: { parser: conditionValue, note: 'what has to hold of whoever puts this on; while it does not, the thing is carried and not worn' },
    itemLevel: {
      parser: range,
      keyword: 'item-level',
      note: 'how many points one of these drops carrying, rolled once on arrival and fixed on that copy; two copies that rolled differently do not stack',
    },
    tags: { parser: list(tagClause), default: () => [] },
    jewel: {
      parser: carriedJewel,
      keyword: 'cluster-jewel',
      names: { id: 'cluster-jewel' },
      block: true,
      note: CARRIES_ONE,
      hydrate: (parsed, self, context) => (typeof parsed === 'string' ? parsed : jewelCarried(parsed as object, self, context)),
      dehydrate: (held) => (typeof held === 'string' ? undefined : [held]),
    },
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
    visitCondition(value.requires, `${where} requires:`, visit);
    actions(held.actions, where, visit);
    hooks(held, where, visit);
    if (held.clusterEffect) put(held.clusterEffect as Loose & { statId: string }, 'statId', 'stat', `${where} cluster-effect:`, visit);
    // A jewel written out here holds names of its own, and reading them is the jewel's own business.
    if (held.jewel !== null && typeof held.jewel === 'object') clusterJewelSection.visit(held.jewel as ClusterJewel, `${where} cluster-jewel:`, visit);
  },
  prune: (value, at, where) => {
    // A wear requirement is a gate, and a gate nobody can read is not a gate: an item asking for a
    // skill the world has stopped declaring goes the way an entity whose `hidden if:` lost its
    // subject goes, rather than quietly becoming a thing anyone may put on.
    if (!at.intact(() => visitCondition(value.requires, `${where} requires:`, at.visit))) return null;
    const tags = pruneTags(value.tags, where, at);
    const kept = pruneActions(value.actions, where, at);
    const onHit = pruneHook(value.onHit, `${where} on hit:`, at);
    const whenHit = pruneHook(value.whenHit, `${where} when hit:`, at);
    const clusterEffect = value.clusterEffect?.statId === undefined || !at.gone('stat', value.clusterEffect.statId, `${where} cluster-effect:`) ? value.clusterEffect : undefined;
    const carried = jewelCarriedBy(value);
    const jewel = carried === undefined ? value.jewel : (clusterJewelSection.prune(carried, at, `${where} cluster-jewel:`) ?? undefined);
    return tags.length === value.tags.length && kept.length === value.actions.length && onHit === value.onHit && whenHit === value.whenHit && clusterEffect === value.clusterEffect && jewel === value.jewel
      ? value
      : { ...value, tags, actions: kept, onHit, whenHit, clusterEffect, jewel };
  },
});
