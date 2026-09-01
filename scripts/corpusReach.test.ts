import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { covers, SOURCE_TREES, sweptFiles } from './lib/layers';
import { trackedFiles } from './lib/sourceFiles';
import { stripComments } from './lib/stripComments';
import * as shipped from '../src/content/shipped';

const swept = sweptFiles(trackedFiles());
// A comment saying the words `content/` is prose about the rule, not a reach through it — every
// file that explains why it stays out of the corpus would otherwise read as a door into it.
const codeOf = (file: string): string => stripComments(readFileSync(file, 'utf8'), file).join('\n');

// Every file the `app` and `tools` projects run — this file among them. Their includes are `src/**`
// and `scripts/**`, which is what `SOURCE_TREES` already names, so the subjects are derived rather
// than listed beside the vitest config, and a test written next month is one of them.
const suiteTests = swept.filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file) && SOURCE_TREES.some((tree) => covers(tree, file)));

// `CORPUS_DIR` is the corpus and is nothing else, so naming it is exact where matching the word
// `content` is not: a synthetic path in a fixture, a layer called content, and a comment about the
// rule all say that word and read nothing.
const NAMES_CORPUS = /\bCORPUS_DIR\b/;

// Every way into `content/` that `shipped.ts` offers. Read off the module rather than listed, so a
// reader added to it is one of these with no edit here.
const doors = Object.entries(shipped).filter(([, held]) => typeof held === 'function');

describe('no test reads the shipped corpus', () => {
  it('sweeps every test the gate runs, so nothing below is vacuous', () => {
    expect(suiteTests.length).toBeGreaterThan(100);
  });

  it('finds the doors into the corpus, so nothing below is vacuous', () => {
    expect(doors.length).toBeGreaterThan(2);
  });

  // The rule itself, rather than a reading of the tree that could miss a way round: under vitest the
  // corpus does not open at all, so a test cannot read it however it tries — through a helper, a
  // path it built itself, or a module it only meant to import.
  it('shuts every door into the corpus while the suite is running', () => {
    for (const [name, open] of doors) {
      expect(() => (open as () => unknown)(), name).toThrow(/suite/i);
    }
  });

  // And the door is not walked round: a test that names the corpus directory is one reading it by
  // some other means, since nothing else in the tree has any use for that name.
  it('leaves no test naming the corpus directory', () => {
    expect(suiteTests.filter((file) => NAMES_CORPUS.test(codeOf(file)))).toEqual([]);
  });
});
