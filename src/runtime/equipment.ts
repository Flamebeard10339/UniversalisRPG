import { RuntimeError } from './error';
import { GameState } from './state';
import { Registry } from '../content/registry';
import { carriesItem, isGrownCopy, itemTemplate, packFull, roomToPack, stockItem } from './itemInstance';

function carriedBy(state: GameState, registry: Registry, id: string, delta: number): void {
  if (!isGrownCopy(state, id)) stockItem(state, registry, id, delta);
}

// Putting something on takes it out of the pack, so it is never refused. Taking something off puts
// it back in, which is an arrival like any other and wants a row the pack may not have — including
// the swap an equip does when the slot is already filled, which is why this answers whether it
// happened rather than assuming it did.
export function equip(state: GameState, registry: Registry, itemId: string): boolean {
  const item = registry.items.get(itemTemplate(state, itemId));
  if (!item) throw new RuntimeError(`equip: unknown item: ${itemId}`);
  if (!item.slot) throw new RuntimeError(`equip: item ${itemId} has no slot`);
  if (!carriesItem(state, itemId)) throw new RuntimeError(`equip: player does not carry item ${itemId}`);
  if (state.equipped[item.slot] !== undefined && !unequip(state, registry, item.slot)) return false;
  carriedBy(state, registry, itemId, -1);
  state.equipped[item.slot] = itemId;
  return true;
}

export function unequip(state: GameState, registry: Registry, slot: string): boolean {
  const worn = state.equipped[slot];
  if (worn === undefined) throw new RuntimeError(`unequip: nothing is equipped in slot ${slot}`);
  if (!roomToPack(state, registry, worn)) {
    packFull(state, registry, worn);
    return false;
  }
  delete state.equipped[slot];
  carriedBy(state, registry, worn, 1);
  return true;
}
