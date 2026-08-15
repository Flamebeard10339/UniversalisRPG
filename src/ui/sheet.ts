import type { Answer, Localized, Localizer } from '../runtime/localized';
import type { CountedRow, PlayStatus } from '../runtime/session';
import { signed, tidy } from './format';

export interface Entry {
  // What the row is of. Words where the engine published words, and the id or
  // the count it published where it published one of those: a slot is a slot,
  // and it goes through `identifier()` because a thing with no language is
  // spelled the same in every one of them (c1's ruling on that door).
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
type WornSlot = PlayStatus['equipment'][number];
type Contribution = Plane['contributions'][number];

// Sorted by name rather than left in the order the engine happened to build
// them: a sheet whose rows move when a count changes is a sheet a player has to
// re-read every time they open it.
const byName = (left: Entry, right: Entry): number =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : (left.id ?? '') < (right.id ?? '') ? -1 : (left.id ?? '') > (right.id ?? '') ? 1 : 0;

// Rows the engine already named, drawn under those names. Stats and skills are
// two readings of one shape, and neither reaches this page as an id (c9, c10).
export function counted(rows: readonly CountedRow[], localizer: Localizer): Entry[] {
  return rows.map((row) => ({ id: row.id, name: row.title, value: localizer.identifier(tidy(row.value)) })).sort(byName);
}

// What one item is worth, per stat, from the fold the engine already published:
// the two channels are stated apart because they land on a stat differently and
// adding them would be this layer inventing arithmetic.
export function contributionText(contributions: readonly Contribution[], localizer: Localizer): Localized {
  const parts: string[] = [];
  for (const { statTitle, added, increased } of contributions) {
    if (added.min !== 0 || added.max !== 0) parts.push(`${added.min === added.max ? signed(added.min) : `${signed(added.min)}-${tidy(added.max)}`} ${statTitle}`);
    if (increased !== 0) parts.push(`${signed(increased)}% ${statTitle}`);
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
    .filter((row) => row.worn === undefined)
    .map((row) => ({ id: row.id, name: row.name, value: localizer.identifier(tidy(row.count)), ...detailOf(row, planes, localizer) }))
    .sort(byName);
}

// What is worn, slot by slot: the slot is the row and what fills it is the
// value, named the one way every surface names a carried thing.
//
// Which slots there are comes from the engine's own dictionary, because a slot
// standing empty is a fact about the character that nothing the player is
// carrying could say. What fills one is still the copy the engine already named
// on the carried side of c21, so opening a row dispatches the id that names
// that copy and not the item behind it — and a row with nothing in it opens
// nothing, because there is no copy for it to open.
export function worn(slots: readonly WornSlot[], rows: readonly CarriedRow[], planes: readonly Plane[], localizer: Localizer, empty: Localized): Entry[] {
  return slots
    .map((slot) => {
      const filled = rows.find((row) => row.worn?.slot === slot.slot);
      if (!filled) return { name: slot.title, value: empty };
      return { id: filled.id, name: slot.title, value: filled.name, ...detailOf(filled, planes, localizer) };
    })
    .sort(byName);
}
