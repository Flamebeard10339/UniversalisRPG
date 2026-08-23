import { RuntimeError } from './error';
import { GameState } from './state';
import { Registry } from '../content/registry';
import { carriesItem, handOver, HandOver, isGrownCopy, itemTemplate, packFull, receiveItem, roomToPack } from './itemInstance';

// A grown copy is a row of its own and is worn out of that row, so only a plain one moves the stack.
function outOfPack(state: GameState, id: string): boolean {
  if (isGrownCopy(state, id)) return true;
  const parting = HandOver.asked(state, id, 1);
  if (!parting) return false;
  handOver(state, parting);
  return true;
}

function intoPack(state: GameState, registry: Registry, id: string): void {
  if (!isGrownCopy(state, id)) receiveItem(state, registry, id, 1);
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
  if (!outOfPack(state, itemId)) return false;
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
  intoPack(state, registry, worn);
  return true;
}
