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

// One row of a counter. `item` is the string the thing traded answers to — an item on the buying
// side, where a shop stocks templates and nothing else, and on the selling side whatever the pack
// row answers to, so a grown copy is named as itself. Its price is read off the template either way:
// what a copy fetches is its base's `value:`, not an answer to the points on it.
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

// What the player is carrying that this shop will take, priced one at a time, read off the pack's
// own rows in the order the player put them in. So the counter offers exactly what the sheet draws:
// a grown copy is on it as itself, and what is worn is not on it at all, without either rule being
// written here.
export function wanted(shop: Shop, state: GameState, registry: Registry): Trade[] {
  return packRows(state).flatMap((row) => {
    const item = itemOf(registry, row.template);
    if (!takesItem(shop, item)) return [];
    return [{ item: packKey(row), count: row.kind === 'stack' ? row.count : 1, coin: sellPrice(shop, item)! }];
  });
}

export const coinHeld = (shop: Shop, state: GameState): number => spendableCount(state, shop.coin);

export type Refusal = 'unknown-item' | 'untradable' | 'out-of-stock' | 'not-carried' | 'not-afforded' | 'not-a-count' | 'pack-full';

// How many a written answer names, or nothing at all where it names no number. A count is whole and
// never negative, because a shop takes no half of a thing and no debt of one. Zero is a number like
// any other and this says so: naming none of something is a thing a player means, not a mistake, and
// what a counter does about it is the counter's to decide.
export function countAsked(written: string): number | undefined {
  const trimmed = written.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

// Buying takes coin and hands over stock; a shop has none of an item to sell once its count reaches zero, which is the floor everything here is written against.
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

// A grown copy is one thing standing in a row of its own, so the only count it answers to is one and
// the only question is whether it is in the pack rather than on the player; a stack answers for as
// many of it as can be parted with. Nothing worn is on offer either way.
const onOffer = (state: GameState, itemId: string, count: number): boolean =>
  isGrownCopy(state, itemId) ? count === 1 && carriesItem(state, itemId) : spendableCount(state, itemId) >= count;

// The two doors a holding already leaves by, picked by which kind of row it stands in, answering with
// the item that left so the shop's pile is counted in templates however the player named the copy.
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

// Whether parting with this many empties the row they stand in, read off the same rows the counter
// offers: a grown copy is one thing in a row of its own, and a stack's row is gone once nothing is
// left in it. What is worn stands in no row and so empties none.
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
  // What is paid for the goods has to have somewhere to land too, or the sale would take the item
  // and hand back nothing. It lands after the goods have gone, so the row the sale empties is a row
  // the coin may take — which is how a full pack is traded out of at all.
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

// A shop has no ceiling, so what it is sold simply lands on the count it already holds — and if it does not stock the thing, replenishing walks that pile back down to nothing on its own.
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
