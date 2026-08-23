import { Direction, Hex, PlaneNode } from '../content/hex';
import { Item } from '../content/sections/item';
import { Registry } from '../content/registry';
import { allocateNode, basePlane, fillSlot, isPlane, Plane, pointsSpent, repairPlane } from './clusterPlane';
import { createInstance, defineInstanceKind, instance, removeInstance } from './instances';
import { localizerOf } from './localized';
import { anId, aCopy, aCount, says, type Said } from './said';
import { inventorySlots } from './tuning';
import { skillLevel } from './skills';
import { createGameState, GameState } from './state';

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

// A grown copy is a thing in its own right and a worn one is on the player, so neither is a unit of the stack and neither can be handed over by name — which is the count `handOver` moves and the only count anything parting with an item may ask for.
export function spendable(copies: Copies): number {
  return copies.stack;
}

export function spendableCount(state: GameState, itemId: string): number {
  return spendable(copiesOf(state, itemId));
}

export function heldCount(state: GameState, itemId: string): number {
  const { stack, grown, worn } = copiesOf(state, itemId);
  return stack + grown + worn;
}

export type PackRow = { readonly kind: 'stack'; readonly template: string; readonly count: number } | { readonly kind: 'grown'; readonly id: string; readonly template: string };

// One row is one slot. A stack is a row however deep it gets, a grown copy is a thing in its own
// right and so is a row of its own, and what the player is wearing is on them rather than in the
// pack — which is why the sheet draws worn gear under a heading of its own and nothing here counts
// it. Everything that asks how full the pack is, and everything that draws it, reads this list.
export function packRows(state: GameState): PackRow[] {
  const rows: PackRow[] = [];
  for (const [template, { stack }] of itemCopies(state)) {
    if (stack > 0) rows.push({ kind: 'stack', template, count: stack });
  }
  for (const [id, template] of Object.entries(grownItems(state))) {
    if (wornIn(state, id) === undefined) rows.push({ kind: 'grown', id, template });
  }
  return rows;
}

// How many of one item are in the pack, read off the rows rather than counted again beside them, so
// whatever those rows come to hold is what this comes to count.
export function packedCount(state: GameState, itemId: string): number {
  return packRows(state).reduce((total, row) => (row.template === itemId ? total + (row.kind === 'stack' ? row.count : 1) : total), 0);
}

export function packHasRoom(state: GameState, registry: Registry): boolean {
  const slots = inventorySlots(registry);
  return slots === 0 || packRows(state).length < slots;
}

// Whether something landing in the pack has anywhere to land: a plain item joins the stack it
// already has and needs no row, and anything else — a first copy, or a grown one, which never joins
// a stack — needs one of its own.
export function roomToPack(state: GameState, registry: Registry, id: string): boolean {
  if (!isGrownCopy(state, id) && copiesOf(state, id).stack > 0) return true;
  return packHasRoom(state, registry);
}

export function packFull(state: GameState, registry: Registry, itemId: string): void {
  const say = localizerOf(registry, state);
  state.log.push(say.engine('engine.pack.full', { item: say.title('item', itemTemplate(state, itemId)) }));
}

// The one writer of the stack. Neither door below reaches it without having answered for what it
// moves, and no third door exists.
function writeStack(state: GameState, itemId: string, delta: number): number {
  const before = copiesOf(state, itemId).stack;
  const after = Math.max(0, before + delta);
  state.inventory[itemId] = after;
  return after - before;
}

// The one arrival, so the one place an arrival can be turned away: a stack that is already open
// takes any depth, and a first copy needs a row the pack may not have. Nothing is lost silently —
// what could not arrive is said in the log, and the caller reads the count that moved.
export function receiveItem(state: GameState, registry: Registry, itemId: string, count: number): number {
  if (count <= 0) return 0;
  if (copiesOf(state, itemId).stack === 0 && !packHasRoom(state, registry)) {
    packFull(state, registry, itemId);
    return 0;
  }
  return writeStack(state, itemId, count);
}

// What `canHandOver` answered with, and the only thing `handOver` takes. Its constructor is private
// to this class, so nothing anywhere else can make one and no departure from the pack can be
// written that has not first asked whether the player can part with what it names. That is the
// whole of the guarantee: the check is not a convention a caller has to remember, it is how the
// write is spelled.
export class HandOver {
  // What it holds is private and its constructor is private with it, which is the whole of why an
  // object of the same shape is not one and no caller can write itself the answer.
  private constructor(private readonly parting: { readonly item: string; readonly count: number }) {}

  static asked(state: GameState, itemId: string, count: number): HandOver | undefined {
    if (count <= 0 || spendableCount(state, itemId) < count) return undefined;
    return new HandOver({ item: itemId, count });
  }

  get item(): string {
    return this.parting.item;
  }

  get count(): number {
    return this.parting.count;
  }
}

export function handOver(state: GameState, parting: HandOver): number {
  return -writeStack(state, parting.item, -parting.count);
}

// What the player is holding, in the terms a change to it would have to move. Compared against what
// they were last told, it is what makes `inventory-changed` news exactly once.
export function heldSignature(state: GameState): string {
  const stacks = Object.entries(state.inventory).filter(([, count]) => count > 0);
  return JSON.stringify([stacks.sort(), Object.entries(grownItems(state)).sort(), Object.entries(state.equipped).sort()]);
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
    const parting = HandOver.asked(state, template, 1);
    if (!parting) return refused(says('engine.growth.no-copy', { item: anId(template) }));
    handOver(state, parting);
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

// Every caller below has already been refused if the copy is not there, so the answer is never
// undefined here — and it still has to be held before the stack can be written.
const take = (state: GameState, itemId: string): void => {
  const parting = HandOver.asked(state, itemId, 1);
  if (parting) handOver(state, parting);
};

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
  if (consumes !== undefined && spendableCount(state, consumes) < (source?.from === 'stack' && consumes === template ? 2 : 1)) return refused(says('engine.growth.no-copy', { item: anId(consumes) }));

  // Growing one of several leaves the stack standing and adds a copy beside it, which is a row the
  // pack may not have. Growing the last one, or the one being worn, moves a row rather than adding one.
  if (source?.from === 'stack' && copiesOf(state, template).stack > 1 && !packHasRoom(state, registry)) return refused(says('engine.pack.full', { item: aCopy('item', template) }));

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

// What a player who has been told nothing has been told: they carry nothing, which is where every
// state starts.
export const NOTHING_HELD = heldSignature(createGameState());
