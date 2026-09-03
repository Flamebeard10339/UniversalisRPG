import { Direction, Hex, PlaneNode } from '../content/hex';
import { isBase, Item } from '../content/sections/item';
import { Registry } from '../content/registry';
import { sampleCount } from '../grammar/range';
import { allocateNode, basePlane, fillSlot, isPlane, Plane, pointsSpent, repairPlane, unallocateNode } from './clusterPlane';
import { createInstance, defineInstanceKind, instance, removeInstance } from './instances';
import { Localized, localizerOf } from './localized';
import { inPlayerOrder, type PackRow } from './packOrder';
import { isRoll, nextRandom } from './rng';
import { anId, says, type Said } from './said';
import { inventorySlots } from './tuning';
import { createGameState, GameState } from './state';

export const ITEM_INSTANCE = 'item';

export interface ItemInstance {
  roll: number;
  plane: Plane;
}

export type Refusal = { ok: false; refused: Said };
export type Growth = { ok: true; instance: string } | Refusal;
export type Destruction = { ok: true; item: string } | Refusal;

const refused = (reason: Said): Refusal => ({ ok: false, refused: reason });

export function isItemInstance(payload: unknown): payload is ItemInstance {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const held = payload as Record<string, unknown>;
  return isRoll(held.roll) && isPlane(held.plane);
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
  for (const template of Object.values(grownItems(state))) entry(template).grown += 1;
  for (const worn of Object.values(state.equipped)) {
    if (grown(state, worn) === undefined) entry(itemTemplate(state, worn)).worn += 1;
  }
  return items;
}

export function copiesOf(state: GameState, itemId: string): Copies {
  return itemCopies(state).get(itemId) ?? NO_COPIES;
}

export function spendable(copies: Copies): number {
  return copies.stack + copies.worn;
}

export function spendableCount(state: GameState, itemId: string): number {
  return spendable(copiesOf(state, itemId));
}

export function heldCount(state: GameState, itemId: string): number {
  const { stack, grown, worn } = copiesOf(state, itemId);
  return stack + grown + worn;
}

export function copyToWear(state: GameState, written: string): string {
  if (carriesItem(state, written)) return written;
  return packRows(state).flatMap((row) => (row.kind === 'grown' && row.template === written ? [row.id] : []))[0] ?? written;
}

export function packRows(state: GameState): PackRow[] {
  const rows: PackRow[] = [];
  for (const [template, { stack }] of itemCopies(state)) {
    if (stack > 0) rows.push({ kind: 'stack', template, count: stack });
  }
  for (const [id, template] of Object.entries(grownItems(state))) {
    if (wornIn(state, id) === undefined) rows.push({ kind: 'grown', id, template });
  }
  return inPlayerOrder(rows, state.packOrder);
}

export function packedCount(state: GameState, itemId: string): number {
  return packRows(state).reduce((total, row) => (row.template === itemId ? total + (row.kind === 'stack' ? row.count : 1) : total), 0);
}

export function packHasRoom(state: GameState, registry: Registry): boolean {
  const slots = inventorySlots(registry);
  return slots === 0 || packRows(state).length < slots;
}

export function roomToPack(state: GameState, registry: Registry, id: string): boolean {
  if (!isGrownCopy(state, id) && copiesOf(state, id).stack > 0) return true;
  return packHasRoom(state, registry);
}

export function packFull(state: GameState, registry: Registry, itemId: string): Localized {
  const say = localizerOf(registry, state);
  const refused = say.engine('engine.pack.full', { item: say.title('item', itemTemplate(state, itemId)) });
  state.log.push(refused);
  return refused;
}

function writeStack(state: GameState, itemId: string, delta: number): number {
  const before = copiesOf(state, itemId).stack;
  const after = Math.max(0, before + delta);
  state.inventory[itemId] = after;
  return after - before;
}

export function receiveItem(state: GameState, registry: Registry, itemId: string, count: number): number {
  if (count <= 0) return 0;
  const item = registry.items.get(itemId);
  if (item && isBase(item)) {
    let arrived = 0;
    while (arrived < count) {
      if (!packHasRoom(state, registry)) break;
      createInstance(state, ITEM_INSTANCE, itemId, mintBase(state, item));
      arrived += 1;
    }
    if (arrived < count) packFull(state, registry, itemId);
    return arrived;
  }
  if (copiesOf(state, itemId).stack === 0 && !packHasRoom(state, registry)) {
    packFull(state, registry, itemId);
    return 0;
  }
  return writeStack(state, itemId, count);
}

export function mintBase(state: GameState, item: Item): ItemInstance {
  return { roll: nextRandom(state), plane: basePlane(item, nextRandom(state))! };
}

export class HandOver {
  private constructor(private readonly parting: { readonly item: string; readonly count: number }) {}

  static asked(state: GameState, itemId: string, count: number): HandOver | undefined {
    if (count <= 0 || spendableCount(state, itemId) < count) return undefined;
    return new HandOver({ item: itemId, count });
  }

  static asMuchAs(state: GameState, itemId: string, count: number): HandOver | undefined {
    return HandOver.asked(state, itemId, Math.min(count, spendableCount(state, itemId)));
  }

  get item(): string {
    return this.parting.item;
  }

  get count(): number {
    return this.parting.count;
  }
}

export function handOver(state: GameState, parting: HandOver): number {
  let gone = -writeStack(state, parting.item, -parting.count);
  while (gone < parting.count && destroyItem(state, parting.item).ok) gone += 1;
  return gone;
}

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

export function stripHoldings(state: GameState): number {
  let gone = 0;
  for (const row of packRows(state)) {
    if (row.kind === 'grown') {
      if (destroyItem(state, row.id).ok) gone += 1;
      continue;
    }
    const parting = HandOver.asked(state, row.template, row.count);
    if (!parting) continue;
    gone += handOver(state, parting);
    delete state.inventory[row.template];
  }
  for (const worn of [...Object.values(state.equipped)]) {
    if (destroyItem(state, worn).ok) gone += 1;
  }
  return gone;
}

export function itemLevel(payload: ItemInstance, item: Item): number {
  return item.itemLevel === undefined ? 0 : sampleCount(item.itemLevel, payload.roll);
}

export function pointsRemaining(payload: ItemInstance, item: Item): number {
  return itemLevel(payload, item) - pointsSpent(payload.plane);
}

interface Growing {
  target: string;
  consumes?: string;
  change(payload: ItemInstance, item: Item): Said | undefined;
}

const take = (state: GameState, itemId: string): void => {
  const parting = HandOver.asked(state, itemId, 1);
  if (parting) handOver(state, parting);
};

export function growItem(state: GameState, registry: Registry, growing: Growing): Growth {
  const { target, consumes } = growing;
  const copy = named(state, target);
  const standing = grown(state, copy);
  if (!standing) return refused(says('engine.growth.not-a-base', { item: anId(target) }));

  const item = registry.items.get(standing.template);
  if (!item) return refused(says('engine.growth.unknown-item', { item: anId(target) }));
  if (consumes !== undefined && spendableCount(state, consumes) < 1) return refused(says('engine.growth.no-copy', { item: anId(consumes) }));

  const problem = growing.change(standing.payload, item);
  if (problem) return refused(problem);

  if (consumes !== undefined) take(state, consumes);
  return { ok: true, instance: copy };
}

export function slotJewel(state: GameState, registry: Registry, target: string, jewelItem: string, hex: Hex, direction: Direction): Growth {
  const jewel = registry.items.get(jewelItem)?.clusterJewel;
  if (jewel === undefined) return refused(says('engine.growth.not-a-jewel', { item: anId(jewelItem) }));
  return growItem(state, registry, {
    target,
    consumes: jewelItem,
    change: (payload) => fillSlot(registry, payload.plane, hex, direction, jewel, state),
  });
}

export function allocate(state: GameState, registry: Registry, target: string, node: PlaneNode): Growth {
  return growItem(state, registry, {
    target,
    change: (payload, item) => allocateNode(registry, payload.plane, node, pointsRemaining(payload, item)),
  });
}

export function unallocate(state: GameState, registry: Registry, target: string, node: PlaneNode): Growth {
  return growItem(state, registry, {
    target,
    change: (payload) => unallocateNode(registry, payload.plane, node),
  });
}

export const NOTHING_HELD = heldSignature(createGameState());
