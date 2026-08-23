import { list } from '../../grammar/list';
import { TagClause, tagClause, unrolledProblem } from '../../grammar/tagClause';
import { pruneTags, visitTags, type Loose } from '../refs';
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
  map: 'races',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    tags: { parser: list(tagClause), default: () => [], note: 'carried for a whole life by whoever is one' },
  },
  clauses: 'tags',
  validate: (value) => unrolledProblem(value.tags, 'a race is carried from birth with no moment to roll one'),
  visit: (value, where, visit) => visitTags((value as unknown as Loose).tags, where, visit),
  prune: (value, at, where) => {
    const tags = pruneTags(value.tags, where, at);
    return tags.length === value.tags.length ? value : { ...value, tags };
  },
});
