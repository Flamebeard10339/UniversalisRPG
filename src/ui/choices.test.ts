import { describe, expect, it } from 'vitest';
import type { PlayView } from '../runtime/session';
import { groupOffers } from './choices';

const choice = (id: string, label: string, detail?: string): PlayView['choices'][number] => ({ id, kind: 'action', label, ...(detail ? { detail } : {}) });

describe('the offers on the sheet', () => {
  it('gathers what one object offers, in the order the engine listed it', () => {
    const groups = groupOffers([
      choice('a', 'Talk to Miki'),
      choice('b', 'ascend', 'Stairs'),
      choice('c', 'look in', 'Mirror'),
      choice('d', 'descend', 'Stairs'),
    ]);

    expect(groups.map((group) => group.source)).toEqual([null, 'Stairs', 'Mirror']);
    expect(groups[1].offers.map((offer) => offer.label)).toEqual(['ascend', 'descend']);
  });

  it('keeps the position the engine listed each one at, which grouping moves', () => {
    const groups = groupOffers([choice('a', 'ascend', 'Stairs'), choice('b', 'Talk to Miki'), choice('c', 'descend', 'Stairs')]);

    expect(groups[0].offers.map((offer) => offer.position)).toEqual([1, 3]);
    expect(groups[1].offers.map((offer) => offer.position)).toEqual([2]);
  });

  it('has nothing to group when the engine is offering nothing', () => {
    expect(groupOffers([])).toEqual([]);
  });
});
