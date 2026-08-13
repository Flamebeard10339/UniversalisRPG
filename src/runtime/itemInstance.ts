import { Direction, Hex, PlaneNode } from '../content/hex';
import { Item } from '../content/item';
import { Registry } from '../content/registry';
import { allocateNode, basePlane, fillSlot, isPlane, Plane, pointsSpent, repairPlane } from './clusterPlane';
import { createInstance, defineInstanceKind, instance, removeInstance } from './instances';
import { skillLevel } from './skills';
import { GameState } from './state';

export const ITEM_INSTANCE = 'item';

// Everything one grown item records: how much experience it has been fed, and
// a plane. Every number the player earns is derived from the first and every
// payload from the second, so nothing here is a rolled or cached value.
export interface ItemInstance {
  experience: number;
  plane: Plane;
}

export type Refusal = { ok: false; refused: string };
export type Growth = { ok: true; instance: string } | Refusal;
export type Destruction = { ok: true; item: string } | Refusal;

const refused = (reason: string): Refusal => ({ ok: false, refused: reason });

export function isItemInstance(payload: unknown): payload is ItemInstance {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const held = payload as Record<string, unknown>;
  return typeof held.experience === 'number' && Number.isInteger(held.experience) && held.experience >= 0 && isPlane(held.plane);
}

// An item that has left its stack is the item, whether or not the plane still
// records anything: the substrate drops an empty payload rather than handing
// the copy back to its stack, and losing the player's sword to a content edit
// is worse than keeping an instance that has nothing to say.
defineInstanceKind<ItemInstance>(ITEM_INSTANCE, {
  templateLoaded: (registry, template) => registry.items.has(template),
  holds: isItemInstance,
  empty: () => false,
  repair: (payload, registry) => repairPlane(registry, payload.plane),
});

function grown(state: GameState, id: string): { template: string; payload: ItemInstance } | undefined {
  const found = instance(state, id);
  if (!found || found.kind !== ITEM_INSTANCE || !isItemInstance(found.payload)) return undefined;
  return { template: found.template, payload: found.payload };
}

export function itemInstance(state: GameState, id: string): ItemInstance | undefined {
  return grown(state, id)?.payload;
}

// A grown copy is spelled by its instance id and a stack by its item id. These
// two are the whole of the difference between the spellings, so a consumer asks
// which item stands behind an id and whether the player still has the one thing
// the id names, and never which spelling it was handed.
export function itemTemplate(state: GameState, id: string): string {
  return grown(state, id)?.template ?? id;
}

// Which spelling an id is: the minted id of a copy that has left its stack, or
// the item id a stack is spelled by. Asked wherever the two are moved
// differently, because only one of them is counted in a stack at all.
export function isGrownCopy(state: GameState, id: string): boolean {
  return grown(state, id) !== undefined;
}

// Which slot an id is worn in, where it is worn in one. A slot holds either
// spelling, so this is asked of the id in hand and not of the item behind it.
export function wornIn(state: GameState, id: string): string | undefined {
  return Object.entries(state.equipped).find(([, worn]) => worn === id)?.[0];
}

// Whether the one copy an id names is on the carried side of c21, which is not
// the same question as whether the player has it: what is worn is not carried,
// and unequipping is what puts it back.
export function carriesItem(state: GameState, id: string): boolean {
  if (wornIn(state, id) !== undefined) return false;
  return grown(state, id) !== undefined || copiesOf(state, id).stack > 0;
}

// The three places a copy of one item can be, and the whole of the asymmetry a
// plane rests on. `stack` is the only side a directive may spend; `grown` and
// `worn` are the copies that satisfy every gate and are never taken, so no cost,
// recipe or take: can destroy a plane or strip a slot. c21 is the line between
// the first two and the third: what is worn is not carried, and it is counted
// here so that one read answers both what the player carries and what they have.
export interface Copies {
  stack: number;
  grown: number;
  worn: number;
}

const NO_COPIES: Copies = { stack: 0, grown: 0, worn: 0 };

// The one read of where an item's copies are, so there is one answer to both
// questions. A stack the player is wearing one of was decremented when the slot
// was filled, so `stack` needs no subtraction here; a grown copy is in no stack,
// so which side it counts on is the slot's to say.
export function itemCopies(state: GameState): Map<string, Copies> {
  const items = new Map<string, Copies>();
  const entry = (id: string): Copies => {
    const existing = items.get(id);
    if (existing) return existing;
    const fresh = { stack: 0, grown: 0, worn: 0 };
    items.set(id, fresh);
    return fresh;
  };
  for (const [id, count] of Object.entries(state.inventory)) {
    if (count > 0) entry(id).stack = count;
  }
  for (const [id, template] of Object.entries(grownItems(state))) {
    if (wornIn(state, id) === undefined) entry(template).grown += 1;
  }
  for (const worn of Object.values(state.equipped)) entry(itemTemplate(state, worn)).worn += 1;
  return items;
}

export function copiesOf(state: GameState, itemId: string): Copies {
  return itemCopies(state).get(itemId) ?? NO_COPIES;
}

// How many the player carries, which is what an inventory row states: a stack of
// three with one worn reads two (c21).
export function carriedCount(state: GameState, itemId: string): number {
  const { stack, grown } = copiesOf(state, itemId);
  return stack + grown;
}

// How many the player has, however they have them, which is what a gate asks:
// `requires: has blade` is a question about the player and not about their
// inventory, so wearing the blade is not a way to stop having one.
export function heldCount(state: GameState, itemId: string): number {
  const { stack, grown, worn } = copiesOf(state, itemId);
  return stack + grown + worn;
}

// The one write, and the reason a grown copy survives every directive: it moves
// the stack and nothing else, floored at empty. Returns what actually moved.
export function stockItem(state: GameState, itemId: string, delta: number): number {
  const before = copiesOf(state, itemId).stack;
  const after = Math.max(0, before + delta);
  state.inventory[itemId] = after;
  return after - before;
}

// Every grown copy the player has, by the id it is named by, whether it is
// carried or worn. They are not in `inventory` — c11 took them out of their
// stacks — so a surface that lists what the player has reads both, and one that
// lists only what is carried asks `itemCopies` instead.
export function grownItems(state: GameState): Record<string, string> {
  const copies: Record<string, string> = {};
  for (const [id, row] of Object.entries(state.instances.byId)) {
    if (row.kind === ITEM_INSTANCE) copies[id] = row.template;
  }
  return copies;
}

// A slot may only name a copy that still exists, so a destroyed one is taken
// off. The id destroyed is the id in hand, so this names the slot holding it
// rather than re-deciding every slot from what is carried — a sweep on that
// question empties every occupied slot once carried and worn are disjoint.
function takeOff(state: GameState, id: string): void {
  const slot = wornIn(state, id);
  if (slot !== undefined) delete state.equipped[slot];
}

// Where the one copy a verb reaches comes from when the player names a stack
// item. c21 gives a stack copy two places to be, and the copies of one stack are
// interchangeable, so the item's name is the whole of what a verb needs to say:
// the stack answers while it has one, and the slot answers once it has not.
type StackCopy = { readonly from: 'stack' } | { readonly from: 'slot'; readonly slot: string };

function stackCopy(state: GameState, itemId: string): StackCopy | undefined {
  if (copiesOf(state, itemId).stack > 0) return { from: 'stack' };
  const slot = wornIn(state, itemId);
  return slot === undefined ? undefined : { from: 'slot', slot };
}

// c12: the one way an item leaves the player for good, and the only verb that
// ends a plane — a grown copy goes with everything recorded about it, and what
// its plane consumed does not come back. A stack loses one, and an emptied
// stack goes rather than staying on as a count of none. Nothing here puts the
// item down anywhere, and nothing here asks whether the player meant it.
export function destroyItem(state: GameState, id: string): Destruction {
  const standing = grown(state, id);
  if (standing) {
    removeInstance(state, id);
    takeOff(state, id);
    return { ok: true, item: standing.template };
  }
  const source = stackCopy(state, id);
  if (!source) return refused(`you carry no ${id}`);
  if (source.from === 'slot') delete state.equipped[source.slot];
  else {
    stockItem(state, id, -1);
    if (state.inventory[id] === 0) delete state.inventory[id];
  }
  return { ok: true, item: id };
}

export function itemLevel(payload: ItemInstance, item: Item): number {
  return Math.min(skillLevel(payload.experience), item.maxLevel);
}

export function pointsRemaining(payload: ItemInstance, item: Item): number {
  return itemLevel(payload, item) - pointsSpent(payload.plane);
}

interface Growing {
  target: string;
  consumes?: string;
  change(payload: ItemInstance, item: Item): string | undefined;
}

const held = (state: GameState, itemId: string): number => copiesOf(state, itemId).stack;

const take = (state: GameState, itemId: string): void => void stockItem(state, itemId, -1);

// The one door onto a plane, and the whole of c11's laziness. A target names
// either a live instance or a stack; a stack is minted only once the change
// has succeeded, so a refused verb leaves the stack whole and no instance
// behind. Everything a caller may do to a plane comes through here, which is
// why no other file needs to know that instancing happens at all.
// Minting out of a slot is what keeps growing what you wear one press away: the
// copy that left is the copy that was worn, so the slot names the minted id and
// the player wears what they grew.
export function growItem(state: GameState, registry: Registry, growing: Growing): Growth {
  const { target, consumes } = growing;
  const standing = grown(state, target);
  const template = standing?.template ?? target;
  const item = registry.items.get(template);
  if (!item) return refused(`there is no item or item instance called ${target}`);

  const plane = basePlane(item);
  if (!plane) return refused(`${template} is not a base: only an item you can wear has a plane to grow`);

  const source = standing ? undefined : stackCopy(state, template);
  if (!standing && !source) return refused(`you carry no ${template}`);
  if (consumes !== undefined && held(state, consumes) < (source?.from === 'stack' && consumes === template ? 2 : 1)) return refused(`you carry no ${consumes}`);

  const payload = standing?.payload ?? { experience: 0, plane };
  const problem = growing.change(payload, item);
  if (problem) return refused(problem);

  if (consumes !== undefined) take(state, consumes);
  if (!source) return { ok: true, instance: target };
  if (source.from === 'stack') take(state, template);
  const minted = createInstance(state, ITEM_INSTANCE, template, payload);
  if (source.from === 'slot') state.equipped[source.slot] = minted;
  return { ok: true, instance: minted };
}

// c12: the only event in the game that moves an item's experience.
export function feedItem(state: GameState, registry: Registry, target: string, food: string): Growth {
  const experience = registry.items.get(food)?.itemExperience;
  if (experience === undefined) return refused(`${food} grants no item experience`);
  return growItem(state, registry, {
    target,
    consumes: food,
    change: (payload, item) => {
      if (itemLevel(payload, item) >= item.maxLevel) return `${item.title} is already at level ${item.maxLevel}, which is its maximum`;
      payload.experience += experience;
      return undefined;
    },
  });
}

export function slotJewel(state: GameState, registry: Registry, target: string, jewelItem: string, hex: Hex, direction: Direction): Growth {
  const jewel = registry.items.get(jewelItem)?.clusterJewel;
  if (jewel === undefined) return refused(`${jewelItem} is not a cluster jewel`);
  return growItem(state, registry, {
    target,
    consumes: jewelItem,
    change: (payload) => fillSlot(registry, payload.plane, hex, direction, jewel),
  });
}

export function allocate(state: GameState, registry: Registry, target: string, node: PlaneNode): Growth {
  return growItem(state, registry, {
    target,
    change: (payload, item) => allocateNode(registry, payload.plane, node, pointsRemaining(payload, item)),
  });
}
