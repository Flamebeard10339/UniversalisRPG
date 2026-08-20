import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Faction {
  id: string;
  title: string;
}

export const faction = section<Faction>()({
  kind: 'faction',
  ids: 'owned',
  map: 'factions',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
  },
});

// The faction an entity that names none belongs to, which is why almost nothing
// needs the line: rats do not fight rats.
export const WORLD_FACTION = 'world';
