import { Direction, Hex, PlaneNode } from '../content/hex';
import { Item } from '../content/item';
import { Registry } from '../content/registry';
import { allocateNode, basePlane, fillSlot, isPlane, Plane, pointsSpent, repairPlane } from './clusterPlane';
import { createInstance, defineInstanceKind, instance, removeInstance } from './instances';
import { anId, aCopy, aCount, says, type Said } from './said';
import { skillLevel } from './skills';
import { GameState } from './state';

export const ITEM_INSTANCE = 'item';

export interface ItemInstance {
  experience: number;
  plane: Plane;
}

export type Refusal = { ok: false; refused: Said };
export type Growth = { ok: true; instance: string } | Refusal;
export type Destruction = { ok: true; item: string } | Refusal;

const refused = (reason: Said): Refusal => ({ ok: false, refused: reason });

export function isItemInstance(payload: unknown): payload is ItemInstance {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const held = payload as Record<string, unknown>;
  return typeof held.experience === 'number' && Number.isInteger(held.experience) && held.experience >= 0 && isPlane(held.plane);
}

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
  return grown(state, named(state, id))?.payload;
}

export function itemTemplate(state: GameState, id: string): string {
  const copy = named(state, id);
  return grown(state, copy)?.template ?? copy;
}

export function isGrownCopy(state: GameState, id: string): boolean {
  return grown(state, named(state, id)) !== undefined;
}

const WORN = 'worn:';

export function wornCopy(slot: string): string {
  return `${WORN}${slot}`;
}

export function wornCopySlot(id: string): string | undefined {
  return id.startsWith(WORN) ? id.slice(WORN.length) : undefined;
}

function named(state: GameState, id: string): string {
  const slot = wornCopySlot(id);
  if (slot === undefined) return id;
  return state.equipped[slot] ?? id;
}

export function wornIn(state: GameState, id: string): string | undefined {
  const copy = named(state, id);
  return Object.entries(state.equipped).find(([, worn]) => worn === copy)?.[0];
}

export function carriesItem(state: GameState, id: string): boolean {
  if (grown(state, id) !== undefined) return wornIn(state, id) === undefined;
  return copiesOf(state, id).stack > 0;
}

export interface Copies {
  stack: number;
  grown: number;
  worn: number;
}

const NO_COPIES: Copies = { stack: 0, grown: 0, worn: 0 };

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

export function carriedCount(state: GameState, itemId: string): number {
  const { stack, grown } = copiesOf(state, itemId);
  return stack + grown;
}

export function heldCount(state: GameState, itemId: string): number {
  const { stack, grown, worn } = copiesOf(state, itemId);
  return stack + grown + worn;
}

export function stockItem(state: GameState, itemId: string, delta: number): number {
  const before = copiesOf(state, itemId).stack;
  const after = Math.max(0, before + delta);
  state.inventory[itemId] = after;
  return after - before;
}

export function grownItems(state: GameState): Record<string, string> {
  const copies: Record<string, string> = {};
  for (const [id, row] of Object.entries(state.instances.byId)) {
    if (row.kind === ITEM_INSTANCE) copies[id] = row.template;
  }
  return copies;
}

function takeOff(state: GameState, id: string): void {
  const slot = wornIn(state, id);
  if (slot !== undefined) delete state.equipped[slot];
}

type StackCopy = { readonly from: 'stack' } | { readonly from: 'slot'; readonly slot: string };

function stackCopy(state: GameState, id: string): StackCopy | undefined {
  if (copiesOf(state, id).stack > 0) return { from: 'stack' };
  const slot = wornIn(state, id);
  return slot === undefined ? undefined : { from: 'slot', slot };
}

export function hasStackCopy(state: GameState, id: string): boolean {
  return stackCopy(state, id) !== undefined;
}

export function destroyItem(state: GameState, id: string): Destruction {
  const copy = named(state, id);
  const standing = grown(state, copy);
  if (standing) {
    removeInstance(state, copy);
    takeOff(state, copy);
    return { ok: true, item: standing.template };
  }
  const source = stackCopy(state, id);
  if (!source) return refused(says('engine.growth.no-copy', { item: anId(id) }));
  const template = itemTemplate(state, id);
  if (source.from === 'slot') delete state.equipped[source.slot];
  else {
    stockItem(state, template, -1);
    if (state.inventory[template] === 0) delete state.inventory[template];
  }
  return { ok: true, item: template };
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
  change(payload: ItemInstance, item: Item): Said | undefined;
}

const held = (state: GameState, itemId: string): number => copiesOf(state, itemId).stack;

const take = (state: GameState, itemId: string): void => void stockItem(state, itemId, -1);

export function growItem(state: GameState, registry: Registry, growing: Growing): Growth {
  const { target, consumes } = growing;
  const copy = named(state, target);
  const standing = grown(state, copy);
  const template = itemTemplate(state, target);
  const item = registry.items.get(template);
  if (!item) return refused(says('engine.growth.unknown-item', { item: anId(target) }));

  const plane = basePlane(item);
  if (!plane) return refused(says('engine.growth.not-a-base', { item: anId(template) }));

  const source = standing ? undefined : stackCopy(state, target);
  if (!standing && !source) return refused(says('engine.growth.no-copy', { item: anId(template) }));
  if (consumes !== undefined && held(state, consumes) < (source?.from === 'stack' && consumes === template ? 2 : 1)) return refused(says('engine.growth.no-copy', { item: anId(consumes) }));

  const payload = standing?.payload ?? { experience: 0, plane };
  const problem = growing.change(payload, item);
  if (problem) return refused(problem);

  if (consumes !== undefined) take(state, consumes);
  if (!source) return { ok: true, instance: copy };
  if (source.from === 'stack') take(state, template);
  const minted = createInstance(state, ITEM_INSTANCE, template, payload);
  if (source.from === 'slot') state.equipped[source.slot] = minted;
  return { ok: true, instance: minted };
}

export function feedItem(state: GameState, registry: Registry, target: string, food: string): Growth {
  const experience = registry.items.get(food)?.itemExperience;
  if (experience === undefined) return refused(says('engine.growth.no-experience', { item: anId(food) }));
  return growItem(state, registry, {
    target,
    consumes: food,
    change: (payload, item) => {
      if (itemLevel(payload, item) >= item.maxLevel) return says('engine.growth.max-level', { item: aCopy('item', item.id), level: aCount(item.maxLevel) });
      payload.experience += experience;
      return undefined;
    },
  });
}

export function slotJewel(state: GameState, registry: Registry, target: string, jewelItem: string, hex: Hex, direction: Direction): Growth {
  const jewel = registry.items.get(jewelItem)?.clusterJewel;
  if (jewel === undefined) return refused(says('engine.growth.not-a-jewel', { item: anId(jewelItem) }));
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
