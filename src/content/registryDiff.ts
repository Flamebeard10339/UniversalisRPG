import { localeLines } from './locale';
import { CONTENT_SECTION_MAPS, Registry } from './registry';

// Asked for rather than held. This module is inside the cycle `serialize.ts`
// closes now that the round trip lives there, so a binding read at load time
// is a binding whose own module has not run yet.
export const registryDiffMaps = (): readonly (keyof Registry)[] => [...CONTENT_SECTION_MAPS.map(([, map]) => map), 'flags', 'variables', 'slots', 'saves'];

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = stable((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

// Value equality over loaded content: array order is meaningful, key order is
// not, because two equal values can have been built by different code paths.
export const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

export function registryDiff(before: Registry, after: Registry): string[] {
  const lines: string[] = [];
  // The `# locale` sections, which a round trip loses as silently as any other
  // content if nothing compares them. Base text is not compared here: it is
  // derived from the content maps below, so a difference in it is one of theirs
  // reported twice.
  const left = localeLines(before.locales);
  const right = new Set(localeLines(after.locales));
  for (const line of left) if (!right.has(line)) lines.push(`  locales: missing ${line}`);
  const held = new Set(left);
  for (const line of right) if (!held.has(line)) lines.push(`  locales: added ${line}`);
  for (const name of registryDiffMaps()) {
    const left = before[name] as ReadonlyMap<string, unknown>;
    const right = after[name] as ReadonlyMap<string, unknown>;
    for (const key of [...left.keys()].sort()) {
      if (!right.has(key)) lines.push(`  ${name}: missing ${key}`);
      else if (!sameValue(left.get(key), right.get(key))) lines.push(`  ${name}: changed ${key}`);
    }
    for (const key of [...right.keys()].sort()) if (!left.has(key)) lines.push(`  ${name}: added ${key}`);
  }
  return lines;
}
