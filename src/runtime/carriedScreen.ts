import type { ModalChoice, ModalOption } from './modalOption';
import { isBase, Item } from '../content/item';
import type { EngineKey } from '../content/locale';
import { Registry } from '../content/registry';
import { carriedName } from './carriedName';
import { equip, unequip } from './equipment';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { itemCopies, destroyItem, grownItems, isGrownCopy, itemTemplate, wornCopy, wornIn } from './itemInstance';
import { planeFrame } from './planeScreen';
import { GameState, type ModalAnswers, type ModalFrame } from './state';

// What the player carries, as a list of entries and the verbs each of them
// takes. It asks one thing at a time — which item, then which verb, then whether
// a grown copy really goes — and every question is a listed value, so neither
// driver needs a way to type into it.

// The value that leaves the screen (c15). It is published beside every question
// the frame asks, because a modal comes down on the answer that completes it and
// a screen with no such answer is one the world stays withdrawn behind.
export const LEAVE: Answer = 'close';
const LEAVE_SHOWN: EngineKey = 'engine.carried.close';

// The other answer to the second question a grown copy's destruction asks. What
// is lost is named by that question's own label, so this stays the same word
// however the copy is titled and a recorded route replays whatever it was.
export const CONFIRMED: Answer = 'go-ahead';
const CONFIRMED_SHOWN: EngineKey = 'engine.carried.confirmed';

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

interface CarriedVerb {
  // What answering with it is spelled as, and the key for the words offered
  // beside it. The first is a directive a `# test` replays and does not move
  // with the language; the second is all the player reads and does.
  readonly value: Answer;
  readonly shown: EngineKey;
  applies(item: Item | undefined, entry: CarriedEntry): boolean;
  // Whether taking it asks once more, naming what is lost, before it happens (c12).
  confirms(entry: CarriedEntry): boolean;
  take(entry: CarriedEntry, state: GameState, registry: Registry): ModalFrame | null;
}

const VERBS: readonly CarriedVerb[] = [
  {
    value: 'grow',
    shown: 'engine.carried.verb.grow',
    applies: (item) => item !== undefined && isBase(item),
    confirms: () => false,
    // c3: the plane screen replaces this one rather than stacking on it, which
    // is what returning a frame from a verb already means.
    take: (entry) => planeFrame(entry.id),
  },
  {
    value: 'equip',
    shown: 'engine.carried.verb.equip',
    applies: (item, entry) => item?.slot !== undefined && entry.worn === undefined,
    confirms: () => false,
    take: (entry, state, registry) => {
      equip(state, registry, entry.id);
      return null;
    },
  },
  {
    value: 'unequip',
    shown: 'engine.carried.verb.unequip',
    applies: (_item, entry) => entry.worn !== undefined,
    confirms: () => false,
    take: (entry, state) => {
      if (entry.worn) unequip(state, entry.worn.slot);
      return null;
    },
  },
  {
    value: 'destroy',
    shown: 'engine.carried.verb.destroy',
    applies: () => true,
    confirms: (entry) => entry.grown,
    take: (entry, state) => {
      destroyItem(state, entry.id);
      return null;
    },
  },
];

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

function verbsFor(entry: CarriedEntry, state: GameState, registry: Registry): readonly CarriedVerb[] {
  const item = registry.items.get(itemTemplate(state, entry.id));
  return VERBS.filter((verb) => verb.applies(item, entry));
}

// Every row a screen offers is answered by its own spelling — an item's base
// name, a verb — and read as the words beside it, which for an item is the name
// the played language gives it and for anything the engine says is a pattern.
function listed(localizer: Localizer, choices: readonly ModalChoice[]): readonly ModalChoice[] {
  return [...choices, { value: LEAVE, shown: localizer.engine(LEAVE_SHOWN) }];
}

// Each answer widens what the screen asks, which is what leaves the verbs to be
// computed from the item already chosen rather than from every item at once.
export function carriedOptions(answers: ModalAnswers, state: GameState, registry: Registry): ModalOption[] {
  const entries = carriedEntries(state, registry);
  const localizer = localizerOf(registry, state);
  const item: ModalOption = { key: 'item', label: localizer.engine('engine.modal.item'), values: listed(localizer, entries.map((entry) => ({ value: entry.id, shown: entry.shown }))) };

  const chosen = entries.find((entry) => entry.id === answers.item);
  if (!chosen) return [item];

  const applicable = verbsFor(chosen, state, registry);
  const verb: ModalOption = { key: 'verb', label: chosen.name, values: listed(localizer, applicable.map((each) => ({ value: each.value, shown: localizer.engine(each.shown) }))) };

  const taking = applicable.find((each) => each.value === answers.verb);
  if (!taking?.confirms(chosen)) return [item, verb];
  // The verb is an answer value rather than words, so it goes in as an id.
  return [item, verb, { key: 'confirm', label: localizer.engine('engine.modal.confirm', { verb: localizer.engine(taking.shown), item: chosen.name }), values: listed(localizer, [{ value: CONFIRMED, shown: localizer.engine(CONFIRMED_SHOWN) }]) }];
}

// The frame that replaces this one: itself with the answer kept while it still
// has something to ask, and nothing once the verb has been taken.
export function carriedSubmit(answers: ModalAnswers, state: GameState, registry: Registry): ModalFrame | null {
  if (answers.item === LEAVE || answers.verb === LEAVE || answers.confirm === LEAVE) return null;

  const chosen = carriedEntries(state, registry).find((entry) => entry.id === answers.item);
  if (!chosen) return null;

  const taking = verbsFor(chosen, state, registry).find((each) => each.value === answers.verb);
  if (!taking) return carriedFrame({ item: chosen.id });
  if (taking.confirms(chosen) && answers.confirm === undefined) return carriedFrame({ item: chosen.id, verb: taking.value });
  return taking.take(chosen, state, registry);
}
