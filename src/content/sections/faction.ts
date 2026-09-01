import { section } from './define';

export interface Faction {
  id: string;
}

export const faction = section<Faction>()({
  kind: 'faction',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'factions',
  fields: {},
});

export const WORLD_FACTION = 'world';
