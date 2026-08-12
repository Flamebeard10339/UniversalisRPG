import { Action, actionBody } from '../grammar/action';
import { HOOK_FIELDS, HookCarrier } from '../grammar/hook';
import { list } from '../grammar/list';
import { Cursor, DslError, Parser } from '../grammar/parser';
import { Authored, SectionSchema } from '../grammar/section';
import { TagClause, tagClause } from '../grammar/tagClause';
import { article, humanize, id, number, text } from '../grammar/values';

// The value `cluster-effect:` takes: a percentage and a stat, per the spec's
// c15 ("names a percentage and a stat") — a narrower grammar than
// `tagClause`'s, which also accepts a flat, ranged or keyword clause. Written
// `+25% max-health`, the same `+N%` token the language already uses elsewhere.
export interface ClusterEffect {
  statId: string;
  percent: number;
}

export interface Item extends HookCarrier {
  id: string;
  title: string;
  examine: string;
  slot?: string;
  tags: TagClause[];
  actions: Action[];
  // Names a `# cluster-jewel` to become the droppable jewel, so it drops
  // through `droptables` and is carried by the ordinary item machinery (c10).
  clusterJewel?: string;
  clusterEffect?: ClusterEffect;
  itemExperience?: number;
  maxLevel: number;
}

export type AuthoredItem = Authored<Item>;

const CLUSTER_EFFECT = /^(?<sign>[+-])(?<amount>\d+)%[ \t]+(?<stat>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)$/;

const clusterEffect: Parser<ClusterEffect> = {
  parse(cursor: Cursor) {
    const start = cursor.pos;
    const raw = (cursor.take(/[^\n]+/) ?? '').trim();
    const groups = CLUSTER_EFFECT.exec(raw)?.groups;
    if (!groups) throw new DslError(`expected a percent stat bonus like +25% max-health, got ${JSON.stringify(raw)}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    return { statId: groups.stat!, percent: Number(groups.amount) * (groups.sign === '-' ? -1 : 1) };
  },
};

// `max-level:` defaults to 99 — an "unbounded" sentinel a base can lower to
// tier itself, per the spec's decision on the field.
export const DEFAULT_MAX_LEVEL = 99;

export const itemSchema: SectionSchema<Item, never, 'actions'> = {
  kind: 'item',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text, default: (self) => `This is ${article(self.title)} ${self.title}.` },
    slot: { parser: id },
    tags: { parser: list(tagClause), default: () => [] },
    clusterJewel: { parser: id, keyword: 'cluster-jewel' },
    clusterEffect: { parser: clusterEffect, keyword: 'cluster-effect' },
    itemExperience: { parser: number, keyword: 'item-experience' },
    maxLevel: { parser: number, default: () => DEFAULT_MAX_LEVEL, keyword: 'max-level' },
    ...HOOK_FIELDS,
  },
  clauses: 'tags',
  entries: { into: 'actions', body: actionBody },
};
