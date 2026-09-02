import type { Entry } from './sheet';

export const LAYOUTS = ['list', 'grid', 'doll'] as const;

export type Layout = (typeof LAYOUTS)[number];

export const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3';

export const SLOTS = `${GRID} auto-rows-[6rem]`;

export const NAME = 'whitespace-normal break-words';

export interface Doll {
  body: readonly Entry[];
  beneath: readonly Entry[];
  columns: number;
  rows: number;
}

export function doll(entries: readonly Entry[]): Doll {
  const body = entries.filter((entry) => entry.at !== undefined);
  return {
    body,
    beneath: entries.filter((entry) => entry.at === undefined),
    columns: Math.max(0, ...body.map((entry) => entry.at!.column)),
    rows: Math.max(0, ...body.map((entry) => entry.at!.row)),
  };
}
