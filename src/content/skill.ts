import { TITLE_FIELD } from './info';
import { list } from '../grammar/list';
import { SectionSchema } from '../grammar/section';
import { SkillGrant, skillGrant } from '../grammar/skillGrant';
import { BonusAmount, bonusAmount } from '../grammar/tagClause';
import { id } from '../grammar/values';

export interface Skill {
  id: string;
  title: string;
  'stat-id'?: string;
  'per-level'?: BonusAmount;
  // What trains this skill, written bare so that the skill is named once, in
  // the heading the lines are under, rather than again on every line.
  grants: SkillGrant[];
}

export const skillSchema: SectionSchema<Skill> = {
  kind: 'skill',
  fields: {
    title: TITLE_FIELD,
    'stat-id': { parser: id },
    'per-level': { parser: bonusAmount },
    grants: { parser: list(skillGrant), default: () => [], block: true },
  },
  clauses: 'grants',
};
