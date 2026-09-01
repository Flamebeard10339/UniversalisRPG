import { RuntimeError } from './error';
import { initResources } from './effects';
import { GameState } from './state';
import { Registry } from '../content/registry';
import { evaluateCondition } from './conditions';
import { Localized, localizerOf } from './localized';
import { carriesItem, handOver, HandOver, isGrownCopy, itemTemplate, packFull, receiveItem, roomToPack } from './itemInstance';

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

export function wearable(state: GameState, registry: Registry, itemId: string): boolean {
  const item = registry.items.get(itemTemplate(state, itemId));
  if (item?.slot === undefined) return false;
  return item.requires === undefined || evaluateCondition(item.requires, state, registry);
}

export function tooGreenToWear(state: GameState, registry: Registry, itemId: string): Localized {
  const say = localizerOf(registry, state);
  const refused = say.engine('engine.equip.requires', { item: say.title('item', itemTemplate(state, itemId)) });
  state.log.push(refused);
  return refused;
}

export function equip(state: GameState, registry: Registry, itemId: string): Localized | undefined {
  const item = registry.items.get(itemTemplate(state, itemId));
  if (!item) throw new RuntimeError(`equip: unknown item: ${itemId}`);
  if (!item.slot) throw new RuntimeError(`equip: item ${itemId} has no slot`);
  if (!carriesItem(state, itemId)) throw new RuntimeError(`equip: player does not carry item ${itemId}`);
  if (!wearable(state, registry, itemId)) return tooGreenToWear(state, registry, itemId);
  if (state.equipped[item.slot] !== undefined) {
    const inTheWay = unequip(state, registry, item.slot);
    if (inTheWay) return inTheWay;
  }
  if (!outOfPack(state, itemId)) throw new RuntimeError(`equip: ${itemId} is carried and could not be parted with`);
  state.equipped[item.slot] = itemId;
  initResources(state, registry);
  return undefined;
}

export function unequip(state: GameState, registry: Registry, slot: string): Localized | undefined {
  const worn = state.equipped[slot];
  if (worn === undefined) throw new RuntimeError(`unequip: nothing is equipped in slot ${slot}`);
  if (!roomToPack(state, registry, worn)) return packFull(state, registry, worn);
  delete state.equipped[slot];
  intoPack(state, registry, worn);
  initResources(state, registry);
  return undefined;
}
