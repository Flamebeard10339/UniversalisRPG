import { SectionSchema } from './section';
import { decimal, humanize, text } from './values';

export interface Stat {
  id: string;
  title: string;
  base: number;
}

export const statSchema: SectionSchema<Stat> = {
  kind: 'stat',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    base: { parser: decimal, default: () => 0 },
  },
};
