export type TabId = 'map' | 'character' | 'home' | 'settings' | 'edit';

export interface Tab {
  id: TabId;
  label: string;
}

// The nav's own vocabulary. These five names are the whole of what the player
// reads under src/ui that no engine value produced, and surface.test.ts holds
// them to that. Home sits in the middle because it is where a thumb rests and
// because it puts every other tab one pane away from it.
export const TABS: readonly Tab[] = [
  { id: 'map', label: 'Map' },
  { id: 'character', label: 'Character' },
  { id: 'home', label: 'Home' },
  { id: 'settings', label: 'Settings' },
  { id: 'edit', label: 'Edit' },
];

export const OPENING_TAB = TABS.findIndex((tab) => tab.id === 'home');
