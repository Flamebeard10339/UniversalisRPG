import { list } from '../../grammar/list';
import { Cursor, DslError, Parser } from '../../grammar/parser';
import { decimal, duration, id, Quantified, quantified } from '../../grammar/values';
import { quantified as quantifiedItems, type Loose, type Pruning, type Visit } from '../refs';
import { section } from './define';
import { Item } from './item';

export const DEFAULT_BUYING = 1.2;
export const DEFAULT_SELLING = 0.8;
export const DEFAULT_REPLENISH = 60_000;

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
}

const acceptsValue: Parser<Accepts> = {
  parse(cursor: Cursor) {
    const start = cursor.pos;
    const raw = cursor.take(/[a-z][a-z0-9-]*/);
    if (raw === null || !(ACCEPTS as readonly string[]).includes(raw)) {
      throw new DslError(`a shop accepts one of ${ACCEPTS.join(', ')}, got ${JSON.stringify(raw ?? cursor.rest())}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    }
    return raw as Accepts;
  },
  print: (value) => value,
  forms: [...ACCEPTS],
  examples: [...ACCEPTS],
};

export const isTradable = (item: Item | undefined): boolean => item?.value !== undefined;

// The level the author declared, which is what replenishing walks the current count back toward.
export function declaredStock(shop: Shop): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const entry of shop.stocks) levels[entry.item] = entry.amount ?? 1;
  return levels;
}

export const stocksItem = (shop: Shop, itemId: string): boolean => shop.stocks.some((entry) => entry.item === itemId);

// The shop pays a cut under an item's value and charges a cut over it, and coin is whole, so the rounding goes the shop's way on both sides. That is also what keeps a buy price above a sell price at every value, so nothing can be bought and sold back at a profit.
export const buyPrice = (shop: Shop, item: Item | undefined): number | undefined => (item?.value === undefined ? undefined : Math.ceil(item.value * shop.buying));

export const sellPrice = (shop: Shop, item: Item | undefined): number | undefined => (item?.value === undefined ? undefined : Math.floor(item.value * shop.selling));

// The shop's own coin is what a price is counted in, so trading it for itself is the one thing no shop does, whatever an author gave it a value of.
export const takesItem = (shop: Shop, item: Item | undefined): boolean => isTradable(item) && item!.id !== shop.coin && (shop.accepts === 'any' || stocksItem(shop, item!.id));

// A shop can only put a price on what declares one, so the stock an author wrote has to be priceable before anyone stands in front of it.
export function unpriceableStock(shop: Shop, items: ReadonlyMap<string, Item>): string | undefined {
  const found = shop.stocks.find((entry) => !isTradable(items.get(entry.item)));
  return found === undefined ? undefined : `# shop ${shop.id} stocks: names ${found.item}, which declares no value: and so is untradable`;
}

// How many units of replenishing have fallen due in an elapsed span, and what is left over. Settling to `at + steps * replenish` rather than to now is what keeps a shop traded with every few seconds from replenishing never.
export function replenishSteps(shop: Shop, elapsed: number): number {
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / shop.replenish);
}

const toward = (from: number, to: number, steps: number): number => (from < to ? Math.min(to, from + steps) : Math.max(to, from - steps));

// The counts a shop holds once `steps` units of replenishing have landed. Every item it holds or stocks moves one nearer its declared level per step — an unstocked one toward zero, where it stops being held at all.
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
  map: 'shops',
  fields: {
    coin: { parser: id, names: { id: 'item' }, note: 'the item this shop counts in, which is therefore the one thing it will neither buy nor sell' },
    stocks: { parser: list(quantified), default: () => [], block: true },
    buying: { parser: decimal, default: () => DEFAULT_BUYING, printed: 'unless-default' },
    selling: { parser: decimal, default: () => DEFAULT_SELLING, printed: 'unless-default' },
    replenish: { parser: duration, default: () => DEFAULT_REPLENISH, printed: 'unless-default' },
    accepts: { parser: acceptsValue, default: () => 'any', printed: 'unless-default' },
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
