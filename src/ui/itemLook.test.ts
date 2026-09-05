import { describe, expect, it } from 'vitest';
import { itemStyle, lookOf } from './itemLook';

const row = (nature: { base?: boolean; slotted?: boolean; sockets?: boolean }) => ({ base: false, slotted: false, sockets: false, ...nature });

describe('what a carried thing looks like', () => {
  it('reads the look off what the item is', () => {
    expect(lookOf(row({ base: true, slotted: true }))).toBe('gear');
    expect(lookOf(row({ slotted: true }))).toBe('wearable');
    expect(lookOf(row({}))).toBe('stuff');
  });

  it('calls a thing that sockets a jewel, whatever else it is', () => {
    expect(lookOf(row({ sockets: true }))).toBe('jewel');
    expect(lookOf(row({ base: true, sockets: true }))).toBe('jewel');
  });

  it('fills by the look and edges by whether it has been grown, so the two axes never collide', () => {
    const stock = itemStyle('gear', false);
    const grown = itemStyle('gear', true);
    const jewel = itemStyle('jewel', true);

    expect(grown.backgroundColor).toBe(stock.backgroundColor);
    expect(grown.borderColor).not.toBe(stock.borderColor);
    expect(jewel.backgroundColor).not.toBe(grown.backgroundColor);
  });

  it('gives every look a fill of its own, so no two read alike', () => {
    const looks = (['gear', 'wearable', 'jewel', 'stuff'] as const).map((look) => itemStyle(look, false).backgroundColor);

    expect(new Set(looks).size).toBe(looks.length);
  });
});
