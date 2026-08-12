import { GameState, RuntimeError } from './state';
import { Registry } from '../content/registry';
import { carriesItem, itemTemplate } from './itemInstance';

// A slot holds whichever spelling was worn — a stack's item id or a grown copy's
// instance id — because that is what says which of the two the player put on.
// The slot itself is read off the item behind either.
export function equip(state: GameState, registry: Registry, itemId: string): void {
  const item = registry.items.get(itemTemplate(state, itemId));
  if (!item) throw new RuntimeError(`equip: unknown item: ${itemId}`);
  if (!item.slot) throw new RuntimeError(`equip: item ${itemId} has no slot`);
  if (!carriesItem(state, itemId)) throw new RuntimeError(`equip: player does not carry item ${itemId}`);
  state.equipped[item.slot] = itemId;
}

export function unequip(state: GameState, slot: string): void {
  if (state.equipped[slot] === undefined) throw new RuntimeError(`unequip: nothing is equipped in slot ${slot}`);
  delete state.equipped[slot];
}
