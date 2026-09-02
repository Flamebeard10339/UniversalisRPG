import { describe, expect, it } from 'vitest';
import { RATES } from './devMode';
import { marchesAt, MARCHES_ABOVE } from './pace';

describe('when a fill stops being able to say where in a cycle it is', () => {
  it('draws the position it knows at the paces a cycle is still long enough to draw', () => {
    expect(marchesAt(1)).toBe(false);
    expect(marchesAt(MARCHES_ABOVE)).toBe(false);
  });

  it('marches instead at every pace above that', () => {
    expect(marchesAt(MARCHES_ABOVE + 1)).toBe(true);
    expect(marchesAt(64)).toBe(true);
  });

  it('splits the paces the player is offered rather than sitting off the end of them', () => {
    const offered = [...RATES];

    expect(offered.filter((rate) => !marchesAt(rate)), 'some pace draws a position').not.toEqual([]);
    expect(offered.filter((rate) => marchesAt(rate)), 'and some pace marches').not.toEqual([]);
  });
});
