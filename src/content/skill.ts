import { defaultTitle } from './info';
import { SectionSchema } from '../grammar/section';
import { BonusAmount, bonusAmount } from '../grammar/tagClause';
import { id, text } from '../grammar/values';

export interface Skill {
  id: string;
  title: string;
  'stat-id'?: string;
  'per-level'?: BonusAmount;
}

export const skillSchema: SectionSchema<Skill> = {
  kind: 'skill',
  fields: {
    title: { parser: text, default: defaultTitle },
    'stat-id': { parser: id },
    'per-level': { parser: bonusAmount },
  },
};
