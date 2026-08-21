import { list } from '../../grammar/list';
import { listMembers } from '../../grammar/section';
import { SkillGrant, skillGrant } from '../../grammar/skillGrant';
import { BonusAmount, bonusAmount } from '../../grammar/tagClause';
import { id } from '../../grammar/values';
import { put } from '../refs';
import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Skill {
  id: string;
  title: string;
  'stat-id'?: string;
  'per-level'?: BonusAmount;
  grants: SkillGrant[];
}

export const skill = section<Skill>()({
  kind: 'skill',
  ids: 'owned',
  map: 'skills',
  text: ['title'],
  fields: {
    title: TITLE_FIELD,
    'stat-id': { parser: id, names: { id: 'stat' } },
    'per-level': { parser: bonusAmount },
    grants: { parser: list(skillGrant), default: () => [], block: true },
  },
  clauses: 'grants',
  validate: (value) => (value['per-level'] && !value['stat-id'] ? 'per-level: needs a stat-id: to raise' : undefined),
  visit: (value, where, visit) => {
    for (const grant of listMembers<SkillGrant>(value.grants)) put(grant, 'event', 'event', `${where} gain`, visit);
  },
  prune: (value, at, where) => {
    const grants = value.grants.filter((grant) => !at.gone('event', grant.event, `${where} gain`));
    return grants.length === value.grants.length ? value : { ...value, grants };
  },
});
