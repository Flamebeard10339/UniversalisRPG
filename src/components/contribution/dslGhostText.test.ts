import { describe, expect, it } from 'vitest';
import { computeGhostTextRemainder } from './dslGhostText';
import type { DslCompletionSources } from './dslCompletions';

const sources: DslCompletionSources = {
  itemIds: ['lockpick', 'gold', 'note'],
  flagIds: ['tutorial.miki-cleared', 'tutorial.bridge-open'],
  dialogueIds: ['miki', 'note'],
  moduleIds: ['tutorial-island-foundation'],
  skillIds: ['thieving', 'mining'],
};

describe('computeGhostTextRemainder', () => {
  it('suggests the remainder of the best-matching item id after give:', () => {
    expect(computeGhostTextRemainder('give: lock', '', sources)).toBe('pick');
  });

  it('does not suggest anything when the cursor sits mid-word (more word chars follow it)', () => {
    // "give: lockpick" with the cursor placed after "lock" — "pick" already
    // exists right after the cursor, so there is nothing to complete.
    expect(computeGhostTextRemainder('give: lock', 'pick', sources)).toBeNull();
  });

  it('does not suggest anything once the full word is already typed exactly', () => {
    expect(computeGhostTextRemainder('give: lockpick', '', sources)).toBeNull();
  });

  it('still suggests when a different, longer candidate shares the same prefix', () => {
    // Placing the cursor right after "note" with nothing after it (a real,
    // separate "note" vs "note-something" candidate) is not the mid-word
    // case — should still offer a longer sibling if one exists.
    const withLongerSibling: DslCompletionSources = { ...sources, itemIds: [...sources.itemIds, 'notebook'] };
    expect(computeGhostTextRemainder('give: note', '', withLongerSibling)).toBe('book');
  });

  it('returns null when the cursor is not at a recognized completion field', () => {
    expect(computeGhostTextRemainder('say: lock', '', sources)).toBeNull();
  });

  it('returns null when nothing has been typed yet', () => {
    expect(computeGhostTextRemainder('give: ', '', sources)).toBeNull();
  });

  it('treats a trailing non-word character after the cursor as end-of-word (not mid-word)', () => {
    expect(computeGhostTextRemainder('give: lock', ', once', sources)).toBe('pick');
  });
});
