import { section } from './define';
import { TITLE_FIELD } from './info';

// A `# slot` is optional — the vocabulary is the union of every `equipment-slots:`, and this only supplies display words.
export interface Slot {
  id: string;
  title: string;
}

export const slot = section<Slot>()({
  kind: 'slot',
  ids: 'global',
  vocabulary: 'open',
  map: 'slots',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
  },
});
