// One row is one slot. A stack is a row however deep it gets, a grown copy is a thing in its own
// right and so is a row of its own, and what the player is wearing is on them rather than in the
// pack. `packRows` is what fills this list; everything that asks how full the pack is, and
// everything that draws it, reads that.
export type PackRow = { readonly kind: 'stack'; readonly template: string; readonly count: number } | { readonly kind: 'grown'; readonly id: string; readonly template: string };

// What one pack row answers to, which is the string the inventory screen already offers it under: a
// stack answers to its item, and a grown copy answers to itself.
export const packKey = (row: PackRow): string => (row.kind === 'stack' ? row.template : row.id);

// The pack as the player has arranged it. A key the order names that the pack no longer holds is not
// there to draw, and a row the order has never heard of falls in behind the ones it has, in the order
// the pack itself gives them — so a pack nobody has ever rearranged reads exactly as it did before
// anyone could, and a first arrival lands at the end rather than nowhere.
export function inPlayerOrder(rows: readonly PackRow[], order: readonly string[]): PackRow[] {
  const held = new Map(rows.map((row) => [packKey(row), row]));
  const named = order.flatMap((key) => {
    const row = held.get(key);
    if (!row) return [];
    held.delete(key);
    return [row];
  });
  return [...named, ...held.values()];
}

// Two rows changing places, answered with the whole pack's keys as they then read rather than with
// the pair that moved: what a save carries has to say where everything is, not how it got there. A
// key the pack does not hold moves nothing, and the order still comes back settled against the pack.
export function swappedOrder(rows: readonly PackRow[], order: readonly string[], one: string, other: string): string[] {
  const keys = inPlayerOrder(rows, order).map(packKey);
  const at = keys.indexOf(one);
  const to = keys.indexOf(other);
  if (at < 0 || to < 0) return keys;
  keys[at] = other;
  keys[to] = one;
  return keys;
}
