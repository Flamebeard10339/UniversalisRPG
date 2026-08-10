// A swipe has to be long enough to be meant and sideways enough not to be the
// narration column being scrolled. Both numbers are what a thumb on a phone
// produces, and neither is derivable from anything else here.
export const SWIPE_MIN_PX = 56;
export const SWIPE_SIDEWAYS = 1.6;

// Which way through the tabs a drag of this shape means, or 0 for one that
// means nothing. Swiping left brings the next tab in, the way a page does.
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_SIDEWAYS) return 0;
  return dx < 0 ? 1 : -1;
}

// A mouse drag across a column of text is a selection, and a mouse has the tab
// bar in reach anyway.
export const swipes = (pointerType: string): boolean => pointerType !== 'mouse';
