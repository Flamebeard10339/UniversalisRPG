import { Registry } from '../content/registry';
import { Item } from '../content/sections/item';
import { buyPrice, declaredStock, replenished, replenishSteps, sellPrice, Shop, takesItem } from '../content/sections/shop';
import { RuntimeError } from './error';
import { spendableCount, stockItem } from './itemInstance';
import { GameState, ShopStock } from './state';

export const isShopStock = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const held = value as Record<string, unknown>;
  if (typeof held.at !== 'number' || !Number.isInteger(held.at)) return false;
  if (typeof held.counts !== 'object' || held.counts === null || Array.isArray(held.counts)) return false;
  return Object.values(held.counts as Record<string, unknown>).every((count) => typeof count === 'number' && Number.isInteger(count) && count > 0);
};

// A shop nobody has traded with is holding exactly what its author said it holds, from the first moment of the world onward, so there is nothing to write down until someone takes something.
const asFound = (shop: Shop, state: GameState): ShopStock => state.shops[shop.id] ?? { at: 0, counts: declaredStock(shop) };

// What the shop holds now: the counts it was last settled at, walked toward its declared levels by however many whole units of replenishing the clock has since paid for. Nothing is written — reading a shop's stock is not an event.
export function stockNow(shop: Shop, state: GameState): Record<string, number> {
  const held = asFound(shop, state);
  return replenished(shop, held.counts, replenishSteps(shop, state.time - held.at));
}

// Settling advances `at` by the replenishing that has actually landed rather than to now, so a shop traded with every few seconds still restocks on its own clock.
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

// What the player may buy here, in the order the shop's author wrote its stock and then whatever else it has been sold since.
export function forSale(shop: Shop, state: GameState, registry: Registry): Trade[] {
  const counts = stockNow(shop, state);
  const written = shop.stocks.map((entry) => entry.item).filter((itemId) => counts[itemId] !== undefined);
  const rest = Object.keys(counts).filter((itemId) => !written.includes(itemId));
  return [...written, ...rest].flatMap((itemId) => {
    const price = buyPrice(shop, itemOf(registry, itemId));
    return price === undefined ? [] : [{ item: itemId, count: counts[itemId]!, coin: price }];
  });
}

// What the player is carrying that this shop will take, priced one at a time.
export function wanted(shop: Shop, state: GameState, registry: Registry): Trade[] {
  return Object.keys(state.inventory).flatMap((itemId) => {
    const item = itemOf(registry, itemId);
    const count = spendableCount(state, itemId);
    if (count <= 0 || !takesItem(shop, item)) return [];
    return [{ item: itemId, count, coin: sellPrice(shop, item)! }];
  });
}

export const coinHeld = (shop: Shop, state: GameState): number => spendableCount(state, shop.coin);

export type Refusal = 'unknown-item' | 'untradable' | 'out-of-stock' | 'not-carried' | 'not-afforded' | 'not-a-count';

export function countProblem(written: string): Refusal | undefined {
  return /^\d+$/.test(written.trim()) && Number(written.trim()) > 0 ? undefined : 'not-a-count';
}

// Buying takes coin and hands over stock; a shop has none of an item to sell once its count reaches zero, which is the floor everything here is written against.
export function buyProblem(shop: Shop, state: GameState, registry: Registry, itemId: string, count: number): Refusal | undefined {
  const item = itemOf(registry, itemId);
  if (!item) return 'unknown-item';
  const price = buyPrice(shop, item);
  if (price === undefined || itemId === shop.coin) return 'untradable';
  if ((stockNow(shop, state)[itemId] ?? 0) < count) return 'out-of-stock';
  if (coinHeld(shop, state) < price * count) return 'not-afforded';
  return undefined;
}

export function sellProblem(shop: Shop, state: GameState, registry: Registry, itemId: string, count: number): Refusal | undefined {
  const item = itemOf(registry, itemId);
  if (!item) return 'unknown-item';
  if (!takesItem(shop, item)) return 'untradable';
  if (spendableCount(state, itemId) < count) return 'not-carried';
  return undefined;
}

export function buy(shop: Shop, state: GameState, registry: Registry, itemId: string, count: number): Refusal | undefined {
  const refusal = buyProblem(shop, state, registry, itemId, count);
  if (refusal) return refusal;
  const settled = settle(shop, state);
  const counts = { ...settled.counts };
  const left = counts[itemId]! - count;
  if (left > 0) counts[itemId] = left;
  else delete counts[itemId];
  write(state, shop, settled, counts);
  stockItem(state, shop.coin, -buyPrice(shop, itemOf(registry, itemId))! * count);
  stockItem(state, itemId, count);
  return undefined;
}

// A shop has no ceiling, so what it is sold simply lands on the count it already holds — and if it does not stock the thing, replenishing walks that pile back down to nothing on its own.
export function sell(shop: Shop, state: GameState, registry: Registry, itemId: string, count: number): Refusal | undefined {
  const refusal = sellProblem(shop, state, registry, itemId, count);
  if (refusal) return refusal;
  const settled = settle(shop, state);
  write(state, shop, settled, { ...settled.counts, [itemId]: (settled.counts[itemId] ?? 0) + count });
  stockItem(state, itemId, -count);
  stockItem(state, shop.coin, sellPrice(shop, itemOf(registry, itemId))! * count);
  return undefined;
}

export function shopOf(registry: Registry, shopId: string): Shop {
  const found = registry.shops.get(shopId);
  if (!found) throw new RuntimeError(`unknown shop: ${shopId}`);
  return found;
}
