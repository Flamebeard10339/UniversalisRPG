import type { Place } from '../content/sections/slot';
import type { Range } from '../grammar/range';
import type { Answer, Localized, Localizer } from '../runtime/localized';
import type { GroupRow, PlayStatus, StatRow, StatShare } from '../runtime/session';
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

// How much a bonus is worth, in the two channels a bonus lands on and in the words every sheet
// reads them in. A channel that moves nothing says nothing, so a bonus on one channel reads as one
// figure rather than as a figure and a zero.
function amounts(added: Range, increased: number): string[] {
  const said: string[] = [];
  if (added.min !== 0 || added.max !== 0) said.push(added.min === added.max ? signed(added.min) : `${signed(added.min)}-${tidy(added.max)}`);
  if (increased !== 0) said.push(`${signed(increased)}%`);
  return said;
}

// What a stat is made of, share by share: every share the engine folded, named and signed, in the
// order the engine folded them. A share that moves nothing still stands — the base of a stat nothing
// touches is the whole answer to where its number came from. One row each rather than one line for
// all of them, because the screen that draws them is a screen and not a line under a row.
export function madeOf(shares: readonly StatShare[]): Array<{ title: Localized; worth: string }> {
  return shares.map((share) => {
    const said = amounts(share.added, share.increased);
    return { title: share.title, worth: (said.length > 0 ? said : [signed(0)]).join(' ') };
  });
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

// The pack, cell for cell, in the order the view hands it over — which is the order the player has
// put it in. Nothing is sorted here: a sheet that arranged the pack for itself would be a second
// answer to where a thing sits, and the player's own would never survive being drawn.
export function carried(rows: readonly CarriedRow[], planes: readonly Plane[], localizer: Localizer): Entry[] {
  return rows
    .filter((row) => row.worn === undefined)
    .map((row) => ({ id: row.id, name: row.name, value: localizer.identifier(tidy(row.count)), ...(row.group === undefined ? {} : { group: row.group }), ...detailOf(row, planes, localizer) }));
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
