import { Registry } from '../content/registry';
import type { Place } from '../content/sections/slot';
import { carriedName } from './carriedName';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { isGrownCopy, itemTemplate, packRows, wornCopy } from './itemInstance';
import { GameState, type ModalAnswers, type ModalFrame } from './state';

export interface CarriedEntry {
  readonly id: Answer;
  readonly name: Localized;
  readonly count: number;
  readonly shown: Localized;
  readonly grown: boolean;
  readonly worn?: { readonly slot: Answer; readonly title: Localized };
}

export interface WornRow {
  readonly slot: Answer;
  readonly title: Localized;
  readonly item: Answer | null;
  readonly name: Localized | null;
  readonly at?: Place;
}

export type CarriedFrame = Extract<ModalFrame, { name: 'carried-items' }>;

export function carriedFrame(answers: ModalAnswers = {}): CarriedFrame {
  return { name: 'carried-items', answers };
}

function nameOf(template: string, localizer: Localizer, copy: string | null): Localized {
  return carriedName(localizer, 'item', template, copy);
}

// The pack, row for row as the slot count reads it, and then what the player has on. A row here and
// a slot there are the same thing by construction: both are `packRows`.
export function carriedEntries(state: GameState, registry: Registry): CarriedEntry[] {
  const localizer = localizerOf(registry, state);
  const entries: CarriedEntry[] = [];
  for (const row of packRows(state)) {
    if (row.kind === 'stack') {
      const name = nameOf(row.template, localizer, null);
      entries.push({ id: row.template, name, count: row.count, shown: localizer.engine('engine.carried.stack', { item: name, count: row.count }), grown: false });
    } else {
      entries.push({ id: row.id, name: nameOf(row.template, localizer, row.id), count: 1, shown: nameOf(row.template, localizer, row.id), grown: true });
    }
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
  const declared = [...registry.slots.keys()];
  const slots = [...declared, ...Object.keys(state.equipped).filter((slot) => !declared.includes(slot))];
  return slots.map((slot) => {
    const id: string | undefined = state.equipped[slot];
    const at = registry.slots.get(slot)?.at;
    return {
      slot,
      title: localizer.title('slot', slot),
      item: id ?? null,
      name: id === undefined ? null : nameOf(itemTemplate(state, id), localizer, isGrownCopy(state, id) ? id : null),
      ...(at === undefined ? {} : { at }),
    };
  });
}
