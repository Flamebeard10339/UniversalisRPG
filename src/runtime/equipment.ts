import { GameState, RuntimeError } from './state';
import { Registry } from '../content/registry';
import { carriesItem, isGrownCopy, itemTemplate, stockItem } from './itemInstance';

// A slot holds whichever spelling was worn — a stack's item id or a grown copy's
// instance id — because that is what says which of the two the player put on.
// The slot itself is read off the item behind either.

// c21: what the player carries and what they are wearing are disjoint, so the
// copy moves rather than being counted twice. A stack copy comes off the count
// as the slot fills and goes back on as it empties; a grown copy is in no stack,
// so the slot is the whole of where it is and there is nothing to move.
function carriedBy(state: GameState, id: string, delta: number): void {
  if (!isGrownCopy(state, id)) stockItem(state, id, delta);
}

export function equip(state: GameState, registry: Registry, itemId: string): void {
  const item = registry.items.get(itemTemplate(state, itemId));
  if (!item) throw new RuntimeError(`equip: unknown item: ${itemId}`);
  if (!item.slot) throw new RuntimeError(`equip: item ${itemId} has no slot`);
  if (!carriesItem(state, itemId)) throw new RuntimeError(`equip: player does not carry item ${itemId}`);
  // What the slot held is carried again rather than lost, which is what makes a
  // swap two moves of one copy each and not a copy destroyed by another arriving.
  if (state.equipped[item.slot] !== undefined) unequip(state, item.slot);
  carriedBy(state, itemId, -1);
  state.equipped[item.slot] = itemId;
}

export function unequip(state: GameState, slot: string): void {
  const worn = state.equipped[slot];
  if (worn === undefined) throw new RuntimeError(`unequip: nothing is equipped in slot ${slot}`);
  delete state.equipped[slot];
  carriedBy(state, worn, 1);
}
