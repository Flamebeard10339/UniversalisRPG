import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// The subjects are read off the tree rather than listed, because the caller
// this rule exists to catch is the one nobody has written yet: `bd77f26` added
// a second serialize-and-reload one commit after `registryDiff` was promoted so
// it could be shared, and a list would have been written before that commit.
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

interface Import {
  names: string;
  specifier: string;
}

const IMPORT = /import\s+(?:type\s+)?(?<names>[^'"]*?)\s+from\s+['"](?<specifier>[^'"]+)['"]/g;

const imports = (text: string): Import[] => [...text.matchAll(IMPORT)].map((match) => match.groups as unknown as Import);

const importsFrom = (file: string, module: RegExp, name?: RegExp): boolean =>
  imports(readFileSync(file, 'utf8')).some((each) => module.test(each.specifier) && (name === undefined || name.test(each.names)));

const files = ROOTS.flatMap(sourceFiles);

// Whole-module serialization, wherever it is reached from. `serialize.ts` is
// where it is defined and so imports nothing.
const serializes = (file: string): boolean => importsFrom(file, /(^|\/)serialize$/, /\bserializeRegistryModule\b/);

const diffs = (file: string): boolean => importsFrom(file, /(^|\/)(registryDiff|roundTrip)$/);

const serializers = files.filter(serializes);

describe('a serialize-and-reload is a diffed serialize-and-reload', () => {
  it('has subjects to be a claim about', () => {
    expect(serializers.length).toBeGreaterThan(0);
  });

  // Outside a test, the serializer is reachable only through the round trip,
  // which compares before it hands anything back. A caller that wants the
  // printed text and not the comparison has to say so in `roundTrip.ts`, where
  // the next reader of this rule is already standing.
  it('is the only thing shipped code can do with the serializer', () => {
    expect(serializers.filter((file) => !file.endsWith('.test.ts'))).toEqual(['src/content/roundTrip.ts']);
  });

  it('holds in tests too, which reach the serializer only beside the diff', () => {
    expect(serializers.filter((file) => !diffs(file))).toEqual([]);
  });
});
