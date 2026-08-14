import type { Localized, Localizer } from './localized';

// What a carried thing is called, wherever one is named. Every screen reads
// this rather than composing a name of its own, so the word a player learns on
// one surface is the word the next one uses (c16).

// A grown copy is named, not numbered: the descriptor carries the fact that it
// left its stack, and which copy it is comes from the stats beneath it rather
// than from an id in the name. The descriptor is the engine's own word for it,
// so it is a pattern the played language supplies rather than a prefix.
export function carriedName(localizer: Localizer, kind: string, id: string, grown: boolean): Localized {
  const title = localizer.title(kind, id);
  return grown ? localizer.engine('engine.item.modified', { item: title }) : title;
}
