import { HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
import { Range } from '../../grammar/range';
import { TagClause, tagClause } from '../../grammar/tagClause';
import { text } from '../../grammar/values';
import { hooks, pruneHook, pruneTags, visitTags, type Loose } from '../refs';
import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Passive extends HookCarrier {
  id: string;
  title: string;
  examine?: string;
  tags: TagClause[];
}

function formatRangeClause(statId: string, amount: Range): string {
  const sign = amount.min < 0 ? '-' : '+';
  return `${sign}${Math.abs(amount.min)}-${Math.abs(amount.max)} ${statId}`;
}

// A passive is always on: there is no moment at which a range could roll, and
// rolling once at allocation would put a per-position number in every saved
// instance rather than nothing.
export function passiveRangeProblem(passive: Passive): string | undefined {
  for (const tag of passive.tags) {
    if (tag.kind === 'stat-bonus' && !tag.percent && tag.amount.min !== tag.amount.max) {
      return `${formatRangeClause(tag.statId, tag.amount)} is a range; a passive has no moment to roll one, so its payload must be one value`;
    }
  }
  return undefined;
}

export const passive = section<Passive>()({
  kind: 'passive',
  ids: 'owned',
  map: 'passives',
  text: ['title', 'examine'],
  fields: {
    title: TITLE_FIELD,
    examine: { parser: text },
    tags: { parser: list(tagClause), default: () => [] },
    ...HOOK_FIELDS,
  },
  clauses: 'tags',
  validate: passiveRangeProblem,
  visit: (value, where, visit) => {
    const held = value as unknown as Loose;
    visitTags(held.tags, where, visit);
    hooks(held, where, visit);
  },
  // A passive is a carrier like an item is: what a jewel placed it for survives
  // a payload whose stat went.
  prune: (value, at, where) => {
    const tags = pruneTags(value.tags, where, at);
    const onHit = pruneHook(value.onHit, `${where} on hit:`, at);
    const whenHit = pruneHook(value.whenHit, `${where} when hit:`, at);
    return tags.length === value.tags.length && onHit === value.onHit && whenHit === value.whenHit ? value : { ...value, tags, onHit, whenHit };
  },
});
