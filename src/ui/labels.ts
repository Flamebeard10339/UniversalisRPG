import type { EngineKey } from '../content/locale';

// Every word the shell puts on the screen that no engine value produced, as one
// id-to-key table. A component may name a control after the engine value it
// acts on and may invent nothing, so this is the whole of the driver's own
// vocabulary and the only module under src/ui naming a word a player reads.
//
// It names them rather than spelling them (c3): the English behind each key is
// `content/engine-en.dsl`'s, which is where a translator reaches it, and a
// component gets the words back through `wordsOf` in the language being played.
export const LABELS = {
  map: 'engine.shell.map',
  edit: 'engine.shell.edit',
  home: 'engine.shell.home',
  settings: 'engine.shell.settings',
  stats: 'engine.shell.stats',
  skills: 'engine.shell.skills',
  equipment: 'engine.shell.equipment',
  inventory: 'engine.shell.inventory',
  command: 'engine.shell.command',
  recentre: 'engine.shell.recentre',
  socket: 'engine.shell.socket',
  allocate: 'engine.shell.allocate',
  insert: 'engine.shell.insert',
  feed: 'engine.shell.feed',
  experience: 'engine.shell.experience',
  'to-next': 'engine.shell.to-next',
  'an-hour': 'engine.shell.an-hour',
  'until-next': 'engine.shell.until-next',
  run: 'engine.shell.run',
  level: 'engine.shell.level',
  points: 'engine.shell.points',
  spent: 'engine.shell.spent',
  ready: 'engine.shell.ready',
  locked: 'engine.shell.locked',
  dead: 'engine.shell.dead',
  free: 'engine.shell.free',
  // The two that take what they are about: a node is drawn under its number or
  // its direction, and a language that puts the number first can say so.
  position: 'engine.shell.node.position',
  slot: 'engine.shell.node.slot',
} as const satisfies Record<string, EngineKey>;

export type LabelId = keyof typeof LABELS;
