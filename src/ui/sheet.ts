import type { Place } from '../content/sections/slot';
import type { Answer, Localized, Localizer } from '../runtime/localized';
import type { CountedRow, GroupRow, PlayStatus } from '../runtime/session';
import { signed, tidy } from './format';

export interface Entry {
  name: Localized;
  value: Localized;
  id?: Answer;
  detail?: Localized;
  at?: Place;
  // What kind of thing this row is, which is the one thing a cell is filled with.
  group?: GroupRow;
}

type CarriedRow = PlayStatus['carried'][number];
type Plane = PlayStatus['planes'][number];
type WornSlot = PlayStatus['equipment'][number];
type Contribution = Plane['contributions'][number];

const byName = (left: Entry, right: Entry): number =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : (left.id ?? '') < (right.id ?? '') ? -1 : (left.id ?? '') > (right.id ?? '') ? 1 : 0;

// Who the player is, as sheet rows: the words the field is called by against the words its answer
// reads as. Written in the sheet's own order rather than sorted, so the questions stand as they were
// asked; a field nobody has answered draws nothing.
export function identity(rows: PlayStatus['player']): Entry[] {
  return Object.values(rows).flatMap((row) => (row === null ? [] : [{ id: row.id, name: row.label, value: row.title }]));
}

export function counted(rows: readonly CountedRow[], localizer: Localizer): Entry[] {
  return rows.map((row) => ({ id: row.id, name: row.title, value: localizer.identifier(tidy(row.value)) })).sort(byName);
}

export function contributionText(contributions: readonly Contribution[], localizer: Localizer): Localized {
  const parts: string[] = [];
  for (const { statTitle, added, increased } of contributions) {
    if (added.min !== 0 || added.max !== 0) parts.push(`${added.min === added.max ? signed(added.min) : `${signed(added.min)}-${tidy(added.max)}`} ${statTitle}`);
    if (increased !== 0) parts.push(`${signed(increased)}% ${statTitle}`);
  }
  return localizer.identifier(parts.join(', '));
}

function detailOf(row: CarriedRow, planes: readonly Plane[], localizer: Localizer): Partial<Entry> {
  const contributions = row.grown ? (planes.find((plane) => plane.instance === row.id)?.contributions ?? []) : [];
  const detail = contributionText(contributions, localizer);
  return detail === '' ? {} : { detail };
}

export function carried(rows: readonly CarriedRow[], planes: readonly Plane[], localizer: Localizer): Entry[] {
  return rows
    .filter((row) => row.worn === undefined)
    .map((row) => ({ id: row.id, name: row.name, value: localizer.identifier(tidy(row.count)), ...(row.group === undefined ? {} : { group: row.group }), ...detailOf(row, planes, localizer) }))
    .sort(byName);
}

export function worn(slots: readonly WornSlot[], rows: readonly CarriedRow[], planes: readonly Plane[], localizer: Localizer, empty: Localized): Entry[] {
  return slots
    .map((slot) => {
      const where = slot.at === undefined ? {} : { at: slot.at };
      const filled = rows.find((row) => row.worn?.slot === slot.slot);
      if (!filled) return { name: slot.title, value: empty, ...where };
      return { id: filled.id, name: slot.title, value: filled.name, ...(filled.group === undefined ? {} : { group: filled.group }), ...detailOf(filled, planes, localizer), ...where };
    })
    .sort(byName);
}
