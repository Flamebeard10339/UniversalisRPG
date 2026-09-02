import { describe, expect, it } from 'vitest';
import { itemStyle, lookOf } from './itemLook';

const row = (verbs: readonly string[], sockets = false) => ({ verbs, sockets });

describe('what a carried thing looks like', () => {
  it('reads the look off what the screen offers to do with it', () => {
    expect(lookOf(row(['grow', 'equip', 'destroy']))).toBe('gear');
    expect(lookOf(row(['equip', 'destroy']))).toBe('wearable');
    expect(lookOf(row(['unequip', 'destroy']))).toBe('wearable');
    expect(lookOf(row(['destroy']))).toBe('stuff');
  });

  it('calls a thing that sockets a jewel, whatever else it offers', () => {
    expect(lookOf(row(['destroy'], true))).toBe('jewel');
    expect(lookOf(row(['grow', 'destroy'], true))).toBe('jewel');
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
