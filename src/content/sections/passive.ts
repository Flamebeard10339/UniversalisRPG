import { HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
import { TagClause, tagClause } from '../../grammar/tagClause';
import { decimal, id, text } from '../../grammar/values';
import { hooks, pruneHook, pruneTags, visitTags, type Loose } from '../refs';
import { section } from './define';
import { TITLE_FIELD } from './info';

export interface Passive extends HookCarrier {
  id: string;
  title: string;
  examine?: string;
  tags: TagClause[];
  grants?: string;
  budget?: number;
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
      parser: id,
      names: { id: 'stat' },
      standsWithout: true,
      note: 'the stat this passive raises, whose worth is worked out from `budget:` against the # ladder that stat climbs rather than written here. A passive that names this writes no amount of its own: what a point of it comes to is one level of the ladder divided by the budget, so moving the ladder moves every passive cut against it at once',
    },
    budget: {
      parser: decimal,
      standsWithout: true,
      note: 'how many points of this passive come to one level of the ladder its `grants:` stat climbs, so a budget of 1 makes a point of it worth a whole level and 4 makes it worth a quarter of one. This is the whole of what an author chooses about what a passive is worth, and it is a share rather than an amount, so it says the same thing whatever the ladder later says',
    },
    ...HOOK_FIELDS,
  },
  clauses: 'tags',
  validate: (value) => {
    if ((value.grants === undefined) !== (value.budget === undefined)) {
      return 'names one of grants: and budget: without the other, and neither says anything alone: grants: is the stat and budget: is what a point of it is worth against the ladder that stat climbs';
    }
    if (value.budget !== undefined && value.budget <= 0) return `budget: ${String(value.budget)} would make a point of this worth nothing or less; a budget is how many points come to one level, so it is more than zero`;
    return undefined;
  },
  visit: (value, where, visit) => {
    const held = value as unknown as Loose;
    visitTags(held.tags, where, visit);
    hooks(held, where, visit);
  },
  prune: (value, at, where) => {
    const tags = pruneTags(value.tags, where, at);
    const onHit = pruneHook(value.onHit, `${where} on hit:`, at);
    const whenHit = pruneHook(value.whenHit, `${where} when hit:`, at);
    return tags.length === value.tags.length && onHit === value.onHit && whenHit === value.whenHit ? value : { ...value, tags, onHit, whenHit };
  },
});
