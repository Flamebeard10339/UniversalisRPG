import { CONTENT_SECTION_MAPS, Registry } from './registry';

const REGISTRY_DIFF_MAPS: readonly (keyof Registry)[] = [...CONTENT_SECTION_MAPS.map(([, map]) => map), 'flags', 'variables', 'saves'];

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = stable((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

export function registryDiff(before: Registry, after: Registry): string[] {
  const lines: string[] = [];
  for (const name of REGISTRY_DIFF_MAPS) {
    const left = before[name] as ReadonlyMap<string, unknown>;
    const right = after[name] as ReadonlyMap<string, unknown>;
    for (const key of [...left.keys()].sort()) {
      if (!right.has(key)) lines.push(`  ${name}: missing ${key}`);
      else if (JSON.stringify(stable(left.get(key))) !== JSON.stringify(stable(right.get(key)))) lines.push(`  ${name}: changed ${key}`);
    }
    for (const key of [...right.keys()].sort()) if (!left.has(key)) lines.push(`  ${name}: added ${key}`);
  }
  return lines;
}
