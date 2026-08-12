import { Direction } from '../content/hex';
import { Item } from '../content/item';
import { Registry } from '../content/registry';
import { allocateNode, fillSlot, Hex, isPlane, originPlane, Plane, PlaneNode, pointsSpent, repairPlane } from './clusterPlane';
import { createInstance, defineInstanceKind, instance } from './instances';
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

export type Growth = { ok: true; instance: string } | { ok: false; refused: string };

const refused = (reason: string): Growth => ({ ok: false, refused: reason });

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

function held(state: GameState, itemId: string): number {
  return state.inventory[itemId] ?? 0;
}

function take(state: GameState, itemId: string): void {
  state.inventory[itemId] = held(state, itemId) - 1;
}

// The one door onto a plane, and the whole of c11's laziness. A target names
// either a live instance or a stack; a stack is minted only once the change
// has succeeded, so a refused verb leaves the stack whole and no instance
// behind. Everything a caller may do to a plane comes through here, which is
// why no other file needs to know that instancing happens at all.
export function growItem(state: GameState, registry: Registry, growing: Growing): Growth {
  const { target, consumes } = growing;
  const standing = grown(state, target);
  const template = standing?.template ?? target;
  const item = registry.items.get(template);
  if (!item) return refused(`there is no item or item instance called ${target}`);

  const minting = standing === undefined;
  if (minting && held(state, template) < 1) return refused(`you carry no ${template}`);
  if (consumes !== undefined && held(state, consumes) < (minting && consumes === template ? 2 : 1)) return refused(`you carry no ${consumes}`);

  const payload = standing?.payload ?? { experience: 0, plane: originPlane(item.clusterJewel ?? null) };
  const problem = growing.change(payload, item);
  if (problem) return refused(problem);

  if (consumes !== undefined) take(state, consumes);
  if (!minting) return { ok: true, instance: target };
  take(state, template);
  return { ok: true, instance: createInstance(state, ITEM_INSTANCE, template, payload) };
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
