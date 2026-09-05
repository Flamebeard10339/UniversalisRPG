import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readContent } from './saveFixtures';
import { sourceFiles, sourceName, sourceSlug } from './dslSources';

const world = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'dsl-sources-'));
  writeFileSync(path.join(root, 'island.dsl'), '# info island\nversion: 1.0.0\n');
  writeFileSync(path.join(root, 'notes.md'), 'not a module');
  mkdirSync(path.join(root, 'nested'));
  writeFileSync(path.join(root, 'nested', 'outpost.dsl'), '# info outpost\nversion: 1.0.0\n');
  return root;
};

describe('what a world directory offers', () => {
  it('is the .dsl files in it, and a subfolder is not part of the world', () => {
    expect(sourceFiles(world()).map(sourceName)).toEqual(['island']);
  });

  it('is the same answer whichever tool opens it', () => {
    const root = world();

    expect(readContent(root).map((file) => sourceName(file.path))).toEqual(sourceFiles(root).map(sourceName));
  });
});

describe('a file name read as a module id', () => {
  it('drops the directory and the extension', () => {
    expect(sourceName(path.join('content', 'the-rat-conspiracy.dsl'))).toBe('the-rat-conspiracy');
  });

  it('slugifies whatever a draft happens to be called', () => {
    expect(sourceSlug(path.join('drafts', 'My Draft (2).dsl'))).toBe('my-draft-2');
  });
});
