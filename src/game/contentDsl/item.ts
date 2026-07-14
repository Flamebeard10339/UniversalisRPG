import { list } from './list';
import { Authored, SectionSchema } from './section';
import { TagClause, tagClause } from './tagClause';
import { humanize, text } from './values';

export interface Item {
  id: string;
  title: string;
  examine: string;
  tags: TagClause[];
}

export type AuthoredItem = Authored<Item>;

export const itemSchema: SectionSchema<Item> = {
  kind: 'item',
  fields: {
    title: { codec: text, default: (self) => humanize(self.id) },
    examine: { codec: text, default: (self) => `This is an ${self.title}.` },
    tags: { codec: list(tagClause), default: () => [] },
  },
  clauses: 'tags',
};
