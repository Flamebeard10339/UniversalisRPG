import { localeLines } from './locale';
import { contentSectionMaps } from './sections';
import { mapOf } from './registry';
import { Registry } from './registry';

export const registryDiffMaps = (): readonly string[] => contentSectionMaps().map(([, map]) => map);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = stable((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

// What the caller expects the ids in `before` to have been written as by the time `after` was built. The default is that nothing was rewritten, which is what asks whether two registries are the same universe.
export type Rewriting = (text: string) => string;

const asWritten = (text: string): string => text;

// Applied before stabilising rather than after, because an id standing as an object key sorts under its new spelling: a rewrite over already-sorted text would leave the two sides ordered differently and every save that names a moved id would read as changed.
const rewritten = (rewrite: Rewriting, value: unknown): unknown => (rewrite === asWritten ? value : JSON.parse(rewrite(JSON.stringify(value ?? null))));

export const sameValue = (a: unknown, b: unknown, rewrite: Rewriting = asWritten): boolean =>
  JSON.stringify(stable(rewritten(rewrite, a))) === JSON.stringify(stable(b));

export function registryDiff(before: Registry, after: Registry, rewrite: Rewriting = asWritten): string[] {
  const lines: string[] = [];
  const left = localeLines(before.locales).map(rewrite);
  const right = new Set(localeLines(after.locales));
  for (const line of left) if (!right.has(line)) lines.push(`  locales: missing ${line}`);
  const held = new Set(left);
  for (const line of right) if (!held.has(line)) lines.push(`  locales: added ${line}`);
  for (const name of registryDiffMaps()) {
    const left = mapOf(before, name) as unknown as ReadonlyMap<string, unknown>;
    const right = mapOf(after, name) as unknown as ReadonlyMap<string, unknown>;
    const expected = new Set<string>();
    for (const key of [...left.keys()].sort()) {
      const under = rewrite(key);
      expected.add(under);
      if (!right.has(under)) lines.push(`  ${name}: missing ${under}`);
      else if (!sameValue(left.get(key), right.get(under), rewrite)) lines.push(`  ${name}: changed ${under}`);
    }
    for (const key of [...right.keys()].sort()) if (!expected.has(key)) lines.push(`  ${name}: added ${key}`);
  }
  return lines;
}
