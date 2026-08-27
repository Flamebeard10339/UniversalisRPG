import { list } from '../../grammar/list';
import { id } from '../../grammar/values';
import { section } from './define';
import { TITLE_FIELD } from './info';

// A set of places drawn as one shape. Nothing in the engine reads it: a region moves nobody, opens
// nothing and gates nothing, and two places in one region are as far apart as their coordinates say.
// It is a fact about how the map is read — a house with four rooms in it should look like a house —
// and about how a map is edited, since the places a shape gathers are the places a drag carries
// together. Space is real here; what a region does is stop a building shouting its insides at
// somebody standing in the street.
export interface Region {
  id: string;
  title: string;
  holds: string[];
}

export const region = section<Region>()({
  kind: 'region',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'regions',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    holds: {
      parser: list(id),
      names: { id: 'location' },
      default: () => [],
      block: true,
      note: 'the places this region gathers, drawn inside one shape and carried together when one of them is moved',
    },
  },
  validate: (value) => (value.holds.length > 0 ? undefined : 'holds no locations, so there is nothing for it to draw a shape around'),
});
