import type { Answer } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

// A level crossed, from the shell's side. The engine says it in the log, where
// a player reading the log will see it; this is the other half — the mark that
// waits on the banner for a player who was not reading, and comes off only once
// they have gone and looked.

type Row = PlayView['xp'][number];

export interface Crossings {
  // Crossed and not yet looked at. While there is one, the banner is marked.
  waiting: ReadonlySet<Answer>;
  // Crossed and being acknowledged now: exactly what was waiting when the page
  // was opened, so the panels that flash are the ones that earned it.
  greeted: ReadonlySet<Answer>;
  // What re-keys the greeting, because a class that never changes plays no
  // animation and a second visit has to flash again.
  generation: number;
}

export const nothingCrossed: Crossings = { waiting: new Set(), greeted: new Set(), generation: 0 };

// Which skills went up a level between two readings of what the engine
// published. The level is the engine's own, so a skill the shell has never
// heard of is judged the same way as one it has — and a skill that appears for
// the first time is judged against the level everyone starts at.
export function crossings(before: readonly Row[], after: readonly Row[]): Answer[] {
  const held = new Map(before.map((row) => [row.id, row.level]));
  return after.flatMap((row) => (row.level > (held.get(row.id) ?? FIRST_LEVEL) ? [row.id] : []));
}

// Where a skill nobody has earned in stands. Not a curve and not a threshold:
// the level a total of nothing reads as, which the engine publishes for every
// skill it knows about and this is the answer for one it does not.
const FIRST_LEVEL = 1;

export function noticed(held: Crossings, crossed: readonly Answer[]): Crossings {
  return crossed.length === 0 ? held : { ...held, waiting: new Set([...held.waiting, ...crossed]) };
}

// The page has been opened. Everything that was waiting is greeted at once and
// nothing is left waiting, so the banner settles in the same breath the panels
// flash. Opening a page with nothing waiting changes nothing, which is what
// stops every visit re-playing the last one.
export function looked(held: Crossings): Crossings {
  if (held.waiting.size === 0) return held.greeted.size === 0 ? held : { ...held, greeted: new Set() };
  return { waiting: new Set(), greeted: new Set(held.waiting), generation: held.generation + 1 };
}

export const stirring = (held: Crossings): boolean => held.waiting.size > 0;
