import { describe, expect, it } from 'vitest';
import { inPlayerOrder, packKey, swappedOrder, type PackRow } from './packOrder';

const stack = (template: string, count = 1): PackRow => ({ kind: 'stack', template, count });
const grown = (id: string, template: string): PackRow => ({ kind: 'grown', id, template });

const keys = (rows: readonly PackRow[]): string[] => rows.map(packKey);

describe('the order the player has put their pack in', () => {
  const pack = [stack('bread', 3), grown('7', 'rusty-sword'), stack('rope')];

  it('draws a pack nobody has arranged in the order the pack itself gives', () => {
    expect(keys(inPlayerOrder(pack, []))).toEqual(['bread', '7', 'rope']);
  });

  it('draws what the order names, in the order it names it', () => {
    expect(keys(inPlayerOrder(pack, ['rope', '7', 'bread']))).toEqual(['rope', '7', 'bread']);
  });

  it('puts a row the order has never seen behind the ones it has, in the pack own order', () => {
    expect(keys(inPlayerOrder([...pack, stack('lantern'), stack('flint')], ['rope']))).toEqual(['rope', 'bread', '7', 'lantern', 'flint']);
  });

  it('draws nothing for a name the pack no longer holds, and moves nothing else', () => {
    expect(keys(inPlayerOrder(pack, ['lantern', 'rope', 'apple', 'bread']))).toEqual(['rope', 'bread', '7']);
  });

  it('names a stack by its item and a grown copy by itself, which is what the inventory screen offers each under', () => {
    expect(keys(pack)).toEqual(['bread', '7', 'rope']);
  });
});

describe('two things in the pack changing places', () => {
  const pack = [stack('bread'), stack('rope'), stack('lantern')];

  it('answers with the whole pack, with the two exchanged', () => {
    expect(swappedOrder(pack, [], 'bread', 'lantern')).toEqual(['lantern', 'rope', 'bread']);
  });

  it('exchanges against the order the player is looking at, not the order the pack was built in', () => {
    expect(swappedOrder(pack, ['lantern', 'rope', 'bread'], 'lantern', 'rope')).toEqual(['rope', 'lantern', 'bread']);
  });

  it('moves nothing when a thing is swapped with itself', () => {
    expect(swappedOrder(pack, [], 'rope', 'rope')).toEqual(['bread', 'rope', 'lantern']);
  });

  it('moves nothing when either side is not in the pack, and still settles the order against it', () => {
    expect(swappedOrder(pack, ['gone', 'rope'], 'rope', 'apple')).toEqual(['rope', 'bread', 'lantern']);
  });

  it('settles the order against the pack, so a name that has left stops being carried', () => {
    expect(swappedOrder(pack, ['gone', 'lantern'], 'bread', 'rope')).toEqual(['lantern', 'rope', 'bread']);
  });
});
