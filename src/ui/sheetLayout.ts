import type { Entry } from './sheet';

export type Layout = 'list' | 'grid' | 'doll';

// The one grid every dense page is laid out on: as many columns of at least 6rem as the width
// affords. A page that wants this shape takes it from here rather than writing the columns again.
export const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3';

export interface Doll {
  body: readonly Entry[];
  beneath: readonly Entry[];
  columns: number;
  rows: number;
}

// The body is as wide and as tall as the slots that say where they sit reach between them, and no
// wider. A slot that says nothing about where it sits — including one no `# slot` describes at all,
// which is every slot an `equipment-slots:` names and nothing else — falls to the row beneath, so
// there is no position a slot can hold that leaves it undrawn.
export function doll(entries: readonly Entry[]): Doll {
  const body = entries.filter((entry) => entry.at !== undefined);
  return {
    body,
    beneath: entries.filter((entry) => entry.at === undefined),
    columns: Math.max(0, ...body.map((entry) => entry.at!.column)),
    rows: Math.max(0, ...body.map((entry) => entry.at!.row)),
  };
}
