import { ActionResult, actionResult } from './actionResult';
import { list } from './list';
import { EntryBody, SectionSchema } from './section';
import { humanize, text } from './values';

export interface Action {
  label: string;
  results: ActionResult[];
}

export interface Entity {
  id: string;
  title: string;
  examine?: string;
  actions: Action[];
}

const results = list(actionResult);

const actionBody: EntryBody = {
  parse: (cursor) => ({ results: results.parse(cursor) }),
  parseBlock: (lines) => ({ results: results.parseBlock(lines) }),
  printBlock: (value) => (value as Action).results.map((result) => actionResult.print(result)),
};

export const entitySchema: SectionSchema<Entity, never, 'actions'> = {
  kind: 'entity',
  fields: {
    title: { codec: text, default: (self) => humanize(self.id) },
    examine: { codec: text },
  },
  entries: { into: 'actions', body: actionBody },
};
