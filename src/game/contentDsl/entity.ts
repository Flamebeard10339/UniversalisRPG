import { Action, actionBody } from './action';
import { list } from './list';
import { SectionSchema } from './section';
import { humanize, id, text } from './values';

export type { Action } from './action';

export interface Entity {
  id: string;
  title: string;
  examine?: string;
  capabilities: string[];
  actions: Action[];
}

export const entitySchema: SectionSchema<Entity, never, 'actions'> = {
  kind: 'entity',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text },
    capabilities: { parser: list(id), keyword: 'stations', default: () => [] },
  },
  entries: { into: 'actions', body: actionBody },
};
