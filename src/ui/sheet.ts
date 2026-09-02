import type { Place } from '../content/sections/slot';
import { amounts } from '../runtime/figures';
import type { Answer, Localized, Localizer } from '../runtime/localized';
import type { GroupRow, PlayStatus, StatRow } from '../runtime/session';
import { tidy } from './format';
import { lookOf, type ItemLook } from './itemLook';

export interface Entry {
  name: Localized;
  value: Localized;
  id?: Answer;
  detail?: Localized;
  at?: Place;
  group?: GroupRow;
  look?: ItemLook;
  grown?: boolean;
}

type CarriedRow = PlayStatus['carried'][number];
type Plane = PlayStatus['planes'][number];
type WornSlot = PlayStatus['equipment'][number];
type Contribution = Plane['contributions'][number];

const byName = (left: Entry, right: Entry): number =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : (left.id ?? '') < (right.id ?? '') ? -1 : (left.id ?? '') > (right.id ?? '') ? 1 : 0;

export function identity(rows: PlayStatus['player']): Entry[] {
  return Object.values(rows).flatMap((row) => (row === null ? [] : [{ id: row.id, name: row.label, value: row.title }]));
}

export function counted(rows: readonly StatRow[], localizer: Localizer): Entry[] {
  return rows
    .map((row) => ({ id: row.id, name: row.title, value: localizer.identifier(tidy(row.value)) }))
    .sort(byName);
}

export function contributionText(contributions: readonly Contribution[], localizer: Localizer): Localized {
  return localizer.identifier(contributions.flatMap(({ statTitle, added, increased }) => amounts(added, increased).map((each) => `${each} ${statTitle}`)).join(', '));
}

function detailOf(row: CarriedRow, planes: readonly Plane[], localizer: Localizer): Partial<Entry> {
  const contributions = row.grown ? (planes.find((plane) => plane.instance === row.id)?.contributions ?? []) : [];
  const detail = contributionText(contributions, localizer);
  return detail === '' ? {} : { detail };
}

export function carried(rows: readonly CarriedRow[], planes: readonly Plane[], localizer: Localizer): Entry[] {
  return rows
    .filter((row) => row.worn === undefined)
    .map((row) => ({
      id: row.id,
      name: row.name,
      value: localizer.identifier(tidy(row.count)),
      look: lookOf(row),
      grown: row.grown,
      ...(row.group === undefined ? {} : { group: row.group }),
      ...detailOf(row, planes, localizer),
    }));
}

export function worn(slots: readonly WornSlot[], rows: readonly CarriedRow[], planes: readonly Plane[], localizer: Localizer, empty: Localized): Entry[] {
  return slots
    .map((slot) => {
      const where = slot.at === undefined ? {} : { at: slot.at };
      const filled = rows.find((row) => row.worn?.slot === slot.slot);
      if (!filled) return { name: slot.title, value: empty, ...where };
      return { id: filled.id, name: slot.title, value: filled.name, look: lookOf(filled), grown: filled.grown, ...(filled.group === undefined ? {} : { group: filled.group }), ...detailOf(filled, planes, localizer), ...where };
    })
    .sort(byName);
}
