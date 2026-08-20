import { TITLE_FIELD } from './info';
import { point, Range, range } from '../grammar/range';
import { SectionSchema } from '../grammar/section';

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
    title: TITLE_FIELD,
    base: { parser: range, default: () => point(0), printed: 'always' },
  },
};
