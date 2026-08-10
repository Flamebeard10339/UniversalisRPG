import { describe, expect, it } from 'vitest';
import { swipeStep, swipes, SWIPE_MIN_PX } from './gesture';
import { tabAfter, TABS } from './tabs';

describe('a swipe across the surface', () => {
  it('takes a long sideways drag as a step, in the direction a page turns', () => {
    expect(swipeStep(-SWIPE_MIN_PX, 0)).toBe(1);
    expect(swipeStep(SWIPE_MIN_PX, 0)).toBe(-1);
  });

  it('takes a short drag or a downward one as nothing, so the column still scrolls', () => {
    expect(swipeStep(-SWIPE_MIN_PX + 1, 0)).toBe(0);
    expect(swipeStep(-80, 200)).toBe(0);
    expect(swipeStep(0, -300)).toBe(0);
  });

  it('is a touch gesture, because a mouse drag over a column of text is a selection', () => {
    expect(swipes('touch')).toBe(true);
    expect(swipes('pen')).toBe(true);
    expect(swipes('mouse')).toBe(false);
  });
});

describe('the tab order', () => {
  it('opens on Home with two tabs either side of it', () => {
    expect(TABS.map((tab) => tab.id)).toEqual(['map', 'character', 'home', 'settings', 'edit']);
  });

  it('stops at each end rather than wrapping four tabs on one gesture', () => {
    expect(tabAfter('home', 1)).toBe('settings');
    expect(tabAfter('home', -1)).toBe('character');
    expect(tabAfter('map', -1)).toBe('map');
    expect(tabAfter('edit', 1)).toBe('edit');
  });
});
