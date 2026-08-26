import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import type { Registry } from '../content/registry';
import { partsOf } from './modalOption';
import { BACK, countFrame, countOptions, countSubmit, LEAVE, shopFrame, shopOptions } from './shopScreen';
import { initialState } from './save';
import type { GameState } from './state';
import { receiveItem } from './itemInstance';

const MODULE =
  FIXTURE_WORLD +
  `
# location camp
entities:
  pedlar

# item coin
title: Coin

# item nail
title: Nail
value: 3

# item pin
title: Pin
value: 1

# shop stall
coin: coin
stocks:
  4 nail
  2 pin

# entity pedlar
title: Pedlar
keeps shop: stall
`;

const registry: Registry = loadInEnglish(MODULE);

function carrying(held: Record<string, number>): GameState {
  const state = initialState(registry);
  for (const [item, count] of Object.entries(held)) receiveItem(state, registry, item, count);
  return state;
}

const said = (state: GameState): string[] => state.log.map(String);

const answered = (state: GameState, written: string) => countSubmit({ ...countFrame('stall', 'buy', 'nail'), answers: { count: written } }, state, registry);

describe('what a counter does with what is written in its count box', () => {
  // The screen has to be leavable without buying anything, and leaving is not a mistake. Every way of
  // naming none of a thing comes back to the counter with nothing said at the player.
  it('comes back to the counter saying nothing when the player names none of it', () => {
    for (const written of [BACK, '', '   ', '0']) {
      const state = carrying({ coin: 40 });
      expect(answered(state, written)?.name, written).toBe('shop');
      expect(said(state), written).toEqual([]);
      expect(state.inventory.nail ?? 0, written).toBe(0);
      expect(state.inventory.coin, written).toBe(40);
    }
  });

  it('answers only writing that names no number at all', () => {
    const state = carrying({ coin: 40 });
    expect(answered(state, 'lots')?.name).toBe('shop');
    expect(said(state)).toEqual(['That is not a number of things to trade.']);
  });

  it('trades what a number names, and says so only when the trade itself is refused', () => {
    const bought = carrying({ coin: 40 });
    expect(answered(bought, '2')?.name).toBe('shop');
    expect(said(bought)).toEqual([]);
    expect(bought.inventory.nail).toBe(2);

    const broke = carrying({ coin: 1 });
    expect(answered(broke, '2')?.name).toBe('shop');
    expect(said(broke)).toEqual(['You cannot afford that.']);
  });

  it('asks its question as free text, so nothing on the screen is a list to pick the way out of', () => {
    const state = carrying({ coin: 40 });
    expect(countOptions(countFrame('stall', 'buy', 'nail'), state, registry).map((option) => [option.key, option.values])).toEqual([['count', null]]);
  });
});

describe('the two sides of a counter, as the screen publishes them', () => {
  const counter = (state: GameState) => shopOptions(shopFrame('stall'), state, registry)[0]!;

  // The sides are what the rows name and nothing lists them, so a counter with nothing to sell back
  // has one side and a counter with both has two, without either being written down anywhere.
  it('grows a side when a row names one, and has none where no row does', () => {
    const empty = carrying({ coin: 40 });
    expect(partsOf(counter(empty)).parts.map((part) => part.under)).toEqual(['buy']);

    const selling = carrying({ coin: 40, nail: 1 });
    expect(partsOf(counter(selling)).parts.map((part) => part.under)).toEqual(['buy', 'sell']);
    expect(partsOf(counter(selling)).parts.map((part) => String(part.heading))).toEqual(['Buy', 'Sell']);
  });

  it('leaves the way out standing under no side, so it is not a row of either', () => {
    const state = carrying({ coin: 40, nail: 1 });
    expect(partsOf(counter(state)).loose.map((each) => each.choice.value)).toEqual([LEAVE]);
  });

  // What the grid draws in its three places, published as figures rather than as a sentence to be
  // read back apart: the price and the count reach every surface as the numbers the engine folded.
  it('publishes each row as what the thing is, what it goes for and how many there are', () => {
    const state = carrying({ coin: 40, nail: 1 });
    const rows = partsOf(counter(state)).parts.flatMap((part) => part.choices.map((each) => each.choice.cell!));

    for (const cell of rows) {
      expect(String(cell.title)).not.toBe('');
      expect(cell.price).toBeGreaterThan(0);
      expect(cell.count).toBeGreaterThan(0);
    }
    expect(rows.map((cell) => String(cell.title))).toContain('Nail');
  });

  it('numbers every row by where it stands in the option the engine published, sides or no sides', () => {
    const state = carrying({ coin: 40, nail: 1 });
    const option = counter(state);
    const { parts, loose } = partsOf(option);
    const walked = [...parts.flatMap((part) => part.choices), ...loose].sort((one, other) => one.at - other.at);

    expect(walked.map((each) => each.at)).toEqual(option.values!.map((_choice, at) => at));
    expect(walked.map((each) => each.choice)).toEqual([...option.values!]);
  });
});
