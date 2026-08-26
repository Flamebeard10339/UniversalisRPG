import { list } from '../../grammar/list';
import { point } from '../../grammar/range';
import { listMembers } from '../../grammar/section';
import { SkillGrant, skillGrant } from '../../grammar/skillGrant';
import { Counter, TagClause, tagClause } from '../../grammar/tagClause';
import { id } from '../../grammar/values';
import { put, pruneTags, visitTags, type Loose } from '../refs';
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
    stat: { parser: id, names: { id: 'stat' }, standsWithout: true, note: `raised by +${PER_LEVEL} and by +${PER_LEVEL_PERCENT}% for every level of this skill, which is the engine's rule and not a bonus anyone writes; a skill naming no stat raises none` },
    tags: { parser: list(tagClause), default: () => [], note: 'carried by anyone who has this skill' },
    grants: { parser: list(skillGrant), default: () => [], block: true },
  },
  clauses: 'grants',
  visit: (value, where, visit) => {
    const held = value as unknown as Loose;
    visitTags(held.tags, where, visit);
    for (const grant of listMembers<SkillGrant>(value.grants)) put(grant, 'event', 'event', `${where} gain`, visit);
  },
  prune: (value, at, where) => {
    const tags = pruneTags(value.tags, where, at);
    const grants = value.grants.filter((grant) => !at.gone('event', grant.event, `${where} gain`));
    return tags.length === value.tags.length && grants.length === value.grants.length ? value : { ...value, tags, grants };
  },
});

// What anyone holding this skill carries because of it. The level grant is derived from the one thing the skill declares rather than written beside every skill, so a skill added next month is granted with nothing edited — and a skill with no stat of its own has nothing to raise, which is the whole of what it grants. It lands on both channels a bonus in this language has, so a level is worth a flat point of the stat and a point of the percentage that multiplies it.
const perLevel = (skill: Skill, statId: string): readonly TagClause[] => {
  const per: Counter = { kind: 'level', id: skill.id };
  return [
    { kind: 'stat-bonus', statId, per, percent: false, amount: point(PER_LEVEL) },
    { kind: 'stat-bonus', statId, per, percent: true, amount: PER_LEVEL_PERCENT },
  ];
};

export const skillTags = (skill: Skill): readonly TagClause[] => (skill.stat === undefined ? skill.tags : [...skill.tags, ...perLevel(skill, skill.stat)]);
