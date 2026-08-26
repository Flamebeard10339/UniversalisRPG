import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/load';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { Registry } from '../content/registry';
import { buyPrice, sellPrice } from '../content/sections/shop';
import { initialState } from './save';
import { GameState } from './state';
import { applyDirective, startSession, view } from './session';
import { copiesOf, heldCount, itemInstance, itemLevel, itemTemplate, packRows, receiveItem } from './itemInstance';
import { equip } from './equipment';
import { rowAnswer, shopFrame, shopOptions } from './shopScreen';
import { buy, coinHeld, countProblem, forSale, sell, stockNow, wanted } from './trade';

const MINUTE = 60_000;

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

# item bone
title: Bone

# item blade
title: Blade
slot: mainhand
value: 10

# item honed-blade
title: Honed Blade
slot: mainhand
value: 10
item-level: 4

# shop stall
coin: coin
stocks:
  4 nail
  2 pin

# shop picky
coin: coin
accepts: stocked
stocks:
  4 nail

# entity pedlar
title: Pedlar
keeps shop: stall
`;

const registry = loadInEnglish(MODULE);

const shopOf = (id: string) => registry.shops.get(id)!;

function carrying(inventory: Record<string, number>, over: Registry = registry): GameState {
  const state = initialState(over);
  Object.assign(state.inventory, inventory);
  return state;
}

describe('what a shop asks and what it pays', () => {
  it('charges 4 for a nail worth 3 and pays 2, because the shop rounds its own way on both sides', () => {
    expect(buyPrice(shopOf('stall'), registry.items.get('nail'))).toBe(4);
    expect(sellPrice(shopOf('stall'), registry.items.get('nail'))).toBe(2);
  });

  // The boundary the integer rule turns on: at a value of 1 the ceil and the floor land on either side of it.
  it('charges 2 for a pin worth 1 and pays 0, so the cheapest thing there is still costs more than it fetches', () => {
    expect(buyPrice(shopOf('stall'), registry.items.get('pin'))).toBe(2);
    expect(sellPrice(shopOf('stall'), registry.items.get('pin'))).toBe(0);
  });

  // Derived from every item the fixture declares a value for: a shop that paid at least what it charged could be bought from and sold back to forever.
  it('never pays as much for a thing as it charges, at any value from 1 to 200', () => {
    const stall = shopOf('stall');
    for (let value = 1; value <= 200; value++) {
      const item = { id: 'made-up', value } as never;
      expect(sellPrice(stall, item)!, `value ${value}`).toBeLessThan(buyPrice(stall, item)!);
    }
  });

  it('puts no price on an item that declares no value, nor on the coin its prices are counted in', () => {
    const state = carrying({ bone: 3, coin: 20 });
    expect(wanted(shopOf('stall'), state, registry).map((trade) => trade.item)).toEqual([]);
    expect(sell(shopOf('stall'), state, registry, 'bone', 1)).toBe('untradable');
    expect(sell(shopOf('stall'), state, registry, 'coin', 1)).toBe('untradable');
    expect(buy(shopOf('stall'), state, registry, 'coin', 1)).toBe('untradable');
  });

  it('takes anything tradable by default, and only what it stocks when it says so', () => {
    const state = carrying({ pin: 2, coin: 20 });
    expect(sell(shopOf('picky'), state, registry, 'pin', 1)).toBe('untradable');
    expect(sell(shopOf('stall'), state, registry, 'pin', 1)).toBeUndefined();
  });
});

describe('a shop holds what its author said until someone trades', () => {
  it('holds 4 nails and 2 pins with nothing written down, and writes nothing by being looked at', () => {
    const state = carrying({});
    expect(stockNow(shopOf('stall'), state)).toEqual({ nail: 4, pin: 2 });
    expect(state.shops).toEqual({});
  });

  it('hands over 3 nails for 12 coin and keeps the 1 that is left', () => {
    const state = carrying({ coin: 20 });
    expect(buy(shopOf('stall'), state, registry, 'nail', 3)).toBeUndefined();
    expect(state.inventory.nail).toBe(3);
    expect(state.inventory.coin).toBe(8);
    expect(stockNow(shopOf('stall'), state)).toEqual({ nail: 1, pin: 2 });
  });

  // The floor the whole counter is written against.
  it('refuses to sell 5 of the 4 nails it has, and leaves all 4 and all 20 coin where they were', () => {
    const state = carrying({ coin: 20 });
    expect(buy(shopOf('stall'), state, registry, 'nail', 5)).toBe('out-of-stock');
    expect(stockNow(shopOf('stall'), state)).toEqual({ nail: 4, pin: 2 });
    expect(state.inventory.coin).toBe(20);
    expect(state.inventory.nail ?? 0).toBe(0);
  });

  it('refuses 4 nails for 15 coin, one short of the 16 they cost', () => {
    const state = carrying({ coin: 15 });
    expect(buy(shopOf('stall'), state, registry, 'nail', 4)).toBe('not-afforded');
    expect(state.inventory.coin).toBe(15);
  });

  it('refuses to be sold 3 of the 2 things carried, and leaves both', () => {
    const state = carrying({ nail: 2 });
    expect(sell(shopOf('stall'), state, registry, 'nail', 3)).toBe('not-carried');
    expect(state.inventory.nail).toBe(2);
  });

  it('has no ceiling: sold 40 nails on top of its 4 it holds 44', () => {
    const state = carrying({ nail: 40 });
    expect(sell(shopOf('stall'), state, registry, 'nail', 40)).toBeUndefined();
    expect(stockNow(shopOf('stall'), state)).toEqual({ nail: 44, pin: 2 });
    expect(state.inventory.coin).toBe(80);
  });

  it('drops an item off the counter once the last one is bought', () => {
    const state = carrying({ coin: 20 });
    buy(shopOf('stall'), state, registry, 'pin', 2);
    expect(stockNow(shopOf('stall'), state)).toEqual({ nail: 4 });
    expect(forSale(shopOf('stall'), state, registry).map((trade) => trade.item)).toEqual(['nail']);
  });
});

describe('a grown copy sells for what its base is worth', () => {
  // A base drops as a copy of its own, so a Honed Blade is held and never stacked however many arrive.
  const withGrownBlades = (grown: number): GameState => {
    const state = carrying({});
    receiveItem(state, registry, 'honed-blade', grown);
    return state;
  };

  const grownCopies = (state: GameState): string[] => packRows(state).flatMap((row) => (row.kind === 'grown' ? [row.id] : []));

  it('is on the counter as itself and fetches the 8 its base is worth, leaving the pack when it does', () => {
    const state = withGrownBlades(1);
    const [copy] = grownCopies(state);
    expect(copiesOf(state, 'honed-blade')).toEqual({ stack: 0, grown: 1, worn: 0 });
    expect(wanted(shopOf('stall'), state, registry)).toEqual([{ item: copy, count: 1, coin: 8 }]);

    expect(sell(shopOf('stall'), state, registry, copy, 1)).toBeUndefined();
    expect(state.inventory.coin).toBe(8);
    expect(copiesOf(state, 'honed-blade')).toEqual({ stack: 0, grown: 0, worn: 0 });
    // The shop counts what it took in items, not in the name the player's copy went by.
    expect(stockNow(shopOf('stall'), state)).toEqual({ nail: 4, pin: 2, 'honed-blade': 1 });
  });

  // The half of the ruling that was deliberately not built: a copy is priced at its base's value:,
  // so the points on it and the plane it carries move nothing. Derived over every row the pack holds
  // rather than over the two the fixture happens to mint, and the levels are asserted to be read off
  // the copies so the claim is about copies that genuinely differ.
  it('prices every copy at its base, whatever level the copy rolled', () => {
    const state = withGrownBlades(4);
    const copies = grownCopies(state);
    const levels = copies.map((copy) => itemLevel(itemInstance(state, copy)!, registry.items.get('honed-blade')!));
    expect(levels.length).toBe(4);
    expect(levels.every((level) => level >= 0 && level <= 4)).toBe(true);

    const trades = wanted(shopOf('stall'), state, registry);
    expect([...trades.map((trade) => trade.item)].sort()).toEqual([...copies].sort());
    for (const trade of trades) {
      expect(trade.coin, trade.item).toBe(sellPrice(shopOf('stall'), registry.items.get(itemTemplate(state, trade.item)))!);
    }
  });

  // Stack size is 1, which is what the ruling leaned on: there is exactly one of it, so the only
  // number it answers to is one and asking for two takes nothing.
  it('refuses to sell two of the one there is, and the one is still held', () => {
    const state = withGrownBlades(1);
    const [copy] = grownCopies(state);
    expect(sell(shopOf('stall'), state, registry, copy, 2)).toBe('not-carried');
    expect(state.inventory.coin ?? 0).toBe(0);
    expect(copiesOf(state, 'honed-blade')).toEqual({ stack: 0, grown: 1, worn: 0 });
  });

  // What survives of the old refusal, and the reason the counter reads the pack's own rows: what is
  // worn is on the player rather than in the pack, so it is not on offer and does not answer if named.
  it('leaves the copy on the arm off the counter and refuses it there, worn and whole after', () => {
    const state = withGrownBlades(1);
    const [copy] = grownCopies(state);
    expect(equip(state, registry, copy)).toBe(true);
    expect(wanted(shopOf('stall'), state, registry)).toEqual([]);
    expect(sell(shopOf('stall'), state, registry, copy, 1)).toBe('not-carried');
    expect(state.inventory.coin ?? 0).toBe(0);
    expect(copiesOf(state, 'honed-blade')).toEqual({ stack: 0, grown: 1, worn: 0 });
  });

  it("draws the copy on the counter under the copy's own name, not its base's", () => {
    const state = withGrownBlades(1);
    const [copy] = grownCopies(state);
    const values = shopOptions(shopFrame('stall'), state, registry)[0]!.values!;
    expect(values.map((choice) => choice.shown)).toContain('Sell Modified Honed Blade — 8 each, you carry 1');
    expect(values.find((choice) => String(choice.shown).includes('Modified'))!.value).toBe(rowAnswer('sell', copy));
  });

  it('offers the plain blades beside a base and pays 16 for two of them, the base untouched', () => {
    const state = withGrownBlades(1);
    receiveItem(state, registry, 'blade', 2);
    expect(wanted(shopOf('stall'), state, registry).find((trade) => trade.item === 'blade')).toEqual({ item: 'blade', count: 2, coin: 8 });
    expect(sell(shopOf('stall'), state, registry, 'blade', 3)).toBe('not-carried');
    expect(sell(shopOf('stall'), state, registry, 'blade', 2)).toBeUndefined();
    expect(state.inventory.coin).toBe(16);
    expect(copiesOf(state, 'honed-blade')).toEqual({ stack: 0, grown: 1, worn: 0 });
  });

  // The whole of the bug: the counter asked how many were held and the till took from the stack, so a blade on the arm fetched 8 coin over and over without ever leaving. The claim is the difference, because every holding where nothing moves also gains nothing.
  it('pays 8 a blade for exactly the blades that leave, over every holding of 0 to 2 loose beside 0 or 1 worn', () => {
    for (const on of [0, 1]) {
      for (const plain of [0, 1, 2]) {
        for (const asked of [1, 2, 3]) {
          const state = carrying({ blade: plain + on });
          if (on === 1) equip(state, registry, 'blade');
          const heldBefore = heldCount(state, 'blade');
          const coinBefore = state.inventory.coin ?? 0;
          sell(shopOf('stall'), state, registry, 'blade', asked);
          const where = `${plain} loose and ${on} worn, asked for ${asked}`;
          expect((state.inventory.coin ?? 0) - coinBefore, where).toBe(8 * (heldBefore - heldCount(state, 'blade')));
        }
      }
    }
  });
});

describe('replenishing runs on simulated time', () => {
  const bought = (minutes: number): GameState => {
    const state = carrying({ coin: 40 });
    buy(shopOf('stall'), state, registry, 'nail', 4);
    state.time += minutes * MINUTE;
    return state;
  };

  it('is back to 1 nail of its 4 one minute after they all went, and to 4 after four', () => {
    expect(stockNow(shopOf('stall'), bought(1)).nail).toBe(1);
    expect(stockNow(shopOf('stall'), bought(4)).nail).toBe(4);
  });

  it('stops at the 4 it stocks rather than climbing past it, however long nobody comes', () => {
    expect(stockNow(shopOf('stall'), bought(1000))).toEqual({ nail: 4, pin: 2 });
  });

  it('walks 3 unstocked bones back down to none over 3 minutes, then stops holding them at all', () => {
    const generous = loadInEnglish(MODULE.replace('# item bone\n', '# item bone\nvalue: 5\n'));
    const shop = generous.shops.get('stall')!;
    const held = carrying({ bone: 3 }, generous);
    sell(shop, held, generous, 'bone', 3);
    expect(stockNow(shop, held).bone).toBe(3);
    held.time += 2 * MINUTE;
    expect(stockNow(shop, held).bone).toBe(1);
    held.time += 1 * MINUTE;
    expect(stockNow(shop, held)).toEqual({ nail: 4, pin: 2 });
  });

  // Settling to now would throw away the part-minute each time, so a shop somebody buys from every thirty seconds would restock never.
  it('restocks 1 nail across two buys thirty seconds apart, the same as if nobody had come between', () => {
    const state = carrying({ coin: 40 });
    buy(shopOf('stall'), state, registry, 'nail', 4);
    state.time += MINUTE / 2;
    buy(shopOf('stall'), state, registry, 'pin', 1);
    state.time += MINUTE / 2;
    expect(stockNow(shopOf('stall'), state).nail).toBe(1);
  });
});

describe('how many is a number of things', () => {
  it('refuses everything that is not a whole number above zero', () => {
    for (const written of ['', 'close', '0', '-2', '1.5', 'two', '3x']) expect(countProblem(written), written).toBe('not-a-count');
    for (const written of ['1', '23', ' 7 ']) expect(countProblem(written), written).toBeUndefined();
  });
});

describe('what an author is refused', () => {
  const shopped = (body: string): string => `# item coin\n# item nail\nvalue: 3\n\n# shop stall\n${body}\n`;

  it('refuses a shop that stocks something declaring no value, because it has no price to put on it', () => {
    expect(() => loadInEnglish('# item coin\n# item bone\n\n# shop stall\ncoin: coin\nstocks:\n  2 bone\n')).toThrow(/declares no value/);
  });

  it('refuses a shop with no coin:, one that stocks its own coin, and one that would price everything at nothing', () => {
    expect(() => loadModule(shopped('stocks:\n  2 nail'))).toThrow(/requires a coin:/);
    expect(() => loadModule(shopped('coin: coin\nstocks:\n  2 coin'))).toThrow(/is this shop's own coin:/);
    expect(() => loadModule(shopped('coin: coin\nbuying: 0'))).toThrow(/would price everything at nothing/);
    expect(() => loadModule(shopped('coin: coin\nselling: 0'))).toThrow(/would pay nothing for anything/);
    expect(() => loadModule(shopped('coin: coin\nstocks:\n  2 nail\n  1 nail'))).toThrow(/names nail twice/);
  });

  it('refuses an item priced at nothing, since leaving the line out is what says untradable', () => {
    expect(() => loadModule('# item pebble\nvalue: 0\n')).toThrow(/prices it at nothing/);
  });
});

describe('reaching a counter', () => {
  const world = loadInEnglish(`${MODULE}
# location road
x: 1, y: 0
adjacent:
  camp
`);

  it('refuses a shop whose keeper is standing somewhere else', () => {
    const session = startSession(world);
    applyDirective(session, { kind: 'goto', location: 'road' });
    expect(() => applyDirective(session, { kind: 'shop', shop: 'stall' })).toThrow(/nobody standing in road keeps the shop stall/);
    applyDirective(session, { kind: 'goto', location: 'camp' });
    expect(view(session).modals.map((modal) => modal.name)).toEqual([]);
    applyDirective(session, { kind: 'shop', shop: 'stall' });
    expect(view(session).modals.map((modal) => modal.name)).toEqual(['shop']);
  });

  it('offers the counter where its keeper stands and nowhere else', () => {
    const session = startSession(world);
    expect(view(session).choices.filter((choice) => choice.kind === 'shop').map((choice) => choice.id)).toEqual(['shop:stall']);
    applyDirective(session, { kind: 'goto', location: 'road' });
    expect(view(session).choices.filter((choice) => choice.kind === 'shop')).toEqual([]);
  });
});

describe('the coin a shop counts in', () => {
  it('is what the player is shown they are carrying', () => {
    expect(coinHeld(shopOf('stall'), carrying({ coin: 17 }))).toBe(17);
  });
});
