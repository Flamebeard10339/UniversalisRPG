export type PackRow = { readonly kind: 'stack'; readonly template: string; readonly count: number } | { readonly kind: 'grown'; readonly id: string; readonly template: string };

export const packKey = (row: PackRow): string => (row.kind === 'stack' ? row.template : row.id);

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

export function swappedOrder(rows: readonly PackRow[], order: readonly string[], one: string, other: string): string[] {
  const keys = inPlayerOrder(rows, order).map(packKey);
  const at = keys.indexOf(one);
  const to = keys.indexOf(other);
  if (at < 0 || to < 0) return keys;
  keys[at] = other;
  keys[to] = one;
  return keys;
}
