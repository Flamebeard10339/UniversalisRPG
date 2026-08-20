import { TITLE_FIELD } from './info';
import { SectionSchema } from '../grammar/section';

// Where an equipment slot keeps its words. The vocabulary is still named by
// `equipment-slots:` on the entities that wear one, and this declaration is
// optional: a slot nobody declares keeps the words the engine makes from its
// id. The id is global rather than namespaced, for `capability`'s reason —
// `mainhand` has to mean the same thing in every module that says it — which is
// also what gives one slot one key however many entities declare it.
export interface Slot {
  id: string;
  title: string;
}

export const slotSchema: SectionSchema<Slot> = {
  kind: 'slot',
  fields: {
    title: TITLE_FIELD,
  },
};
