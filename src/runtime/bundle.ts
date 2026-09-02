import { Registry } from '../content/registry';
import { createInstance, removeInstance } from './instances';
import { isItemInstance, ITEM_INSTANCE, itemTemplate, packHasRoom, packRows, receiveItem, wornIn } from './itemInstance';
import { Bundle, BundledCopy, GameState } from './state';

export const EMPTY_BUNDLE: Bundle = { stacks: {}, copies: [] };

export const bundleCount = (held: Bundle | undefined): number =>
  held === undefined ? 0 : Object.values(held.stacks).reduce((total, count) => total + count, 0) + held.copies.length;

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

export function isBundle(value: unknown): value is Bundle {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const held = value as Record<string, unknown>;
  if (typeof held.stacks !== 'object' || held.stacks === null || Array.isArray(held.stacks)) return false;
  if (!Object.values(held.stacks as Record<string, unknown>).every(isCount)) return false;
  if (!Array.isArray(held.copies)) return false;
  return held.copies.every((copy) => typeof copy === 'object' && copy !== null && typeof (copy as BundledCopy).template === 'string' && isItemInstance((copy as BundledCopy).payload));
}

export const bundleHeld = (state: GameState, name: string): Bundle => state.bundles[name] ?? EMPTY_BUNDLE;

const withStacks = (held: Bundle, template: string, count: number): Bundle => ({
  ...held,
  stacks: { ...held.stacks, [template]: (held.stacks[template] ?? 0) + count },
});

export function laidIn(state: GameState, name: string, held: Bundle): void {
  if (bundleCount(held) === 0) delete state.bundles[name];
  else state.bundles[name] = held;
}

export function bundleStack(state: GameState, name: string, template: string, count: number): void {
  if (count <= 0) return;
  laidIn(state, name, withStacks(bundleHeld(state, name), template, count));
}

export function bundleCopy(state: GameState, name: string, copy: BundledCopy): void {
  const held = bundleHeld(state, name);
  laidIn(state, name, { ...held, copies: [...held.copies, copy] });
}

export function packedCopies(state: GameState): { id: string; copy: BundledCopy }[] {
  const copies: { id: string; copy: BundledCopy }[] = [];
  for (const [id, row] of Object.entries(state.instances.byId)) {
    if (row.kind !== ITEM_INSTANCE || !isItemInstance(row.payload)) continue;
    copies.push({ id, copy: { template: row.template, payload: row.payload } });
  }
  return copies;
}

export function bundleWholePack(state: GameState, name: string): number {
  let moved = 0;
  for (const row of packRows(state)) {
    if (row.kind !== 'stack') continue;
    bundleStack(state, name, row.template, row.count);
    moved += row.count;
    delete state.inventory[row.template];
  }
  for (const { id, copy } of packedCopies(state)) {
    const slot = wornIn(state, id);
    if (slot !== undefined) delete state.equipped[slot];
    if (!removeInstance(state, id)) continue;
    bundleCopy(state, name, copy);
    moved += 1;
  }
  for (const [slot, worn] of Object.entries(state.equipped)) {
    const template = itemTemplate(state, worn);
    delete state.equipped[slot];
    bundleStack(state, name, template, 1);
    moved += 1;
  }
  return moved;
}

export function pourOut(state: GameState, registry: Registry, name: string): number {
  const held = bundleHeld(state, name);
  let moved = 0;
  const left: Record<string, number> = {};
  for (const [template, count] of Object.entries(held.stacks)) {
    const arrived = receiveItem(state, registry, template, count);
    moved += arrived;
    if (arrived < count) left[template] = count - arrived;
  }
  const stranded: BundledCopy[] = [];
  for (const copy of held.copies) {
    if (!packHasRoom(state, registry)) {
      stranded.push(copy);
      continue;
    }
    createInstance(state, ITEM_INSTANCE, copy.template, copy.payload);
    moved += 1;
  }
  laidIn(state, name, { stacks: left, copies: stranded });
  return moved;
}
