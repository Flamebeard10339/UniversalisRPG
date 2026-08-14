import { isBase, Item } from '../content/item';
import type { EngineKey } from '../content/locale';
import { Registry } from '../content/registry';
import { carriedName } from './carriedName';
import { equip, unequip } from './equipment';
import { BASE_LANGUAGE, Localized, Localizer, localizerFor, localizerOf } from './localized';
import { itemCopies, destroyItem, grownItems, isGrownCopy, itemTemplate, wornCopy, wornIn } from './itemInstance';
import { type ModalAnswers, type ModalChoice, type ModalFrame, type ModalOption } from './modals';
import { planeFrame } from './planeScreen';
import { GameState } from './state';

// What the player carries, as a list of entries and the verbs each of them
// takes. It asks one thing at a time — which item, then which verb, then whether
// a grown copy really goes — and every question is a listed value, so neither
// driver needs a way to type into it.

// The value that leaves the screen (c15). It is published beside every question
// the frame asks, because a modal comes down on the answer that completes it and
// a screen with no such answer is one the world stays withdrawn behind.
export const LEAVE = 'Close';
const LEAVE_SHOWN: EngineKey = 'engine.carried.close';

// The other answer to the second question a grown copy's destruction asks. What
// is lost is named by that question's own label, so this stays the same word
// however the copy is titled and a recorded route replays whatever it was.
export const CONFIRMED = 'Go ahead';
const CONFIRMED_SHOWN: EngineKey = 'engine.carried.confirmed';

export interface CarriedEntry {
  // What a verb names this by, and what names this one row apart from every
  // other: an item id for a stack, the minted id for a grown copy, and the slot
  // for the stack copy worn in one — which has left its stack and so is not the
  // row its item id names.
  readonly id: string;
  // The one name for it (c16). Every surface spells a carried thing this way.
  readonly name: Localized;
  // How many the player has: a stack's count, and one for a grown copy or a
  // worn one, neither of which is counted in a stack.
  readonly count: number;
  // What the screen publishes and an answer comes back as. Built from the item's
  // base name rather than its localized one, because it is the string a
  // `submit-modal:` in a `# test` replays and an answer that moved with the
  // language would be an authored id that moves with it.
  readonly value: string;
  // The same row, in the language being played. `name` is what a surface calls
  // the thing; this is `name` with the count or the slot the row is listed by.
  readonly shown: Localized;
  readonly grown: boolean;
  // The slot this entry is worn in, and undefined for a carried one: c21 puts
  // every entry on exactly one of those two sides, so this is what a page
  // listing one side and not the other reads, and what says which verbs apply.
  readonly slot?: string;
}

interface CarriedVerb {
  // What answering with it is spelled as, and the key for the words offered
  // beside it. The first is a directive a `# test` replays and does not move
  // with the language; the second is all the player reads and does.
  readonly value: string;
  readonly shown: EngineKey;
  applies(item: Item | undefined, entry: CarriedEntry): boolean;
  // Whether taking it asks once more, naming what is lost, before it happens (c12).
  confirms(entry: CarriedEntry): boolean;
  take(entry: CarriedEntry, state: GameState, registry: Registry): ModalFrame | null;
}

const VERBS: readonly CarriedVerb[] = [
  {
    value: 'Grow',
    shown: 'engine.carried.verb.grow',
    applies: (item) => item !== undefined && isBase(item),
    confirms: () => false,
    // c3: the plane screen replaces this one rather than stacking on it, which
    // is what returning a frame from a verb already means.
    take: (entry) => planeFrame(entry.id),
  },
  {
    value: 'Equip',
    shown: 'engine.carried.verb.equip',
    applies: (item, entry) => item?.slot !== undefined && entry.slot === undefined,
    confirms: () => false,
    take: (entry, state, registry) => {
      equip(state, registry, entry.id);
      return null;
    },
  },
  {
    value: 'Unequip',
    shown: 'engine.carried.verb.unequip',
    applies: (_item, entry) => entry.slot !== undefined,
    confirms: () => false,
    take: (entry, state) => {
      if (entry.slot !== undefined) unequip(state, entry.slot);
      return null;
    },
  },
  {
    value: 'Destroy',
    shown: 'engine.carried.verb.destroy',
    applies: () => true,
    confirms: (entry) => entry.grown,
    take: (entry, state, registry) => {
      destroyItem(state, registry, entry.id);
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

// Two items may be named alike, and an answer is matched back by the value it
// was published as, so a repeated value would resolve to whichever came first.
// This is answerability rather than a second name (c16): what the screen calls
// the thing is `name`, and only the value it is answered by is made distinct.
function distinct(entries: CarriedEntry[]): CarriedEntry[] {
  const times = new Map<string, number>();
  for (const entry of entries) times.set(entry.value, (times.get(entry.value) ?? 0) + 1);
  return entries.map((entry) => (times.get(entry.value)! > 1 ? { ...entry, value: `${entry.value} (${entry.id})` } : entry));
}

// c1: a stack is listed by name and count, a grown copy by name alone, because
// a grown copy is not interchangeable with its stack and is never in one. c21
// adds the third side: what is worn is listed once, under the slot wearing it,
// and is on neither of the first two lists.
export function carriedEntries(state: GameState, registry: Registry): CarriedEntry[] {
  const localizer = localizerOf(registry, state);
  const base = localizerFor(registry, BASE_LANGUAGE);
  const entries: CarriedEntry[] = [];
  for (const [template, { stack }] of itemCopies(state)) {
    const name = nameOf(template, localizer, null);
    if (stack > 0) entries.push({ id: template, name, count: stack, value: `${nameOf(template, base, null)} x${stack}`, shown: localizer.engine('engine.carried.stack', { item: name, count: stack }), grown: false });
  }
  for (const [id, template] of Object.entries(grownItems(state))) {
    if (wornIn(state, id) !== undefined) continue;
    const name = nameOf(template, localizer, id);
    entries.push({ id, name, count: 1, value: nameOf(template, base, id), shown: name, grown: true });
  }
  for (const [slot, id] of Object.entries(state.equipped)) {
    const grown = isGrownCopy(state, id);
    const template = itemTemplate(state, id);
    const copy = grown ? id : null;
    const name = nameOf(template, localizer, copy);
    entries.push({ id: grown ? id : wornCopy(slot), name, count: 1, value: `${nameOf(template, base, copy)} (${slot})`, shown: localizer.engine('engine.carried.worn', { item: name, slot: localizer.identifier(slot) }), grown, slot });
  }
  return distinct(entries);
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
  const item: ModalOption = { key: 'item', label: localizer.engine('engine.modal.item'), values: listed(localizer, entries.map((entry) => ({ value: entry.value, shown: entry.shown }))) };

  const chosen = entries.find((entry) => entry.value === answers.item);
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

  const chosen = carriedEntries(state, registry).find((entry) => entry.value === answers.item);
  if (!chosen) return null;

  const taking = verbsFor(chosen, state, registry).find((each) => each.value === answers.verb);
  if (!taking) return carriedFrame({ item: chosen.value });
  if (taking.confirms(chosen) && answers.confirm === undefined) return carriedFrame({ item: chosen.value, verb: taking.value });
  return taking.take(chosen, state, registry);
}
