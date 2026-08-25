import { HOOK_FIELDS, HookCarrier } from '../../grammar/hook';
import { list } from '../../grammar/list';
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
      note: 'a range here is rolled by the cluster that carries the passive, once, when that cluster enters a plane; a passive nothing sockets — one an entity carries — has no such moment and samples its range per swing, the way an item tag does',
    },
    ...HOOK_FIELDS,
  },
  clauses: 'tags',
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
