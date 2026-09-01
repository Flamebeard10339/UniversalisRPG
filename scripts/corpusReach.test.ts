import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { covers, SOURCE_TREES, sweptFiles } from './lib/layers';
import { trackedFiles } from './lib/sourceFiles';
import { stripComments } from './lib/stripComments';
import * as shipped from '../src/content/shipped';

const swept = sweptFiles(trackedFiles());
const codeOf = (file: string): string => stripComments(readFileSync(file, 'utf8'), file).join('\n');

const suiteTests = swept.filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file) && SOURCE_TREES.some((tree) => covers(tree, file)));

const NAMES_CORPUS = /\bCORPUS_DIR\b/;

const doors = Object.entries(shipped).filter(([, held]) => typeof held === 'function');

describe('no test reads the shipped corpus', () => {
  it('sweeps every test the gate runs, so nothing below is vacuous', () => {
    expect(suiteTests.length).toBeGreaterThan(100);
  });

  it('finds the doors into the corpus, so nothing below is vacuous', () => {
    expect(doors.length).toBeGreaterThan(2);
  });

  it('shuts every door into the corpus while the suite is running', () => {
    for (const [name, open] of doors) {
      expect(() => (open as () => unknown)(), name).toThrow(/suite/i);
    }
  });

  it('leaves no test naming the corpus directory', () => {
    expect(suiteTests.filter((file) => NAMES_CORPUS.test(codeOf(file)))).toEqual([]);
  });
});
