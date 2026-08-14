import type { Answer, Localized, Localizer } from '../runtime/localized';
import type { PlayStatus } from '../runtime/session';
import { bare, signed, tidy } from './format';

export interface Entry {
  // What the row is of. Words where the engine published words, and the id or
  // the count it published where it published one of those: a stat is a key, a
  // slot is a slot, and both go through `identifier()` because a thing with no
  // language is spelled the same in every one of them (c1's ruling on that
  // door).
  name: Localized;
  value: Localized;
  // The engine id this row is of, where the page has one: what the row is kept
  // apart by and what opening it dispatches. Two rows may share a name — two
  // grown copies of one base do — and never an id.
  id?: Answer;
  // Stated beneath the row, for what a name and a count do not say.
  detail?: Localized;
}

type CarriedRow = PlayStatus['carried'][number];
type Plane = PlayStatus['planes'][number];
type Contribution = Plane['contributions'][number];

// Sorted by name rather than left in the order the engine happened to build
// them: a sheet whose rows move when a count changes is a sheet a player has to
// re-read every time they open it.
const byName = (left: Entry, right: Entry): number =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : (left.id ?? '') < (right.id ?? '') ? -1 : (left.id ?? '') > (right.id ?? '') ? 1 : 0;

export function counted(held: Record<string, number>, localizer: Localizer): Entry[] {
  return Object.entries(held)
    .map(([name, value]) => ({ name: localizer.identifier(name), value: localizer.identifier(tidy(value)) }))
    .sort(byName);
}

// What one item is worth, per stat, from the fold the engine already published:
// the two channels are stated apart because they land on a stat differently and
// adding them would be this layer inventing arithmetic.
export function contributionText(contributions: readonly Contribution[], localizer: Localizer): Localized {
  const parts: string[] = [];
  for (const { statId, added, increased } of contributions) {
    if (added.min !== 0 || added.max !== 0) parts.push(`${added.min === added.max ? signed(added.min) : `${signed(added.min)}-${tidy(added.max)}`} ${bare(statId)}`);
    if (increased !== 0) parts.push(`${signed(increased)}% ${bare(statId)}`);
  }
  return localizer.identifier(parts.join(', '));
}

// A grown copy carries no id in its name, so what tells two of them apart is the
// stat summary beneath — which is the plane report's, looked up by the id the
// row is of and never folded here (c8, c18). A stack has no such summary: what
// is worth stating about one copy of it is worth stating on the page the copy
// that left is listed on.
function detailOf(row: CarriedRow, planes: readonly Plane[], localizer: Localizer): Partial<Entry> {
  const contributions = row.grown ? (planes.find((plane) => plane.instance === row.id)?.contributions ?? []) : [];
  const detail = contributionText(contributions, localizer);
  return detail === '' ? {} : { detail };
}

// Everything the player is carrying, as the engine names and counts it — which
// is the rows on the carried side of c21, the worn ones being the equipment
// page's.
export function carried(rows: readonly CarriedRow[], planes: readonly Plane[], localizer: Localizer): Entry[] {
  return rows
    .filter((row) => row.slot === undefined)
    .map((row) => ({ id: row.id, name: row.name, value: localizer.identifier(tidy(row.count)), ...detailOf(row, planes, localizer) }))
    .sort(byName);
}

// What is worn, slot by slot: the slot is the row and what fills it is the
// value, named the one way every surface names a carried thing. This is the
// other side of c21 rather than a second reading of the equipment dictionary,
// so a row is of the copy the engine already named and opening it dispatches
// the id that names that copy and not the item behind it.
export function worn(rows: readonly CarriedRow[], planes: readonly Plane[], localizer: Localizer): Entry[] {
  return rows
    .filter((row) => row.slot !== undefined)
    .map((row) => ({ id: row.id, name: localizer.identifier(row.slot as string), value: row.name, ...detailOf(row, planes, localizer) }))
    .sort(byName);
}
