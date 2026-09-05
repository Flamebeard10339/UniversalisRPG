import { list } from '../../grammar/list';
import { point } from '../../grammar/range';
import { SkillGrant, skillGrant } from '../../grammar/skillGrant';
import { Counter, TagClause, tagClause } from '../../grammar/tagClause';
import { id } from '../../grammar/values';
import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Skill {
  id: string;
  title: string;
  stat?: string;
  tags: TagClause[];
  grants: SkillGrant[];
}

const PER_LEVEL = 1;
const PER_LEVEL_PERCENT = 1;

export const skill = section<Skill>()({
  kind: 'skill',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'skills',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    stat: { parser: id, names: { id: 'stat' }, standsWithout: true, note: `raised by +${PER_LEVEL} and by +${PER_LEVEL_PERCENT}% for every level of this skill; a skill naming no stat raises none` },
    tags: { parser: list(tagClause), default: () => [], note: 'carried by anyone who has this skill' },
    grants: { parser: list(skillGrant), default: () => [], block: true },
  },
  clauses: 'grants',
});

const perLevel = (skill: Skill, statId: string): readonly TagClause[] => {
  const per: Counter = { kind: 'level', id: skill.id };
  return [
    { kind: 'stat-bonus', statId, per, percent: false, amount: point(PER_LEVEL) },
    { kind: 'stat-bonus', statId, per, percent: true, amount: PER_LEVEL_PERCENT },
  ];
};

export const skillTags = (skill: Skill): readonly TagClause[] => (skill.stat === undefined ? skill.tags : [...skill.tags, ...perLevel(skill, skill.stat)]);
