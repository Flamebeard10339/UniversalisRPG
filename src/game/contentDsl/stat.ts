import { point, Range, range } from './range';
import { SectionSchema } from './section';
import { humanize, text } from './values';

export interface Stat {
  id: string;
  title: string;
  // `base: 5` or `base: 4-7`. A range is kept intact and sampled at every use
  // (see sampleStat), never collapsed to an average here.
  base: Range;
}

export const statSchema: SectionSchema<Stat> = {
  kind: 'stat',
  fields: {
    title: { parser: text, default: (self) => humanize(self.id) },
    base: { parser: range, default: () => point(0) },
  },
};
