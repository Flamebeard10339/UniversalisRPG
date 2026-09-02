import type { ModalChoice, ModalOption } from './modalOption';
import { isBase, Item } from '../content/sections/item';
import type { EngineKey } from '../content/locale';
import { Registry } from '../content/registry';
import { equip, unequip, wearable } from './equipment';
import { Answer, Localized, itemExamine, Localizer, localizerOf } from './localized';
import { destroyItem, itemTemplate } from './itemInstance';
import { carriedEntries, carriedFrame, type CarriedEntry } from './carried';
import { planeFrame } from './planeScreen';
import { GameState, type ModalAnswers, type ModalFrame } from './state';

export const LEAVE: Answer = 'close';
const LEAVE_SHOWN: EngineKey = 'engine.carried.close';

export const CONFIRMED: Answer = 'go-ahead';
const CONFIRMED_SHOWN: EngineKey = 'engine.carried.confirmed';

interface CarriedVerb {
  readonly value: Answer;
  readonly shown: EngineKey;
  applies(item: Item | undefined, entry: CarriedEntry, state: GameState, registry: Registry): boolean;
  confirms(entry: CarriedEntry): boolean;
  take(entry: CarriedEntry, state: GameState, registry: Registry): ModalFrame | null;
}

const VERBS: readonly CarriedVerb[] = [
  {
    value: 'grow',
    shown: 'engine.carried.verb.grow',
    applies: (item) => item !== undefined && isBase(item),
    confirms: () => false,
    take: (entry) => planeFrame(entry.id),
  },
  {
    value: 'equip',
    shown: 'engine.carried.verb.equip',
    applies: (item, entry, state, registry) => item?.slot !== undefined && entry.worn === undefined && wearable(state, registry, entry.id),
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
    take: (entry, state, registry) => {
      if (entry.worn) unequip(state, registry, entry.worn.slot);
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

function verbsFor(entry: CarriedEntry, state: GameState, registry: Registry): readonly CarriedVerb[] {
  const item = registry.items.get(itemTemplate(state, entry.id));
  return VERBS.filter((verb) => verb.applies(item, entry, state, registry));
}

export const verbsOffered = (entry: CarriedEntry, state: GameState, registry: Registry): Answer[] => verbsFor(entry, state, registry).map((verb) => verb.value);

export const socketsInto = (entry: CarriedEntry, state: GameState, registry: Registry): boolean =>
  registry.items.get(itemTemplate(state, entry.id))?.clusterJewel !== undefined;

function heading(localizer: Localizer, entry: CarriedEntry, state: GameState): Localized {
  const examine = itemExamine(localizer, itemTemplate(state, entry.id));
  return examine === undefined ? entry.name : localizer.engine('engine.examine.beside', { subject: entry.name, examine });
}

function listed(localizer: Localizer, choices: readonly ModalChoice[]): readonly ModalChoice[] {
  return [...choices, { value: LEAVE, shown: localizer.engine(LEAVE_SHOWN) }];
}

export function carriedOptions(answers: ModalAnswers, state: GameState, registry: Registry): ModalOption[] {
  const entries = carriedEntries(state, registry);
  const localizer = localizerOf(registry, state);
  const item: ModalOption = { key: 'item', label: localizer.engine('engine.modal.item'), values: listed(localizer, entries.map((entry) => ({ value: entry.id, shown: entry.shown }))) };

  const chosen = entries.find((entry) => entry.id === answers.item);
  if (!chosen) return [item];

  const applicable = verbsFor(chosen, state, registry);
  const verb: ModalOption = { key: 'verb', label: heading(localizer, chosen, state), values: listed(localizer, applicable.map((each) => ({ value: each.value, shown: localizer.engine(each.shown) }))) };

  const taking = applicable.find((each) => each.value === answers.verb);
  if (!taking?.confirms(chosen)) return [item, verb];
  return [item, verb, { key: 'confirm', label: localizer.engine('engine.modal.confirm', { verb: localizer.engine(taking.shown), item: chosen.name }), values: listed(localizer, [{ value: CONFIRMED, shown: localizer.engine(CONFIRMED_SHOWN) }]) }];
}

export function carriedSubmit(answers: ModalAnswers, state: GameState, registry: Registry): ModalFrame | null {
  if (answers.item === LEAVE || answers.verb === LEAVE || answers.confirm === LEAVE) return null;

  const chosen = carriedEntries(state, registry).find((entry) => entry.id === answers.item);
  if (!chosen) return null;

  const taking = verbsFor(chosen, state, registry).find((each) => each.value === answers.verb);
  if (!taking) return carriedFrame({ item: chosen.id });
  if (taking.confirms(chosen) && answers.confirm === undefined) return carriedFrame({ item: chosen.id, verb: taking.value });
  return taking.take(chosen, state, registry);
}
