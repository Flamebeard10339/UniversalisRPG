import type { PlayStatus } from '../runtime/session';
import { bare, signed, tidy } from './format';

export interface Entry {
  name: string;
  value: string;
  // The engine id this row is of, where the page has one: what the row is kept
  // apart by and what opening it dispatches. Two rows may share a name — two
  // grown copies of one base do — and never an id.
  id?: string;
  // Stated beneath the row, for what a name and a count do not say.
  detail?: string;
}

type CarriedRow = PlayStatus['carried'][number];
type Plane = PlayStatus['planes'][number];
type Contribution = Plane['contributions'][number];

// Sorted by name rather than left in the order the engine happened to build
// them: a sheet whose rows move when a count changes is a sheet a player has to
// re-read every time they open it.
const byName = (left: Entry, right: Entry): number =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : (left.id ?? '') < (right.id ?? '') ? -1 : (left.id ?? '') > (right.id ?? '') ? 1 : 0;

export function counted(held: Record<string, number>): Entry[] {
  return Object.entries(held)
    .map(([name, value]) => ({ name, value: tidy(value) }))
    .sort(byName);
}

// What one item is worth, per stat, from the fold the engine already published:
// the two channels are stated apart because they land on a stat differently and
// adding them would be this layer inventing arithmetic.
export function contributionText(contributions: readonly Contribution[]): string {
  const parts: string[] = [];
  for (const { statId, added, increased } of contributions) {
    if (added.min !== 0 || added.max !== 0) parts.push(`${added.min === added.max ? signed(added.min) : `${signed(added.min)}-${tidy(added.max)}`} ${bare(statId)}`);
    if (increased !== 0) parts.push(`${signed(increased)}% ${bare(statId)}`);
  }
  return parts.join(', ');
}

// Everything the player is carrying, as the engine names and counts it. A grown
// copy carries no id in its name, so what tells two of them apart is the stat
// summary beneath — which is the plane report's, looked up by the id the row is
// of and never folded here (c8, c18).
export function carried(rows: readonly CarriedRow[], planes: readonly Plane[]): Entry[] {
  return rows
    .map((row) => {
      const contributions = row.grown ? (planes.find((plane) => plane.instance === row.id)?.contributions ?? []) : [];
      const detail = contributionText(contributions);
      return { id: row.id, name: row.name, value: tidy(row.count), ...(detail === '' ? {} : { detail }) };
    })
    .sort(byName);
}

// What is worn, slot by slot: the slot is the row and what fills it is the
// value, named the one way every surface names a carried thing.
export function worn(equipment: Record<string, string>, rows: readonly CarriedRow[]): Entry[] {
  const named = new Map(rows.map((row) => [row.id, row.name]));
  return Object.entries(equipment)
    .map(([slot, id]) => ({ name: slot, value: named.get(id) ?? id }))
    .sort(byName);
}
