export type TabId = 'map' | 'character' | 'home' | 'settings' | 'edit';

export interface Tab {
  id: TabId;
  label: string;
}

// The nav's own vocabulary. These five names are the whole of what the player
// reads under src/ui that no engine value produced, and surface.test.ts holds
// them to that. Home sits in the middle because it is where a thumb rests and
// where every other tab is one step away from.
export const TABS: readonly Tab[] = [
  { id: 'map', label: 'Map' },
  { id: 'character', label: 'Character' },
  { id: 'home', label: 'Home' },
  { id: 'settings', label: 'Settings' },
  { id: 'edit', label: 'Edit' },
];

export const OPENING_TAB: TabId = 'home';

// Clamped rather than wrapping: a swipe past the last tab landing on the first
// one moves the player four tabs for one gesture.
export function tabAfter(current: TabId, step: number): TabId {
  const at = TABS.findIndex((tab) => tab.id === current);
  return TABS[Math.min(TABS.length - 1, Math.max(0, at + step))].id;
}
