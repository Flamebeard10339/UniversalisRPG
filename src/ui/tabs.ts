export type TabId = 'home' | 'map' | 'character' | 'settings' | 'edit';

export interface Tab {
  id: TabId;
  label: string;
}

// The nav's own vocabulary. These five names are the whole of what the player
// reads under src/ui that no engine value produced, and surface.test.ts holds
// them to that.
export const TABS: readonly Tab[] = [
  { id: 'home', label: 'Home' },
  { id: 'map', label: 'Map' },
  { id: 'character', label: 'Character' },
  { id: 'settings', label: 'Settings' },
  { id: 'edit', label: 'Edit' },
];
