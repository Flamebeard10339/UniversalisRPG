import { Action, actionBody } from '../grammar/action';
import { SectionSchema } from '../grammar/section';

// Actions and nothing else. Stats stay on the entity, so an entity's own body
// has one meaning and a block inside it names an action of this template.
export interface EntityType {
  id: string;
  actions: Action[];
}

export const entityTypeSchema: SectionSchema<EntityType, never, 'actions'> = {
  kind: 'entitytype',
  fields: {},
  entries: { into: 'actions', body: actionBody },
};
