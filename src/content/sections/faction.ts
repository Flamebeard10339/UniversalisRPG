import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Faction {
  id: string;
  title: string;
}

export const faction = section<Faction>()({
  kind: 'faction',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'factions',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
  },
});

export const WORLD_FACTION = 'world';
