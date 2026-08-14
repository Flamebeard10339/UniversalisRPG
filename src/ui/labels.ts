// Every word the shell puts on the screen that no engine value produced, as one
// id-to-English table. A component may name a control after the engine value it
// acts on and may invent nothing, so this is the whole of the driver's own
// vocabulary and the only module under src/ui holding a word a player reads.
export const LABELS = {
  map: 'Map',
  edit: 'Edit',
  home: 'Home',
  settings: 'Settings',
  stats: 'Stats',
  skills: 'Skills',
  equipment: 'Equipment',
  inventory: 'Inventory',
  command: 'Command',
  run: 'Run',
  level: 'Level',
  points: 'Points',
  position: 'Position',
  slot: 'Slot',
  spent: 'Spent',
  ready: 'Ready',
  locked: 'Locked',
  dead: 'Dead',
  free: 'Free',
} as const;

export type LabelId = keyof typeof LABELS;
