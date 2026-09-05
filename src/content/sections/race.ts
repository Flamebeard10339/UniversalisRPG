import { list } from '../../grammar/list';
import { TagClause, tagClause, unrolledProblem } from '../../grammar/tagClause';
import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Race {
  id: string;
  title: string;
  tags: TagClause[];
}

export const race = section<Race>()({
  kind: 'race',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'races',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    tags: { parser: list(tagClause), default: () => [], note: 'carried for a whole life by whoever is one' },
  },
  clauses: 'tags',
  validate: (value) => unrolledProblem(value.tags, 'a race is carried from birth with no moment to roll one'),
});
