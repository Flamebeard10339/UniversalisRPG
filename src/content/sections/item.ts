import { actionResultLists } from '../../grammar/action';
import { Action, actionBody } from '../../grammar/action';
import { HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
import { Cursor, DslError, Parser } from '../../grammar/parser';
import { TagClause, tagClause } from '../../grammar/tagClause';
import { id, number, text } from '../../grammar/values';
import { actions, hooks, pruneActions, pruneHook, pruneTags, put, visitTags, type Loose, type ReferenceKind } from '../refs';
import { section } from './define';
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
  itemExperience?: number;
  maxLevel: number;
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

export const DEFAULT_MAX_LEVEL = 99;

export const isBase = (item: Item): boolean => item.slot !== undefined;

function roleProblem(item: Item): string | undefined {
  if (item.clusterJewel !== undefined && (isBase(item) || item.originCluster !== undefined)) {
    return `cluster-jewel: makes ${item.id} a jewel, which is exclusive with the ${isBase(item) ? 'slot:' : 'origin-cluster:'} that makes it a base`;
  }
  if (item.clusterEffect !== undefined && (isBase(item) || item.originCluster !== undefined)) {
    return `cluster-effect: makes ${item.id} an orb, which is exclusive with the ${isBase(item) ? 'slot:' : 'origin-cluster:'} that makes it a base`;
  }
  if (item.originCluster !== undefined && !isBase(item)) {
    return `origin-cluster: is the cluster hex (0,0) of ${item.id}'s plane, and only a base has one: give it a slot: or drop the field`;
  }
  return undefined;
}

export const item = section<Item, never, 'actions'>()({
  says: (value) => [...value.actions.flatMap(actionResultLists), value.onHit, value.whenHit],
  kind: 'item',
  ids: 'owned',
  map: 'items',
  nestsActions: true,
  text: ['title', 'examine'],
  fields: {
    title: TITLE_FIELD,
    examine: { parser: text },
    slot: { parser: id },
    tags: { parser: list(tagClause), default: () => [] },
    clusterJewel: { parser: id, keyword: 'cluster-jewel' },
    originCluster: { parser: id, keyword: 'origin-cluster' },
    clusterEffect: { parser: clusterEffectValue, keyword: 'cluster-effect' },
    itemExperience: { parser: number, keyword: 'item-experience' },
    maxLevel: {
      parser: number,
      default: () => DEFAULT_MAX_LEVEL,
      keyword: 'max-level',
      printed: 'unless-default',
    },
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
    put(held, 'clusterJewel', 'cluster-jewel', `${where} cluster-jewel:`, visit);
    put(held, 'originCluster', 'cluster-jewel', `${where} origin-cluster:`, visit);
    if (held.clusterEffect) put(held.clusterEffect as Loose & { statId: string }, 'statId', 'stat', `${where} cluster-effect:`, visit);
  },
  prune: (value, at, where) => {
    const present = (kind: ReferenceKind, ref: string | undefined, site: string): boolean => ref === undefined || !at.gone(kind, ref, `${where} ${site}`);
    if (!present('cluster-jewel', value.clusterJewel, 'cluster-jewel:')) return null;
    const tags = pruneTags(value.tags, where, at);
    const kept = pruneActions(value.actions, where, at);
    const onHit = pruneHook(value.onHit, `${where} on hit:`, at);
    const whenHit = pruneHook(value.whenHit, `${where} when hit:`, at);
    const originCluster = present('cluster-jewel', value.originCluster, 'origin-cluster:') ? value.originCluster : undefined;
    const clusterEffect = present('stat', value.clusterEffect?.statId, 'cluster-effect:') ? value.clusterEffect : undefined;
    return tags.length === value.tags.length && kept.length === value.actions.length && onHit === value.onHit && whenHit === value.whenHit && originCluster === value.originCluster && clusterEffect === value.clusterEffect
      ? value
      : { ...value, tags, actions: kept, onHit, whenHit, originCluster, clusterEffect };
  },
});
