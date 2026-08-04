import { describe, expect, it } from 'vitest';
import { packGreedy, truncateLine, wrapText } from './render';

describe('packGreedy', () => {
  it('fills each line to the width before starting the next', () => {
    expect(packGreedy(['aaaa 1', 'bbbb 2', 'cccc 3'], ' · ', 15)).toEqual(['aaaa 1 · bbbb 2', 'cccc 3']);
  });

  it('keeps a single part too wide for the line rather than losing it', () => {
    expect(packGreedy(['a-very-long-single-entry 9'], ' · ', 5)).toEqual(['a-very-long-single-entry 9']);
  });

  it('emits no line at all for no parts', () => {
    expect(packGreedy([], ' · ', 20)).toEqual([]);
  });
});

describe('wrapText', () => {
  it('breaks on spaces at the width', () => {
    expect(wrapText('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });

  it('leaves text already inside the width as one line', () => {
    expect(wrapText('short enough', 20)).toEqual(['short enough']);
  });

  it('keeps a blank line blank rather than dropping it, so a paragraph break survives', () => {
    expect(wrapText('', 20)).toEqual(['']);
  });
});

describe('truncateLine', () => {
  it('cuts to exactly the maximum, ellipsis included', () => {
    expect(truncateLine('abcdefgh', 6)).toBe('abcde…');
  });

  it('returns text at the maximum unchanged', () => {
    expect(truncateLine('abcdef', 6)).toBe('abcdef');
  });
});
