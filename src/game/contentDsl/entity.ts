import { Action, actionBody } from './action';
import { list } from './list';
import { SectionSchema } from './section';
import { humanize, id, text } from './values';

export type { Action } from './action';

export interface Entity {
  id: string;
  title: string;
  examine?: string;
  // Capability tags this entity offers to recipes (e.g. `oven`) — a recipe's
  // `station:` names a required capability, not an entity id; see
  // recipeCraftable in runtime.ts. Authored as `stations: <cap>[, <cap>...]`.
  stations: string[];
  actions: Action[];
}

export const entitySchema: SectionSchema<Entity, never, 'actions'> = {
  kind: 'entity',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    examine: { parser: text },
    stations: { parser: list(id), default: () => [] },
  },
  entries: { into: 'actions', body: actionBody },
};
