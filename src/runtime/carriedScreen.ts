import { isBase, Item } from '../content/item';
import { Registry } from '../content/registry';
import { equip } from './equipment';
import { carriedItems, destroyItem, grownItems, itemTemplate } from './itemInstance';
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
  // What a verb names this by: an item id for a stack, the minted id for one
  // grown copy.
  readonly id: string;
  // What the screen publishes and an answer comes back as.
  readonly value: string;
  readonly grown: boolean;
}

interface CarriedVerb {
  readonly value: string;
  applies(item: Item | undefined): boolean;
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
    applies: (item) => item?.slot !== undefined,
    confirms: () => false,
    take: (entry, state, registry) => {
      equip(state, registry, entry.id);
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

function titleOf(template: string, registry: Registry): string {
  return registry.items.get(template)?.title ?? template;
}

// Two items may be titled alike, and an answer is matched back by the value it
// was published as, so a repeated value would resolve to whichever came first.
function distinct(entries: CarriedEntry[]): CarriedEntry[] {
  const times = new Map<string, number>();
  for (const entry of entries) times.set(entry.value, (times.get(entry.value) ?? 0) + 1);
  return entries.map((entry) => (times.get(entry.value)! > 1 ? { ...entry, value: `${entry.value} (${entry.id})` } : entry));
}

// Stacks by title and count, then each grown copy under the name minting gave
// it, because a grown copy is not interchangeable with its stack.
export function carriedEntries(state: GameState, registry: Registry): CarriedEntry[] {
  const entries: CarriedEntry[] = [];
  for (const [template, { stack }] of carriedItems(state)) {
    if (stack > 0) entries.push({ id: template, value: `${titleOf(template, registry)} x${stack}`, grown: false });
  }
  for (const [id, template] of Object.entries(grownItems(state))) {
    entries.push({ id, value: `${titleOf(template, registry)} #${id}`, grown: true });
  }
  return distinct(entries);
}

function verbsFor(entry: CarriedEntry, state: GameState, registry: Registry): readonly CarriedVerb[] {
  const item = registry.items.get(itemTemplate(state, entry.id));
  return VERBS.filter((verb) => verb.applies(item));
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
  const verb: ModalOption = { key: 'verb', label: chosen.value, values: listed(applicable.map((each) => each.value)) };

  const taking = applicable.find((each) => each.value === answers.verb);
  if (!taking?.confirms(chosen)) return [item, verb];
  return [item, verb, { key: 'confirm', label: `${taking.value} ${chosen.value} for good?`, values: listed([CONFIRMED]) }];
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
