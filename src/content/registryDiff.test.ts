import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import * as serialize from './serialize';

// Nothing here models an import. The serializer is not exported, so there is no
// binding for another file to hold, and `tsc` is what refuses a caller; what is
// left to check is that the export stays shut.
const SERIALIZER = 'serializeRegistryModule';

const OWNER = 'src/content/serialize.ts';

// This file has to write the name down to look for it.
const STATES_THE_RULE = 'src/content/registryDiff.test.ts';

const ROOTS = ['src', 'scripts'];

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const at = path.posix.join(root, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(at));
    else if (entry.name.endsWith('.ts')) found.push(at);
  }
  return found;
}

describe('a serialize-and-reload is a diffed serialize-and-reload', () => {
  it('does not hand the serializer out, so no caller can hold one undiffed', () => {
    expect(Object.keys(serialize)).not.toContain(SERIALIZER);
  });

  // The whole surface, so a second whole-module printer cannot be exported
  // beside the first. An enumeration is the right shape here because its subject
  // is one module's own exports — a fact that module owns and a reader can check
  // by scrolling it.
  it('offers the round trip and the section printers, and nothing else', () => {
    expect(Object.keys(serialize).sort()).toEqual(['canSerialize', 'declaredGlobalIds', 'printDirective', 'printSegments', 'republishModule', 'roundTripModule', 'roundTripUniverse']);
  });

  // Corroboration rather than the guard: with the export gone there is no legal
  // way to name it, so this failing means somebody re-opened the export above.
  it('is named nowhere but the file that defines it', () => {
    const files = ROOTS.flatMap(sourceFiles).filter((file) => file !== OWNER && file !== STATES_THE_RULE);
    expect(files.filter((file) => readFileSync(file, 'utf8').includes(SERIALIZER))).toEqual([]);
  });

  it('walked a tree with files in it, so the claim above has subjects', () => {
    expect(ROOTS.flatMap(sourceFiles).length).toBeGreaterThan(50);
  });
});
