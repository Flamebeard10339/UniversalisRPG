import { describe, expect, it } from 'vitest';
import { counted, named } from './sheet';

describe('a published dictionary as rows', () => {
  it('sorts by name, so a row does not move when its number does', () => {
    expect(counted({ rope: 2, chestnut: 5, awl: 1 }).map((entry) => entry.name)).toEqual(['awl', 'chestnut', 'rope']);
    expect(named({ hand: 'gauntlet', back: 'cloak' }).map((entry) => entry.name)).toEqual(['back', 'hand']);
  });

  it('reads a whole number as one and a fraction as one place, the way every other readout does', () => {
    expect(counted({ coins: 12, luck: 0.25 })).toEqual([
      { name: 'coins', value: '12' },
      { name: 'luck', value: '0.3' },
    ]);
  });

  it('carries the value it was given, without deciding anything about it', () => {
    expect(named({ hand: 'gauntlet' })).toEqual([{ name: 'hand', value: 'gauntlet' }]);
    expect(counted({ smithing: 0 })).toEqual([{ name: 'smithing', value: '0' }]);
  });

  it('has nothing to draw for a player carrying nothing', () => {
    expect(counted({})).toEqual([]);
    expect(named({})).toEqual([]);
  });
});
