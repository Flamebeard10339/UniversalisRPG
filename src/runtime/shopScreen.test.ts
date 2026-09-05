import { BACK, LEAVE } from './modalOption';
import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import type { Registry } from '../content/registry';
import { partsOf } from './modalOption';
import { countFrame, countOptions, countSubmit, shopFrame, shopOptions, shopSubmit } from './shopScreen';
import { TOUCHED } from '../content/sections/define';
import { initialState } from './save';
import { sellPrice } from '../content/sections/shop';
import { shopkeeperHere, shopOpen } from './session';
import type { GameState } from './state';
import { packRows, receiveItem } from './itemInstance';

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

# item file
title: File
value: 6
slot: main-hand
item-level: 3

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

describe('what a counter makes of the name it is handed', () => {
  const handed = (state: GameState, written: string) => shopSubmit({ ...shopFrame('stall'), answers: { item: written } }, state, registry);
  const rowsOf = (state: GameState, item: string) => packRows(state).filter((row) => row.template === item).length;

  it('takes a copy grown of its own, named by the item it is a copy of, the way equipping one is', () => {
    const state = carrying({ coin: 0, file: 3 });
    expect(rowsOf(state, 'file')).toBe(3);

    handed(state, 'sell:file');

    expect(rowsOf(state, 'file')).toBe(2);
    expect(state.inventory.coin).toBe(sellPrice(registry.shops.get('stall')!, registry.items.get('file'))!);
  });

  it('takes one copy per turn, so the same name handed over and over empties the pack of them', () => {
    const state = carrying({ coin: 0, file: 3 });

    for (let turn = 0; turn < 3; turn += 1) handed(state, 'sell:file');

    expect(rowsOf(state, 'file')).toBe(0);
  });
});

describe('a counter a quest opens', () => {
  const GATED =
    FIXTURE_WORLD +
    `
# flag trusted

# location hut
x: 12, y: 12
entities:
  hob

# item coin
title: Coin

# item trap
title: Trap
value: 40

# shop hobs-tackle
coin: coin
hidden if: not trusted
stocks:
  1 trap

# entity hob
title: Hob
keeps shop: hobs-tackle
`;

  const world = loadInEnglish(GATED);

  const stood = (trusted: boolean): GameState => {
    const state = initialState(world);
    state.location = 'hut';
    state.flags[`hob.${TOUCHED}`] = true;
    if (trusted) state.flags.trusted = true;
    return state;
  };

  it('stands the keeper where the shop is either way, or neither claim below is about the condition', () => {
    for (const trusted of [false, true]) {
      expect(world.entities.get('hob')?.shop).toBe('hobs-tackle');
      expect(stood(trusted).location).toBe('hut');
    }
  });

  it('keeps no counter while the condition holds, and finds no keeper for it here', () => {
    const shut = stood(false);

    expect(shopOpen(world, shut, 'hobs-tackle')).toBe(false);
    expect(shopkeeperHere(world, shut, 'hobs-tackle')).toBeUndefined();
  });

  it('keeps it once the flag is set, with nothing else about the shop or the keeper changed', () => {
    const open = stood(true);

    expect(shopOpen(world, open, 'hobs-tackle')).toBe(true);
    expect(shopkeeperHere(world, open, 'hobs-tackle')).toBe('hob');
  });

  it('leaves an ungated shop open, so the gate is the condition and not the field existing', () => {
    expect(shopOpen(registry, carrying({}), 'stall')).toBe(true);
  });
});
