import { describe, expect, it } from 'vitest';
import { asLocalized } from './localizedFixture';
import type { StatShare } from './session';
import { madeOf } from './statScreen';

const share = (title: string, amount: number, increased = 0): StatShare => ({ title: asLocalized(title), added: { min: amount, max: amount }, increased });

describe('what a stat is made of, read out', () => {
  it('names every share and signs what it is worth, in the order the engine folded them', () => {
    expect(madeOf([share('Base', 10), share('Melee', 1), share('Iron Sword', 4)])).toEqual([
      { title: 'Base', worth: '+10' },
      { title: 'Melee', worth: '+1' },
      { title: 'Iron Sword', worth: '+4' },
    ]);
  });

  it('says a percentage as one, and a share on both channels as both', () => {
    expect(madeOf([share('Blade', 2, 18)])[0].worth).toBe('+2 +18%');
    expect(madeOf([share('Ring', 0, 25)])[0].worth).toBe('+25%');
  });

  it('reads a ranged share as the range it is', () => {
    expect(madeOf([{ title: asLocalized('Base'), added: { min: 3, max: 8 }, increased: 0 }])[0].worth).toBe('+3-8');
  });

  it('still says a share worth nothing, because a base nothing touches is the whole answer', () => {
    expect(madeOf([share('Base', 0)])).toEqual([{ title: 'Base', worth: '+0' }]);
  });

  it('draws nothing for a stat that published no shares at all', () => {
    expect(madeOf([])).toEqual([]);
  });
});
