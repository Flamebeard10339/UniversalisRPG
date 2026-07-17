import { Action, actionBody } from './action';
import { SectionSchema } from './section';
import { humanize, text } from './values';

export type { Action } from './action';

export interface Entity {
  id: string;
  title: string;
  examine?: string;
  actions: Action[];
}

export const entitySchema: SectionSchema<Entity, never, 'actions'> = {
  kind: 'entity',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text },
  },
  entries: { into: 'actions', body: actionBody },
};
