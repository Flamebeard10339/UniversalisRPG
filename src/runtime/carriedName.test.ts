import { describe, expect, it } from 'vitest';
import { carriedName } from './carriedName';

describe('what a carried thing is called', () => {
  it('calls a stack copy its item’s title, and adds nothing to it', () => {
    expect(carriedName('Iron Sword', false)).toBe('Iron Sword');
  });

  // c16: the descriptor is the whole of what says a copy is grown.
  it('calls a grown copy the same title under a descriptor', () => {
    expect(carriedName('Iron Sword', true)).toBe('Modified Iron Sword');
  });

  // Two copies of one base are one name; which is which is the stat summary
  // beneath, so nothing here has an id to be given.
  it('names two copies of one base alike, because it is told nothing that could tell them apart', () => {
    expect(carriedName('Iron Sword', true)).toBe(carriedName('Iron Sword', true));
  });
});
