import { GameState, RuntimeError } from './state';
import { Registry } from '../content/registry';

export function equip(state: GameState, registry: Registry, itemId: string): void {
  const item = registry.items.get(itemId);
  if (!item) throw new RuntimeError(`equip: unknown item: ${itemId}`);
  if (!item.slot) throw new RuntimeError(`equip: item ${itemId} has no slot`);
  if ((state.inventory[itemId] ?? 0) === 0) throw new RuntimeError(`equip: player does not carry item ${itemId}`);
  state.equipped[item.slot] = itemId;
}

export function unequip(state: GameState, slot: string): void {
  delete state.equipped[slot];
}
