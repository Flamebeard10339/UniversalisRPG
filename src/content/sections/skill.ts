import { list } from '../../grammar/list';
import { listMembers } from '../../grammar/section';
import { SkillGrant, skillGrant } from '../../grammar/skillGrant';
import { TagClause, tagClause } from '../../grammar/tagClause';
import { put, pruneTags, visitTags, type Loose } from '../refs';
import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Skill {
  id: string;
  title: string;
  tags: TagClause[];
  grants: SkillGrant[];
}

export const skill = section<Skill>()({
  kind: 'skill',
  ids: 'owned',
  map: 'skills',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
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
