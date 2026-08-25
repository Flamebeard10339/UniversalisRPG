import { Registry } from '../content/registry';
import { Shop } from '../content/sections/shop';
import { heldName } from './carried';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import type { ModalChoice, ModalOption } from './modalOption';
import { GameState, type ModalFrame } from './state';
import { buy, coinHeld, countProblem, forSale, sell, Trade, wanted, type Refusal } from './trade';

export const LEAVE: Answer = 'close';

export type Side = 'buy' | 'sell';

export type ShopFrame = Extract<ModalFrame, { name: 'shop' }>;
export type ShopCountFrame = Extract<ModalFrame, { name: 'shop-count' }>;

export const shopFrame = (shop: string): ShopFrame => ({ name: 'shop', answers: {}, shop });

export const countFrame = (shop: string, side: Side, item: string): ShopCountFrame => ({ name: 'shop-count', answers: {}, shop, side, item });

export const sameShop = (a: ShopFrame, b: ShopFrame): boolean => a.shop === b.shop;

export const sameCount = (a: ShopCountFrame, b: ShopCountFrame): boolean => a.shop === b.shop && a.side === b.side && a.item === b.item;

export const holdsShop = (value: Record<string, unknown>): boolean => typeof value.shop === 'string';

export const holdsCount = (value: Record<string, unknown>): boolean => holdsShop(value) && typeof value.item === 'string' && (value.side === 'buy' || value.side === 'sell');

// One row of the counter is a side and an item, and the player picks it as one answer, so the two travel as one string.
export const rowAnswer = (side: Side, item: string): Answer => `${side}:${item}`;

export function rowOf(answer: Answer | undefined): { side: Side; item: string } | undefined {
  const at = answer?.indexOf(':') ?? -1;
  if (answer === undefined || at <= 0) return undefined;
  const side = answer.slice(0, at);
  if (side !== 'buy' && side !== 'sell') return undefined;
  return { side, item: answer.slice(at + 1) };
}

const rows = (side: Side, trades: readonly Trade[], state: GameState, localizer: Localizer): ModalChoice[] =>
  trades.map((trade) => ({
    value: rowAnswer(side, trade.item),
    shown: localizer.engine(side === 'buy' ? 'engine.shop.buy' : 'engine.shop.sell', { item: heldName(state, localizer, trade.item), price: trade.coin, count: trade.count }),
  }));

export function shopOptions(frame: ShopFrame, state: GameState, registry: Registry): ModalOption[] {
  const shop = registry.shops.get(frame.shop);
  if (!shop) return [];
  const localizer = localizerOf(registry, state);
  return [
    {
      key: 'item',
      label: localizer.engine('engine.shop.counter', { coin: localizer.title('item', shop.coin), held: coinHeld(shop, state) }),
      values: [...rows('buy', forSale(shop, state, registry), state, localizer), ...rows('sell', wanted(shop, state, registry), state, localizer), { value: LEAVE, shown: localizer.engine('engine.shop.close') }],
    },
  ];
}

export function shopSubmit(frame: ShopFrame, _state: GameState, registry: Registry): ModalFrame | null {
  if (!registry.shops.has(frame.shop)) return null;
  const row = rowOf(frame.answers.item);
  return row === undefined ? null : countFrame(frame.shop, row.side, row.item);
}

// How many, asked as free text, because a shop takes any number a player can name and a list of every number it would take is not a question.
export function countOptions(frame: ShopCountFrame, state: GameState, registry: Registry): ModalOption[] {
  if (!registry.shops.has(frame.shop)) return [];
  const localizer = localizerOf(registry, state);
  return [{ key: 'count', label: localizer.engine(frame.side === 'buy' ? 'engine.shop.count.buy' : 'engine.shop.count.sell', { item: heldName(state, localizer, frame.item) }), values: null }];
}

// A shop stays open across a trade: what comes back is a fresh counter, so it is re-read against what the player now carries and the shop now holds. Anything that is not a number to trade is how a player backs out of the question.
export function countSubmit(frame: ShopCountFrame, state: GameState, registry: Registry): ModalFrame | null {
  const shop = registry.shops.get(frame.shop);
  if (!shop) return null;
  const refusal = tradeRefusal(shop, state, registry, frame.side, frame.item, frame.answers.count ?? '');
  if (refusal) state.log.push(refused(localizerOf(registry, state), refusal));
  return shopFrame(frame.shop);
}

function tradeRefusal(shop: Shop, state: GameState, registry: Registry, side: Side, item: string, written: string): Refusal | undefined {
  const badCount = countProblem(written);
  if (badCount) return badCount;
  const count = Number(written.trim());
  return side === 'buy' ? buy(shop, state, registry, item, count) : sell(shop, state, registry, item, count);
}

const refused = (localizer: Localizer, refusal: Refusal): Localized => localizer.engine(`engine.shop.refused.${refusal}`);

export function shopStale(frame: ShopFrame | ShopCountFrame, state: GameState, registry: Registry): Localized | null {
  if (registry.shops.has(frame.shop)) return null;
  const localizer = localizerOf(registry, state);
  return localizer.engine('engine.shop.stale', { shop: localizer.identifier(frame.shop) });
}
