import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/load';
import { loadInEnglish } from '../content/engineLocale';
import { Registry } from '../content/registry';
import { buyPrice, sellPrice } from '../content/sections/shop';
import { initialState } from './save';
import { GameState } from './state';
import { applyDirective, startSession, view } from './session';
import { buy, coinHeld, countProblem, forSale, sell, stockNow, wanted } from './trade';

const MINUTE = 60_000;

const MODULE = `
# location camp
x: 0, y: 0
starting
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
