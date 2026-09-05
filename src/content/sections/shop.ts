import { list } from '../../grammar/list';
import { decimal, duration, id, oneOf, Quantified, quantified } from '../../grammar/values';
import { quantified as quantifiedItems, type Loose, type Pruning, type Visit } from '../refs';
import type { Condition } from '../../grammar/condition';
import { hiddenIf, section } from './define';
import { Item } from './item';

export const DEFAULT_BUYING = 1.2;
export const DEFAULT_SELLING = 0.8;
export const DEFAULT_REPLENISH = 60;

export const ACCEPTS = ['any', 'stocked'] as const;

export type Accepts = (typeof ACCEPTS)[number];

export interface Shop {
  id: string;
  coin: string;
  stocks: Quantified[];
  buying: number;
  selling: number;
  replenish: number;
  accepts: Accepts;
  hiddenIf?: Condition;
}

const acceptsValue = oneOf('accepts', ACCEPTS, { complaint: 'what a shop accepts' });

export const isTradable = (item: Item | undefined): boolean => item?.value !== undefined;

export function declaredStock(shop: Shop): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const entry of shop.stocks) levels[entry.item] = entry.amount ?? 1;
  return levels;
}

export const stocksItem = (shop: Shop, itemId: string): boolean => shop.stocks.some((entry) => entry.item === itemId);

export const buyPrice = (shop: Shop, item: Item | undefined): number | undefined => (item?.value === undefined ? undefined : Math.ceil(item.value * shop.buying));

export const sellPrice = (shop: Shop, item: Item | undefined): number | undefined => (item?.value === undefined ? undefined : Math.floor(item.value * shop.selling));

export const takesItem = (shop: Shop, item: Item | undefined): boolean => isTradable(item) && item!.id !== shop.coin && (shop.accepts === 'any' || stocksItem(shop, item!.id));

export function unpriceableStock(shop: Shop, items: ReadonlyMap<string, Item>): string | undefined {
  const found = shop.stocks.find((entry) => !isTradable(items.get(entry.item)));
  return found === undefined ? undefined : `# shop ${shop.id} stocks: names ${found.item}, which declares no value: and so is untradable`;
}

export function replenishSteps(shop: Shop, elapsedSeconds: number): number {
  if (elapsedSeconds < 0) return 0;
  return Math.floor(elapsedSeconds / shop.replenish);
}

const toward = (from: number, to: number, steps: number): number => (from < to ? Math.min(to, from + steps) : Math.max(to, from - steps));

export function replenished(shop: Shop, counts: Readonly<Record<string, number>>, steps: number): Record<string, number> {
  const levels = declaredStock(shop);
  const moved: Record<string, number> = {};
  for (const itemId of new Set([...Object.keys(levels), ...Object.keys(counts)])) {
    const held = toward(counts[itemId] ?? 0, levels[itemId] ?? 0, steps);
    if (held > 0) moved[itemId] = held;
  }
  return moved;
}

export const shop = section<Shop>()({
  kind: 'shop',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'shops',
  fields: {
    coin: { parser: id, names: { id: 'item' }, note: 'the item this shop counts in, which is therefore the one thing it will neither buy nor sell' },
    stocks: { parser: list(quantified), default: () => [], block: true },
    buying: { parser: decimal, default: () => DEFAULT_BUYING, printed: 'unless-default', example: '1.5', note: "a multiplier on an item's `value:`, and what the player pays for one — so a shop marks up whatever it sells" },
    selling: { parser: decimal, default: () => DEFAULT_SELLING, printed: 'unless-default', example: '0.5', note: "a multiplier on an item's `value:`, and what the player is paid for one" },
    replenish: { parser: duration, default: () => DEFAULT_REPLENISH, printed: 'unless-default', note: 'how long one unit of stock takes to come back, so a shop emptied of four is whole again after four of these' },
    accepts: { parser: acceptsValue, default: () => 'any', printed: 'unless-default' },
    hiddenIf: hiddenIf('the counter is not kept while this holds, so nothing is bought or sold here — which is how a quest opens a shop that was not there before, or shuts one'),
  },
  validate: (value) => {
    if (!value.coin) return 'requires a coin:, which is the item its prices are counted in';
    if (value.stocks.some((entry) => entry.item === value.coin)) return `stocks: names ${value.coin}, which is this shop's own coin: and so is the one thing it does not trade`;
    if (value.buying <= 0) return `buying: is a multiplier on an item's value, so ${value.buying} would price everything at nothing`;
    if (value.selling <= 0) return `selling: is a multiplier on an item's value, so ${value.selling} would pay nothing for anything`;
    if (value.replenish <= 0) return 'replenish: is how long one unit of stock takes to come back, so it cannot be instant';
    const twice = value.stocks.map((entry) => entry.item).find((item, at, all) => all.indexOf(item) !== at);
    return twice === undefined ? undefined : `stocks: names ${twice} twice, and a shop holds one level per item`;
  },
  visit: (value, where, visit: Visit) => quantifiedItems((value as unknown as Loose).stocks, 'item', `${where} stocks:`, visit),
  prune: (value, at: Pruning, where) => {
    const stocks = value.stocks.filter((entry) => !at.gone('item', entry.item, `${where} stocks:`));
    return stocks.length === value.stocks.length ? value : { ...value, stocks };
  },
});
