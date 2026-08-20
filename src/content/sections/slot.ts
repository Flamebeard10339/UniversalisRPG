import { section } from './define';
import { TITLE_FIELD } from './info';

// The vocabulary of slots is the union of every `equipment-slots:`, so this
// declaration is optional and supplies only the words.
export interface Slot {
  id: string;
  title: string;
}

export const slot = section<Slot>()({
  kind: 'slot',
  ids: 'global',
  map: 'slots',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
  },
});
