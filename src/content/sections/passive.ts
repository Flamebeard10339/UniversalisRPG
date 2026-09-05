import { HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
import { listMembers } from '../../grammar/section';
import { TagClause, tagClause } from '../../grammar/tagClause';
import { text } from '../../grammar/values';
import { baselineGrant, type BaselineGrant } from '../../grammar/baselineGrant';
import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Passive extends HookCarrier {
  id: string;
  title: string;
  examine?: string;
  tags: TagClause[];
  grants: BaselineGrant[];
}

export const passive = section<Passive>()({
  kind: 'passive',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'passives',
  text: ['title', 'examine'],
  fields: {
    title: TITLE_FIELD,
    examine: { parser: text },
    tags: {
      parser: list(tagClause),
      default: () => [],
      note: 'a range is rolled once, when the cluster carrying this passive enters a plane; one an entity carries has no such moment and rolls per swing',
    },
    grants: {
      parser: list(baselineGrant),
      default: () => [],
      block: true,
      note: 'what this passive is worth, written as a multiple of what one level is worth on the ladder the stat climbs rather than as an amount. `+2x added physical-damage` grants twice what a level adds; `-0.5x increased defense` takes away half what a level increases. The engine writes the number, so moving a ladder re-cuts every passive hanging off it, and a passive that gives on one line and takes on another is two of these rather than a special case. What a stat says under `rounds to:` is applied to the added half, a percent being no quantity of the stat to round',
    },
    ...HOOK_FIELDS,
  },
  clauses: 'tags',
  validate: (value) => {
    const zero = listMembers<BaselineGrant>(value.grants).find((grant) => grant.times === 0);
    if (zero) return `grants: +0x ${zero.axis} ${zero.statId} is worth nothing at any rung, so it grants nothing: write what it is worth, or leave the line out`;
    return undefined;
  },
});
