import { Registry } from '../content/registry';
import { Item } from '../content/sections/item';
import { buyPrice, declaredStock, replenished, replenishSteps, sellPrice, Shop, takesItem } from '../content/sections/shop';
import { RuntimeError } from './error';
import { carriesItem, destroyItem, handOver, HandOver, isGrownCopy, itemTemplate, packRows, receiveItem, roomToPack, spendableCount } from './itemInstance';
import { packKey } from './packOrder';
import { GameState, ShopStock } from './state';

export const isShopStock = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const held = value as Record<string, unknown>;
  if (typeof held.at !== 'number' || !Number.isInteger(held.at)) return false;
  if (typeof held.counts !== 'object' || held.counts === null || Array.isArray(held.counts)) return false;
  return Object.values(held.counts as Record<string, unknown>).every((count) => typeof count === 'number' && Number.isInteger(count) && count > 0);
};

const asFound = (shop: Shop, state: GameState): ShopStock => state.shops[shop.id] ?? { at: 0, counts: declaredStock(shop) };

export function stockNow(shop: Shop, state: GameState): Record<string, number> {
  const held = asFound(shop, state);
  return replenished(shop, held.counts, replenishSteps(shop, state.time - held.at));
}

function settle(shop: Shop, state: GameState): ShopStock {
  const held = asFound(shop, state);
  const steps = replenishSteps(shop, state.time - held.at);
  return { at: held.at + steps * shop.replenish, counts: replenished(shop, held.counts, steps) };
}

function write(state: GameState, shop: Shop, settled: ShopStock, counts: Record<string, number>): void {
  state.shops[shop.id] = { at: settled.at, counts };
}

export interface Trade {
  readonly item: string;
  readonly count: number;
  readonly coin: number;
}

const itemOf = (registry: Registry, itemId: string): Item | undefined => registry.items.get(itemId);

export function forSale(shop: Shop, state: GameState, registry: Registry): Trade[] {
  const counts = stockNow(shop, state);
  const written = shop.stocks.map((entry) => entry.item).filter((itemId) => counts[itemId] !== undefined);
  const rest = Object.keys(counts).filter((itemId) => !written.includes(itemId));
  return [...written, ...rest].flatMap((itemId) => {
    const price = buyPrice(shop, itemOf(registry, itemId));
    return price === undefined ? [] : [{ item: itemId, count: counts[itemId]!, coin: price }];
  });
}

export function wanted(shop: Shop, state: GameState, registry: Registry): Trade[] {
  return packRows(state).flatMap((row) => {
    const item = itemOf(registry, row.template);
    if (!takesItem(shop, item)) return [];
    return [{ item: packKey(row), count: row.kind === 'stack' ? row.count : 1, coin: sellPrice(shop, item)! }];
  });
}

export const coinHeld = (shop: Shop, state: GameState): number => spendableCount(state, shop.coin);

export type Refusal = 'unknown-item' | 'untradable' | 'out-of-stock' | 'not-carried' | 'not-afforded' | 'not-a-count' | 'pack-full';

export function countAsked(written: string): number | undefined {
  const trimmed = written.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

export function buyProblem(shop: Shop, state: GameState, registry: Registry, itemId: string, count: number): Refusal | undefined {
  const item = itemOf(registry, itemId);
  if (!item) return 'unknown-item';
  const price = buyPrice(shop, item);
  if (price === undefined || itemId === shop.coin) return 'untradable';
  if ((stockNow(shop, state)[itemId] ?? 0) < count) return 'out-of-stock';
  if (coinHeld(shop, state) < price * count) return 'not-afforded';
  if (!roomToPack(state, registry, itemId)) return 'pack-full';
  return undefined;
}

const onOffer = (state: GameState, itemId: string, count: number): boolean =>
  isGrownCopy(state, itemId) ? count === 1 && carriesItem(state, itemId) : spendableCount(state, itemId) >= count;

function partWith(state: GameState, itemId: string, count: number): string | undefined {
  if (isGrownCopy(state, itemId)) {
    const gone = destroyItem(state, itemId);
    return gone.ok ? gone.item : undefined;
  }
  const given = HandOver.asked(state, itemId, count);
  if (!given) return undefined;
  handOver(state, given);
  return given.item;
}

function vacatesItsRow(state: GameState, itemId: string, count: number): boolean {
  const rows = packRows(state);
  if (isGrownCopy(state, itemId)) return rows.some((row) => row.kind === 'grown' && row.id === itemId);
  const stacked = rows.find((row) => row.kind === 'stack' && row.template === itemId);
  return stacked !== undefined && stacked.kind === 'stack' && stacked.count <= count;
}

export function sellProblem(shop: Shop, state: GameState, registry: Registry, itemId: string, count: number): Refusal | undefined {
  const item = itemOf(registry, itemTemplate(state, itemId));
  if (!item) return 'unknown-item';
  if (!takesItem(shop, item)) return 'untradable';
  if (!onOffer(state, itemId, count)) return 'not-carried';
  if (!roomToPack(state, registry, shop.coin) && !vacatesItsRow(state, itemId, count)) return 'pack-full';
  return undefined;
}

export function buy(shop: Shop, state: GameState, registry: Registry, itemId: string, count: number): Refusal | undefined {
  const refusal = buyProblem(shop, state, registry, itemId, count);
  if (refusal) return refusal;
  const paid = HandOver.asked(state, shop.coin, buyPrice(shop, itemOf(registry, itemId))! * count);
  if (!paid) return 'not-afforded';
  const settled = settle(shop, state);
  const counts = { ...settled.counts };
  const left = counts[itemId]! - count;
  if (left > 0) counts[itemId] = left;
  else delete counts[itemId];
  write(state, shop, settled, counts);
  handOver(state, paid);
  receiveItem(state, registry, itemId, count);
  return undefined;
}

export function sell(shop: Shop, state: GameState, registry: Registry, itemId: string, count: number): Refusal | undefined {
  const refusal = sellProblem(shop, state, registry, itemId, count);
  if (refusal) return refusal;
  const gone = partWith(state, itemId, count);
  if (gone === undefined) return 'not-carried';
  const settled = settle(shop, state);
  write(state, shop, settled, { ...settled.counts, [gone]: (settled.counts[gone] ?? 0) + count });
  receiveItem(state, registry, shop.coin, sellPrice(shop, itemOf(registry, gone))! * count);
  return undefined;
}

export function shopOf(registry: Registry, shopId: string): Shop {
  const found = registry.shops.get(shopId);
  if (!found) throw new RuntimeError(`unknown shop: ${shopId}`);
  return found;
}
