import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { covers, importedPaths, resolveModule, SOURCE_TREES, sweptFiles } from '../../scripts/lib/layers';
import { trackedFiles } from '../../scripts/lib/sourceFiles';
import { stripComments } from '../../scripts/lib/stripComments';
import { CORPUS_DIR } from '../../src/content/shipped';

const swept = sweptFiles(trackedFiles());
const files = new Set(swept);
const sourceOf = (file: string): string => readFileSync(file, 'utf8');
// A comment saying the words `content/` is prose about the rule, not a reach through it — every
// file that explains why it stays out of the corpus would otherwise read as a door into it.
const codeOf = (file: string): string => stripComments(sourceOf(file)).join('\n');

// How the corpus is named, by anything that reaches it: `CORPUS_DIR` — which `shipped.ts` declares
// and every tool takes from there — or a path written out with the directory at the front of it.
// There is no third way to reach a directory, so the doors are derived from the tree rather than
// listed, and one opened next month is one of these with no edit here.
const NAMES_CORPUS = new RegExp(`\\bCORPUS_DIR\\b|(['"\`])${CORPUS_DIR}[/\\\\]`);

const namesCorpus = (file: string): boolean => NAMES_CORPUS.test(codeOf(file));

// The modules that read the shipped corpus. A test reaches the corpus by importing its way to one
// of these, or by naming the directory itself — which is what a tool test that spawns a CLI over
// `content` does, and what no import graph can see.
const doors = new Set(swept.filter(namesCorpus));

// Every file the `app` and `tools` projects run. Their includes are `src/**` and `scripts/**`, which
// is what `SOURCE_TREES` already names; `docs/**` — the `open` project, this file among them — is
// outside it, so the subjects are derived rather than listed, and a test written next month is one.
const suiteTests = swept.filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file) && SOURCE_TREES.some((tree) => covers(tree, file)));

const importsOf = (file: string): string[] =>
  importedPaths(file, sourceOf(file)).flatMap((specifier) => {
    const resolved = resolveModule(specifier, files);
    return resolved === null ? [] : [resolved];
  });

// The shortest way from a test to a door, or null where it does not reach one. The way rather than
// a yes: a test that reaches through three helpers is a different fix from one that opens the door
// itself, and the reader has to be told which.
function reachToCorpus(from: string): string[] | null {
  if (doors.has(from)) return [from];
  const seen = new Set([from]);
  const frontier: string[][] = [[from]];
  while (frontier.length > 0) {
    const path = frontier.shift()!;
    for (const next of importsOf(path[path.length - 1]!)) {
      if (doors.has(next)) return [...path, next];
      if (seen.has(next)) continue;
      seen.add(next);
      frontier.push([...path, next]);
    }
  }
  return null;
}

describe('the suite and the corpus', () => {
  it('sweeps every test the gate runs, so nothing below is vacuous', () => {
    expect(suiteTests.length).toBeGreaterThan(100);
  });

  it('finds the doors into the corpus, so nothing below is vacuous', () => {
    expect([...doors].filter((door) => !door.endsWith('.test.ts'))).not.toEqual([]);
  });

  it('leaves no test that reaches the shipped corpus', () => {
    expect(
      suiteTests.flatMap((file) => {
        const path = reachToCorpus(file);
        return path === null ? [] : [path.join(' -> ')];
      }),
    ).toEqual([]);
  });
});
