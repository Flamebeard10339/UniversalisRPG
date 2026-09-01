import { RuntimeError } from './error';
import { initResources } from './effects';
import { GameState } from './state';
import { Registry } from '../content/registry';
import { evaluateCondition } from './conditions';
import { Localized, localizerOf } from './localized';
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

// Whether this may be worn at all, which is the item's own `requires:` and nothing else. Every door
// that offers or takes the verb asks here, so a thing the player cannot wear is not offered and is
// not worn by a directive either.
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

// Both answer with what the player was told, the way `walkTo` does, and with nothing where it
// happened. Putting something on can be refused for being too green for it and for the pack having
// no row for whatever comes off to make space; taking something off, for that second reason alone.
// A caller that only wants to know whether it happened reads the answer as the falsy it is, and one
// that has to say why -- a route claiming `refused`, a screen -- has the sentence itself.
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
  // Worn gear is what grants a pool its ceiling, so putting a piece on is one of the two moments a
  // pool the player did not hold can arrive -- full, rather than at the nothing it stood at while
  // there was no ceiling over it.
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
