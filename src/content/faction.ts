import { TITLE_FIELD } from './info';
import { SectionSchema } from '../grammar/section';

// A name an entity can belong to. The names are authored and the bits are
// compiled, because `faction: 3` on a page is unreadable and a mistyped digit
// would be a valid faction.
export interface Faction {
  id: string;
  title: string;
}

export const factionSchema: SectionSchema<Faction> = {
  kind: 'faction',
  fields: {
    title: TITLE_FIELD,
  },
};

// The faction every entity that names none belongs to, which is why almost
// nothing needs the line: rats do not fight rats.
export const WORLD_FACTION = 'world';
