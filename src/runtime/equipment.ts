import { RuntimeError } from './error';
import { GameState } from './state';
import { Registry } from '../content/registry';
import { carriesItem, isGrownCopy, itemTemplate, stockItem } from './itemInstance';

function carriedBy(state: GameState, id: string, delta: number): void {
  if (!isGrownCopy(state, id)) stockItem(state, id, delta);
}

export function equip(state: GameState, registry: Registry, itemId: string): void {
  const item = registry.items.get(itemTemplate(state, itemId));
  if (!item) throw new RuntimeError(`equip: unknown item: ${itemId}`);
  if (!item.slot) throw new RuntimeError(`equip: item ${itemId} has no slot`);
  if (!carriesItem(state, itemId)) throw new RuntimeError(`equip: player does not carry item ${itemId}`);
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
