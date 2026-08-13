// What a carried thing is called, wherever one is named. Every screen reads
// this rather than composing a name of its own, so the word a player learns on
// one surface is the word the next one uses (c16).

// A grown copy is named, not numbered: the descriptor carries the fact that it
// left its stack, and which copy it is comes from the stats beneath it rather
// than from an id in the name.
export const GROWN_DESCRIPTOR = 'Modified';

export function carriedName(title: string, grown: boolean): string {
  return grown ? `${GROWN_DESCRIPTOR} ${title}` : title;
}
