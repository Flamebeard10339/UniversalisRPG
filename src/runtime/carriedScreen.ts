import { isBase, Item } from '../content/item';
import { Registry } from '../content/registry';
import { carriedName } from './carriedName';
import { equip, unequip } from './equipment';
import { itemCopies, destroyItem, grownItems, isGrownCopy, itemTemplate, wornCopy, wornIn } from './itemInstance';
import { type ModalAnswers, type ModalFrame, type ModalOption } from './modals';
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

// The other answer to the second question a grown copy's destruction asks. What
// is lost is named by that question's own label, so this stays the same word
// however the copy is titled and a recorded route replays whatever it was.
export const CONFIRMED = 'Go ahead';

export interface CarriedEntry {
  // What a verb names this by, and what names this one row apart from every
  // other: an item id for a stack, the minted id for a grown copy, and the slot
  // for the stack copy worn in one — which has left its stack and so is not the
  // row its item id names.
  readonly id: string;
  // The one name for it (c16). Every surface spells a carried thing this way.
  readonly name: string;
  // How many the player has: a stack's count, and one for a grown copy or a
  // worn one, neither of which is counted in a stack.
  readonly count: number;
  // What the screen publishes and an answer comes back as.
  readonly value: string;
  readonly grown: boolean;
  // The slot this entry is worn in, and undefined for a carried one: c21 puts
  // every entry on exactly one of those two sides, so this is what a page
  // listing one side and not the other reads, and what says which verbs apply.
  readonly slot?: string;
}

interface CarriedVerb {
  readonly value: string;
  applies(item: Item | undefined, entry: CarriedEntry): boolean;
  // Whether taking it asks once more, naming what is lost, before it happens (c12).
  confirms(entry: CarriedEntry): boolean;
  take(entry: CarriedEntry, state: GameState, registry: Registry): ModalFrame | null;
}

const VERBS: readonly CarriedVerb[] = [
  {
    value: 'Grow',
    applies: (item) => item !== undefined && isBase(item),
    confirms: () => false,
    // c3: the plane screen replaces this one rather than stacking on it, which
    // is what returning a frame from a verb already means.
    take: (entry) => planeFrame(entry.id),
  },
  {
    value: 'Equip',
    applies: (item, entry) => item?.slot !== undefined && entry.slot === undefined,
    confirms: () => false,
    take: (entry, state, registry) => {
      equip(state, registry, entry.id);
      return null;
    },
  },
  {
    value: 'Unequip',
    applies: (_item, entry) => entry.slot !== undefined,
    confirms: () => false,
    take: (entry, state) => {
      if (entry.slot !== undefined) unequip(state, entry.slot);
      return null;
    },
  },
  {
    value: 'Destroy',
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

function nameOf(template: string, registry: Registry, grown: boolean): string {
  const title = registry.items.get(template)?.title;
  return title === undefined ? template : carriedName(title, grown);
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
  const entries: CarriedEntry[] = [];
  for (const [template, { stack }] of itemCopies(state)) {
    const name = nameOf(template, registry, false);
    if (stack > 0) entries.push({ id: template, name, count: stack, value: `${name} x${stack}`, grown: false });
  }
  for (const [id, template] of Object.entries(grownItems(state))) {
    if (wornIn(state, id) !== undefined) continue;
    const name = nameOf(template, registry, true);
    entries.push({ id, name, count: 1, value: name, grown: true });
  }
  for (const [slot, id] of Object.entries(state.equipped)) {
    const grown = isGrownCopy(state, id);
    const name = nameOf(itemTemplate(state, id), registry, grown);
    entries.push({ id: grown ? id : wornCopy(slot), name, count: 1, value: `${name} (${slot})`, grown, slot });
  }
  return distinct(entries);
}

function verbsFor(entry: CarriedEntry, state: GameState, registry: Registry): readonly CarriedVerb[] {
  const item = registry.items.get(itemTemplate(state, entry.id));
  return VERBS.filter((verb) => verb.applies(item, entry));
}

function listed(values: readonly string[]): readonly string[] {
  return [...values, LEAVE];
}

// Each answer widens what the screen asks, which is what leaves the verbs to be
// computed from the item already chosen rather than from every item at once.
export function carriedOptions(answers: ModalAnswers, state: GameState, registry: Registry): ModalOption[] {
  const entries = carriedEntries(state, registry);
  const item: ModalOption = { key: 'item', label: 'Item', values: listed(entries.map((entry) => entry.value)) };

  const chosen = entries.find((entry) => entry.value === answers.item);
  if (!chosen) return [item];

  const applicable = verbsFor(chosen, state, registry);
  const verb: ModalOption = { key: 'verb', label: chosen.name, values: listed(applicable.map((each) => each.value)) };

  const taking = applicable.find((each) => each.value === answers.verb);
  if (!taking?.confirms(chosen)) return [item, verb];
  return [item, verb, { key: 'confirm', label: `${taking.value} ${chosen.name} for good?`, values: listed([CONFIRMED]) }];
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
