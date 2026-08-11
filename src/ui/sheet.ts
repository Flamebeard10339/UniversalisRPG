import { tidy } from './format';

export interface Entry {
  name: string;
  value: string;
}

// Sorted by name rather than left in the order the engine happened to build
// them: a sheet whose rows move when a count changes is a sheet a player has to
// re-read every time they open it.
const byName = (left: Entry, right: Entry): number => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

export function counted(held: Record<string, number>): Entry[] {
  return Object.entries(held)
    .map(([name, value]) => ({ name, value: tidy(value) }))
    .sort(byName);
}

export function named(held: Record<string, string>): Entry[] {
  return Object.entries(held)
    .map(([name, value]) => ({ name, value }))
    .sort(byName);
}
