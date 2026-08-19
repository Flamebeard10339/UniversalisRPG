import { Registry } from '../content/registry';
import { carriedName } from './carriedName';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { itemCopies, grownItems, isGrownCopy, itemTemplate, wornCopy, wornIn } from './itemInstance';
import { GameState, type ModalAnswers, type ModalFrame } from './state';

// What the player carries, as rows: the stacks, the grown copies and what is
// worn, each listed once. The screen that asks about them is carriedScreen.ts
// and the session publishes the same rows without one, which is why they are
// declared beneath both.

export interface CarriedEntry {
  // What a verb names this by, and what names this one row apart from every
  // other: an item id for a stack, the minted id for a grown copy, and the slot
  // for the stack copy worn in one — which has left its stack and so is not the
  // row its item id names.
  readonly id: Answer;
  // The one name for it (c16). Every surface spells a carried thing this way.
  readonly name: Localized;
  // How many the player has: a stack's count, and one for a grown copy or a
  // worn one, neither of which is counted in a stack.
  readonly count: number;
  // The same row, in the language being played. `name` is what a surface calls
  // the thing; this is `name` with the count or the slot the row is listed by.
  readonly shown: Localized;
  readonly grown: boolean;
  // The slot this entry is worn in, and undefined for a carried one: c21 puts
  // every entry on exactly one of those two sides, so this is what a page
  // listing one side and not the other reads, and what says which verbs apply.
  // The id and the words for it travel together, because a verb takes the one
  // and a page draws the other (c10).
  readonly worn?: { readonly slot: Answer; readonly title: Localized };
}

// One row per slot the world declares, whether or not anything is in it: a slot
// standing empty is somewhere the player can put something and is a fact about
// the character, and a page inferring it from what happens to be worn would
// show a character with nothing on as having no slots.
//
// `item` is the spelling the state holds — what a plane report and a save name
// the copy by — which is not the row `carried` lists it as, because c21 mints
// that one from the slot. Both it and the name are null for an empty slot.
export interface WornRow {
  readonly slot: Answer;
  readonly title: Localized;
  readonly item: Answer | null;
  readonly name: Localized | null;
}

export type CarriedFrame = Extract<ModalFrame, { name: 'carried-items' }>;

export function carriedFrame(answers: ModalAnswers = {}): CarriedFrame {
  return { name: 'carried-items', answers };
}

function nameOf(template: string, localizer: Localizer, copy: string | null): Localized {
  return carriedName(localizer, 'item', template, copy);
}

// c1: a stack is listed by name and count, a grown copy by name alone, because
// a grown copy is not interchangeable with its stack and is never in one. c21
// adds the third side: what is worn is listed once, under the slot wearing it,
// and is on neither of the first two lists.
export function carriedEntries(state: GameState, registry: Registry): CarriedEntry[] {
  const localizer = localizerOf(registry, state);
  const entries: CarriedEntry[] = [];
  for (const [template, { stack }] of itemCopies(state)) {
    const name = nameOf(template, localizer, null);
    if (stack > 0) entries.push({ id: template, name, count: stack, shown: localizer.engine('engine.carried.stack', { item: name, count: stack }), grown: false });
  }
  for (const [id, template] of Object.entries(grownItems(state))) {
    if (wornIn(state, id) !== undefined) continue;
    entries.push({ id, name: nameOf(template, localizer, id), count: 1, shown: nameOf(template, localizer, id), grown: true });
  }
  for (const row of wornRows(state, registry)) {
    if (row.item === null || row.name === null) continue;
    const grown = isGrownCopy(state, row.item);
    entries.push({
      id: grown ? row.item : wornCopy(row.slot),
      name: row.name,
      count: 1,
      shown: localizer.engine('engine.carried.worn', { item: row.name, slot: row.title }),
      grown,
      worn: { slot: row.slot, title: row.title },
    });
  }
  return entries;
}

export function wornRows(state: GameState, registry: Registry): WornRow[] {
  const localizer = localizerOf(registry, state);
  // Every declared slot, and then anything the state is wearing in a slot the
  // registry no longer declares — a save older than the module that dropped it
  // still has the copy, and a row nobody drew would be a copy the player could
  // not reach.
  const declared = [...registry.slots.keys()];
  const slots = [...declared, ...Object.keys(state.equipped).filter((slot) => !declared.includes(slot))];
  return slots.map((slot) => {
    const id: string | undefined = state.equipped[slot];
    return {
      slot,
      title: localizer.title('slot', slot),
      item: id ?? null,
      name: id === undefined ? null : nameOf(itemTemplate(state, id), localizer, isGrownCopy(state, id) ? id : null),
    };
  });
}
