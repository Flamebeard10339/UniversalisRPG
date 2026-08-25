import { section } from './define';

// A faction is a side, and nothing shows a player which one anything is on. So it says nothing in
// any language and holds no `title:` for anyone to write or translate: whatever needs a name for one
// takes what `humanizeEn` makes of its id, the way every other unauthored name is made.
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
