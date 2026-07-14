import { SectionSchema } from './section';
import { humanize, number, text } from './values';

export interface Stat {
  id: string;
  title: string;
  base: number;
}

export const statSchema: SectionSchema<Stat> = {
  kind: 'stat',
  fields: {
    title: { codec: text, default: (self) => humanize(self.id) },
    base: { codec: number, default: () => 0 },
  },
};
