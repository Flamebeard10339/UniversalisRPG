import { point, Range, range } from '../../grammar/range';
import { section } from './define';
import { GROUP_FIELD } from './group';
import { TITLE_FIELD } from './info';

export interface Stat {
  id: string;
  title: string;
  base: Range;
  group?: string;
}

export const stat = section<Stat>()({
  kind: 'stat',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'stats',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    base: { parser: range, default: () => point(0), printed: 'always' },
    group: GROUP_FIELD,
  },
});
