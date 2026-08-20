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

export const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

export function registryDiff(before: Registry, after: Registry): string[] {
  const lines: string[] = [];
  const left = localeLines(before.locales);
  const right = new Set(localeLines(after.locales));
  for (const line of left) if (!right.has(line)) lines.push(`  locales: missing ${line}`);
  const held = new Set(left);
  for (const line of right) if (!held.has(line)) lines.push(`  locales: added ${line}`);
  for (const name of registryDiffMaps()) {
    const left = mapOf(before, name) as unknown as ReadonlyMap<string, unknown>;
    const right = mapOf(after, name) as unknown as ReadonlyMap<string, unknown>;
    for (const key of [...left.keys()].sort()) {
      if (!right.has(key)) lines.push(`  ${name}: missing ${key}`);
      else if (!sameValue(left.get(key), right.get(key))) lines.push(`  ${name}: changed ${key}`);
    }
    for (const key of [...right.keys()].sort()) if (!left.has(key)) lines.push(`  ${name}: added ${key}`);
  }
  return lines;
}
