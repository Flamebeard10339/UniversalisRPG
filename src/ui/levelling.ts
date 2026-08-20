import type { Answer } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

type Row = PlayView['xp'][number];

export interface Crossings {
  waiting: ReadonlySet<Answer>;
  greeted: ReadonlySet<Answer>;
  generation: number;
}

export const nothingCrossed: Crossings = { waiting: new Set(), greeted: new Set(), generation: 0 };

export function crossings(before: readonly Row[], after: readonly Row[]): Answer[] {
  const held = new Map(before.map((row) => [row.id, row.level]));
  return after.flatMap((row) => (row.level > (held.get(row.id) ?? FIRST_LEVEL) ? [row.id] : []));
}

const FIRST_LEVEL = 1;

export function noticed(held: Crossings, crossed: readonly Answer[]): Crossings {
  return crossed.length === 0 ? held : { ...held, waiting: new Set([...held.waiting, ...crossed]) };
}

export function looked(held: Crossings): Crossings {
  if (held.waiting.size === 0) return held.greeted.size === 0 ? held : { ...held, greeted: new Set() };
  return { waiting: new Set(), greeted: new Set(held.waiting), generation: held.generation + 1 };
}

export const stirring = (held: Crossings): boolean => held.waiting.size > 0;
