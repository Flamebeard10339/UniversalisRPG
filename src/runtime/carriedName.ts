import type { Localized, Localizer } from './localized';

// What a carried thing is called, wherever one is named. Every screen reads
// this rather than composing a name of its own, so the word a player learns on
// one surface is the word the next one uses (c16). `copy` is the ordinal of the
// grown copy being named, or null for one still in its stack.

// c1: a grown copy is named, not numbered — the descriptor carries the fact
// that it left its stack, and which copy it is comes from the stats beneath it.
// Where the played language has no words for the template there is nothing to
// wear a descriptor and no key of the copy's own to show, so the copy is named
// by the two things it does have: what it is a copy of, and which one it is.
export function carriedName(localizer: Localizer, kind: string, template: string, copy: string | null): Localized {
  const title = localizer.words(kind, template, 'title');
  if (title === undefined) return copy === null ? localizer.title(kind, template) : localizer.identifier(`${template}#${copy}`);
  return copy === null ? title : localizer.engine('engine.item.modified', { item: title });
}
