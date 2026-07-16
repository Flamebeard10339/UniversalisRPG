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
    title: { parser: text, default: (self) => humanize(self.id) },
    base: { parser: number, default: () => 0 },
  },
};
