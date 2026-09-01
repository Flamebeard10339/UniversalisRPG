import { list } from '../../grammar/list';
import { id } from '../../grammar/values';
import { section } from './define';
import { TITLE_FIELD } from './info';

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
