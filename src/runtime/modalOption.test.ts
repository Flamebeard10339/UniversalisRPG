import { describe, expect, it } from 'vitest';
import { asLocalized } from './localizedFixture';
import { partsOf, partStanding, type ModalChoice, type ModalOption } from './modalOption';

const under = (value: string, side: string): ModalChoice => ({
  value,
  shown: asLocalized(value),
  cell: { under: side, heading: asLocalized(side.toUpperCase()), title: asLocalized(value), price: 1, count: 1 },
});

const plain = (value: string): ModalChoice => ({ value, shown: asLocalized(value) });

const option = (values: readonly ModalChoice[] | null): ModalOption => ({ key: 'item', label: asLocalized('Item'), values });

describe('the sides a screen has, which are the ones its choices name', () => {
  it('has none where no choice names one, so a plain list stays a plain list', () => {
    const { parts, loose } = partsOf(option([plain('rope'), plain('close')]));

    expect(parts).toEqual([]);
    expect(loose.map((each) => each.choice.value)).toEqual(['rope', 'close']);
  });

  it('has one per side named, in the order each is first named, however the rows interleave', () => {
    const { parts } = partsOf(option([under('a', 'sell'), under('b', 'buy'), under('c', 'sell')]));

    expect(parts.map((part) => part.under)).toEqual(['sell', 'buy']);
    expect(parts.map((part) => part.choices.map((each) => each.choice.value))).toEqual([['a', 'c'], ['b']]);
  });

  it('numbers every choice by where it stands in the option, sides or none', () => {
    const values = [under('a', 'buy'), plain('close'), under('b', 'sell')];
    const { parts, loose } = partsOf(option(values));

    expect([...parts.flatMap((part) => part.choices), ...loose].map((each) => each.at).sort()).toEqual([0, 1, 2]);
    expect(loose.map((each) => each.at)).toEqual([1]);
  });

  it('has none at all where the option takes free text', () => {
    expect(partsOf(option(null))).toEqual({ parts: [], loose: [] });
  });
});

describe('which side is standing', () => {
  const parts = partsOf(option([under('a', 'buy'), under('b', 'sell')])).parts;

  it('is the first before anything is picked, and the picked one after', () => {
    expect(partStanding(parts, null)).toBe('buy');
    expect(partStanding(parts, 'sell')).toBe('sell');
  });

  // A side the rows have stopped naming — the last thing sellable sold — must not leave the screen
  // standing over nothing.
  it('falls back to the first when what was picked is no longer a side, and is nothing where there are none', () => {
    expect(partStanding(parts, 'barter')).toBe('buy');
    expect(partStanding([], 'buy')).toBeNull();
  });
});
