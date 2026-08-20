import { SectionSchema } from '../grammar/section';

// A flag the module owns rather than any one object in it: quest state, world
// state, anything no single entity or location is the home of.
export interface Flag {
  id: string;
}

export const flagSchema: SectionSchema<Flag> = {
  kind: 'flag',
  fields: {},
};
