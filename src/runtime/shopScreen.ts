import { Registry } from '../content/registry';
import { lastSegment } from '../grammar/values';
import { Shop } from '../content/sections/shop';
import { heldName } from './carried';
import { itemTemplate } from './itemInstance';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { BACK, LEAVE, type ModalChoice, type ModalOption } from './modalOption';
import { GameState, type ModalFrame } from './state';
import { buy, coinHeld, countAsked, forSale, sell, Trade, wanted, type Refusal } from './trade';



export type Side = 'buy' | 'sell';

export type ShopFrame = Extract<ModalFrame, { name: 'shop' }>;
export type ShopCountFrame = Extract<ModalFrame, { name: 'shop-count' }>;

export const shopFrame = (shop: string, side?: Side): ShopFrame => (side === undefined ? { name: 'shop', answers: {}, shop } : { name: 'shop', answers: {}, shop, side });

export const countFrame = (shop: string, side: Side, item: string): ShopCountFrame => ({ name: 'shop-count', answers: {}, shop, side, item });

export const sameShop = (a: ShopFrame, b: ShopFrame): boolean => a.shop === b.shop;

export const sameCount = (a: ShopCountFrame, b: ShopCountFrame): boolean => a.shop === b.shop && a.side === b.side && a.item === b.item;

export const holdsShop = (value: Record<string, unknown>): boolean => typeof value.shop === 'string';

export const holdsCount = (value: Record<string, unknown>): boolean => holdsShop(value) && typeof value.item === 'string' && (value.side === 'buy' || value.side === 'sell');

export const MORE = 'more';

export const rowAnswer = (side: Side, item: string): Answer => `${side}:${item}`;

export const moreAnswer = (side: Side, item: string): Answer => `${MORE}:${rowAnswer(side, item)}`;

export function rowOf(answer: Answer | undefined): { side: Side; item: string; asked: boolean } | undefined {
  if (answer === undefined) return undefined;
  const asked = answer.startsWith(`${MORE}:`);
  const written = asked ? answer.slice(MORE.length + 1) : answer;
  const at = written.indexOf(':');
  if (at <= 0) return undefined;
  const side = written.slice(0, at);
  if (side !== 'buy' && side !== 'sell') return undefined;
  return { side, item: written.slice(at + 1), asked };
}

export const namesOfRow = (state: GameState, item: string): string[] => {
  const template = itemTemplate(state, item);
  return [...new Set([item, lastSegment(item), template, lastSegment(template)])];
};

const rows = (side: Side, trades: readonly Trade[], state: GameState, localizer: Localizer): ModalChoice[] =>
  trades.map((trade) => {
    const item = heldName(state, localizer, trade.item);
    return {
      value: rowAnswer(side, trade.item),
      held: moreAnswer(side, trade.item),
      also: namesOfRow(state, trade.item).flatMap((name) => [rowAnswer(side, name), moreAnswer(side, name)]),
      shown: localizer.engine(side === 'buy' ? 'engine.shop.buy' : 'engine.shop.sell', { item, price: trade.coin, count: trade.count }),
      cell: {
        under: side,
        heading: localizer.engine(side === 'buy' ? 'engine.shop.side.buy' : 'engine.shop.side.sell'),
        title: item,
        price: trade.coin,
        count: trade.count,
      },
    };
  });

export function shopOptions(frame: ShopFrame, state: GameState, registry: Registry): ModalOption[] {
  const shop = registry.shops.get(frame.shop);
  if (!shop) return [];
  const localizer = localizerOf(registry, state);
  return [
    {
      key: 'item',
      label: localizer.engine('engine.shop.counter', { coin: localizer.title('item', shop.coin), held: coinHeld(shop, state) }),
      standing: frame.side ?? 'buy',
      values: [
        ...rows('buy', forSale(shop, state, registry), state, localizer),
        ...rows('sell', wanted(shop, state, registry), state, localizer),
        { value: LEAVE, shown: localizer.engine('engine.shop.close') },
      ],
    },
  ];
}

function stockNamed(shop: Shop, state: GameState, registry: Registry, side: Side, written: string): string {
  const trades = side === 'buy' ? forSale(shop, state, registry) : wanted(shop, state, registry);
  const found = trades.filter((trade) => namesOfRow(state, trade.item).includes(written));
  const named = new Set(found.map((trade) => itemTemplate(state, trade.item)));
  return named.size === 1 ? found[0]!.item : written;
}

export function shopSubmit(frame: ShopFrame, state: GameState, registry: Registry): ModalFrame | null {
  const shop = registry.shops.get(frame.shop);
  if (!shop) return null;
  const asked = rowOf(frame.answers.item);
  if (asked === undefined) return null;
  const row = { ...asked, item: stockNamed(shop, state, registry, asked.side, asked.item) };
  if (row.asked) return countFrame(frame.shop, row.side, row.item);
  const refusal = row.side === 'buy' ? buy(shop, state, registry, row.item, 1) : sell(shop, state, registry, row.item, 1);
  if (refusal) state.log.push(refused(localizerOf(registry, state), refusal));
  return shopFrame(frame.shop, row.side);
}

export function countOptions(frame: ShopCountFrame, state: GameState, registry: Registry): ModalOption[] {
  if (!registry.shops.has(frame.shop)) return [];
  const localizer = localizerOf(registry, state);
  return [{ key: 'count', label: localizer.engine(frame.side === 'buy' ? 'engine.shop.count.buy' : 'engine.shop.count.sell', { item: heldName(state, localizer, frame.item) }), values: null }];
}

export function countSubmit(frame: ShopCountFrame, state: GameState, registry: Registry): ModalFrame | null {
  const shop = registry.shops.get(frame.shop);
  if (!shop) return null;
  const refusal = tradeRefusal(shop, state, registry, frame.side, frame.item, frame.answers.count ?? '');
  if (refusal) state.log.push(refused(localizerOf(registry, state), refusal));
  return shopFrame(frame.shop, frame.side);
}

function tradeRefusal(shop: Shop, state: GameState, registry: Registry, side: Side, item: string, written: string): Refusal | undefined {
  if (written.trim() === BACK || written.trim() === '') return undefined;
  const count = countAsked(written);
  if (count === undefined) return 'not-a-count';
  if (count === 0) return undefined;
  return side === 'buy' ? buy(shop, state, registry, item, count) : sell(shop, state, registry, item, count);
}

const refused = (localizer: Localizer, refusal: Refusal): Localized => localizer.engine(`engine.shop.refused.${refusal}`);

export function shopStale(frame: ShopFrame | ShopCountFrame, state: GameState, registry: Registry): Localized | null {
  if (registry.shops.has(frame.shop)) return null;
  const localizer = localizerOf(registry, state);
  return localizer.engine('engine.shop.stale', { shop: localizer.identifier(frame.shop) });
}
