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

const SERIALIZER = 'serializeRegistryModule';

const SERIALIZE_MODULE = /(^|\/)serialize$/;

// `export … from` as well as `import … from`, so a barrel that hands the
// serializer on under its own name is the same reach as importing it.
const FROM = /(?:import|export)\s+(?<names>[^'"]*?)\s+from\s+['"](?<specifier>[^'"]+)['"]/g;

const DIFF_MODULE = /(^|\/)(registryDiff|roundTrip)$/;

const DYNAMIC = /import\s*\(\s*['"](?<specifier>[^'"]+)['"]/g;

interface Clause {
  names: string;
  specifier: string;
}

const clauses = (text: string): Clause[] => [...text.matchAll(FROM)].map((match) => match.groups as unknown as Clause);

const dynamicSpecifiers = (text: string): string[] => [...text.matchAll(DYNAMIC)].map((match) => match.groups!.specifier);

// Every way a file can end up holding the serializer. A namespace import counts
// whatever it is used for, because `* as printer` grants the whole module and
// nothing downstream of it can be read off an import list — the named form of
// this same rule let `import * as printer from './serialize'` through the whole
// suite. `serialize.ts` itself imports nothing and so answers false, which is
// why it needs no exemption.
function reachesSerializer(text: string): boolean {
  const named = clauses(text).some((clause) => SERIALIZE_MODULE.test(clause.specifier) && (clause.names.includes('*') || clause.names.includes(SERIALIZER)));
  const dynamic = dynamicSpecifiers(text).some((specifier) => SERIALIZE_MODULE.test(specifier));
  // A re-export under any specifier: `export { serializeRegistryModule }` in a
  // module that already imported it hands it on without naming `./serialize`.
  const passedOn = new RegExp(`export\\s*\\{[^}]*\\b${SERIALIZER}\\b`).test(text);
  return named || dynamic || passedOn;
}

const diffs = (text: string): boolean => clauses(text).some((clause) => DIFF_MODULE.test(clause.specifier));

// This file carries one counterexample per way of reaching the serializer, as
// text, and so answers its own question true. It states the rule; it is not one
// of the rule's subjects.
const STATES_THE_RULE = 'src/content/registryDiff.test.ts';

const read = new Map(ROOTS.flatMap(sourceFiles).filter((file) => file !== STATES_THE_RULE).map((file) => [file, readFileSync(file, 'utf8')]));

const serializers = [...read].filter(([, text]) => reachesSerializer(text)).map(([file]) => file);

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
    expect(serializers.filter((file) => !diffs(read.get(file)!))).toEqual([]);
  });

  // The rule reads imports, so it can only be as good as what it counts as one.
  // Each of these is a reach a named-import check does not see, and each of them
  // was a way to hold the serializer with the suite still green.
  it.each([
    ["import * as printer from './serialize';", 'a namespace import'],
    ["export * from './serialize';", 'a barrel'],
    [`export { ${SERIALIZER} } from './serialize';`, 'a re-export'],
    [`const printer = await import('./serialize');`, 'a dynamic import'],
    [`import { ${SERIALIZER} as print } from './serialize';`, 'a rename'],
  ])('counts %s as reaching the serializer (%s)', (line) => {
    expect(reachesSerializer(line)).toBe(true);
  });

  it('does not count the other things serialize.ts exports, which no diff is owed', () => {
    expect(reachesSerializer("import { printSegments } from './serialize';")).toBe(false);
    expect(reachesSerializer("import { printDirective } from '../content/serialize';")).toBe(false);
  });
});
