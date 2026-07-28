import { Action, actionBody } from '../grammar/action';
import { list } from '../grammar/list';
import { Authored, SectionSchema } from '../grammar/section';
import { TagClause, tagClause } from '../grammar/tagClause';
import { humanize, text } from '../grammar/values';

export interface Item {
  id: string;
  title: string;
  examine: string;
  tags: TagClause[];
  actions: Action[];
}

export type AuthoredItem = Authored<Item>;

export const itemSchema: SectionSchema<Item, never, 'actions'> = {
  kind: 'item',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text, default: (self) => `This is an ${self.title}.` },
    tags: { parser: list(tagClause), default: () => [] },
  },
  clauses: 'tags',
  entries: { into: 'actions', body: actionBody },
};
