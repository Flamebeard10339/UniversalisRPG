import { Action, actionBody } from '../grammar/action';
import { HOOK_FIELDS, HookCarrier } from '../grammar/hook';
import { list } from '../grammar/list';
import { Authored, SectionSchema } from '../grammar/section';
import { TagClause, tagClause } from '../grammar/tagClause';
import { article, humanize, id, text } from '../grammar/values';

export interface Item extends HookCarrier {
  id: string;
  title: string;
  examine: string;
  slot?: string;
  tags: TagClause[];
  actions: Action[];
}

export type AuthoredItem = Authored<Item>;

export const itemSchema: SectionSchema<Item, never, 'actions'> = {
  kind: 'item',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text, default: (self) => `This is ${article(self.title)} ${self.title}.` },
    slot: { parser: id },
    tags: { parser: list(tagClause), default: () => [] },
    ...HOOK_FIELDS,
  },
  clauses: 'tags',
  entries: { into: 'actions', body: actionBody },
};
