import { TITLE_FIELD } from './info';
import { HOOK_FIELDS, HookCarrier } from '../grammar/hook';
import { list } from '../grammar/list';
import { SectionSchema } from '../grammar/section';
import { Range } from '../grammar/range';
import { TagClause, tagClause } from '../grammar/tagClause';
import { text } from '../grammar/values';

// A passive shares the tag-clause body `# item` already uses: bare words are
// tags, `+N stat` and `+N% stat` are payloads. Its id sits in the same global
// space as every other section, so one declaration is named by any number of
// cluster jewels (c1). It carries the two hook blocks for the same reason an
// item does: whoever holds it answers the moment, and a passive is held.
export interface Passive extends HookCarrier {
  id: string;
  title: string;
  examine?: string;
  tags: TagClause[];
}

export const passiveSchema: SectionSchema<Passive> = {
  kind: 'passive',
  fields: {
    title: TITLE_FIELD,
    examine: { parser: text },
    tags: { parser: list(tagClause), default: () => [] },
    ...HOOK_FIELDS,
  },
  clauses: 'tags',
};

function formatRangeClause(statId: string, amount: Range): string {
  const sign = amount.min < 0 ? '-' : '+';
  return `${sign}${Math.abs(amount.min)}-${Math.abs(amount.max)} ${statId}`;
}

// A passive is always on: there is no moment at which a range could roll, and
// rolling once at allocation would put a per-position number in every saved
// instance rather than nothing (c2). Returns the clause it rejected, for the
// caller to prefix with the section that carried it.
export function passiveRangeProblem(passive: Passive): string | undefined {
  for (const tag of passive.tags) {
    if (tag.kind === 'stat-bonus' && !tag.percent && tag.amount.min !== tag.amount.max) {
      return `${formatRangeClause(tag.statId, tag.amount)} is a range; a passive has no moment to roll one, so its payload must be one value`;
    }
  }
  return undefined;
}
