import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { consolidate, run, writable } from './consolidate';
import { openRepl } from './play-cli';
import { withEngineLocale } from '../src/content/engineLocale';
import { initialLocalChangesModule, localSectionHeadings, LOCAL_CHANGES_MODULE_ID } from '../src/content/localChanges';
import { loadUniverse, loadUniverseWithDiagnostics } from '../src/content/registry';
import { registryDiff } from '../src/content/registryDiff';
import type { ModuleSource } from '../src/content/universe';
import { runLine, type AuthoringContext } from '../src/runtime/command';
import { createGameState } from '../src/runtime/runtime';
import { runTest } from '../src/runtime/session';

const BASE = ['// a rope and a bell', '# info base', 'version: 1.0.0', '', '# item rope', 'title: Rope', '', '# item bell', 'title: Bell', '', '# location camp', 'x: 0, y: 0', 'starting', ''].join('\n');

const base = (...extra: ModuleSource[]): ModuleSource[] => [{ name: 'base', text: BASE }, ...extra];

const local = (...body: string[]): ModuleSource => ({
  name: LOCAL_CHANGES_MODULE_ID,
  text: [`# info ${LOCAL_CHANGES_MODULE_ID}`, 'version: 0.0.0', 'dependencies:', '  base', '', ...body, ''].join('\n'),
});

const written = (result: ReturnType<typeof consolidate>, name: string): string => result.sources.find((source) => source.name === name)!.text;

describe('a consolidation writes each section into the file that declared its id', () => {
  it('splices the staged text over the declaring span, under the heading that file spells', () => {
    const result = consolidate(base(), local('# item base.rope', 'title: Cord'));
    expect(writable(result)).toBe(true);
    expect(result.placed).toEqual([{ heading: '# item base.rope', kind: 'item', id: 'base.rope', source: 'base' }]);
    expect(written(result, 'base')).toBe(BASE.replace('# item rope\ntitle: Rope', '# item rope\ntitle: Cord'));
  });

  // Byte equality over the whole file rather than over the sections nobody
  // touched: a comment, a blank line and an ordering are all things only this
  // can see, and all three are what splicing exists to keep.
  it('leaves every other byte alone, down to a restage that says what the file already said', () => {
    const result = consolidate(base(), local('# item base.rope', 'title: Rope'));
    expect(writable(result)).toBe(true);
    expect(written(result, 'base')).toBe(BASE);
  });

  it('takes the declaring section out of its file when the staged section is a removal', () => {
    const result = consolidate(base(), local('# remove item.base.bell'));
    expect(writable(result)).toBe(true);
    expect(written(result, 'base')).toBe(BASE.replace('# item bell\ntitle: Bell\n\n', ''));
  });

  it('reports a section no file under content/ declares by id, and leaves it staged', () => {
    const result = consolidate(base(), local('# item gem', 'title: Gem'));
    expect(result.placed).toEqual([]);
    expect(result.unplaced).toEqual([{ heading: '# item gem', reason: 'no file under content/ declares item local-changes.gem' }]);
    expect(written(result, 'base')).toBe(BASE);
    expect(localSectionHeadings(result.local)).toEqual(['# item gem']);
  });

  // A global id belongs to nobody, so two files may spell the same one. Placing
  // it by guess is the one repair c1 forbids, and there is no other evidence to
  // decide it on.
  it('refuses a section two files both declare, rather than choosing one', () => {
    const other: ModuleSource = { name: 'other', text: '# info other\nversion: 1.0.0\ndependencies:\n  base\n\n# variable pace\nvalue: 2\n' };
    const withVariable = { name: 'base', text: `${BASE}\n# variable pace\nvalue: 1\n` };
    const result = consolidate([withVariable, other], local('# variable pace', 'value: 3'));
    expect(result.placed).toEqual([]);
    expect(result.unplaced).toEqual([{ heading: '# variable pace', reason: 'base and other both declare variable pace' }]);
    expect(localSectionHeadings(result.local)).toEqual(['# variable pace']);
  });

  it('leaves both staged when two sections go home to one span', () => {
    const result = consolidate(base(), local('# item base.bell', 'title: Chime', '', '# remove item.base.bell'));
    expect(result.placed).toEqual([]);
    expect(result.unplaced.map((each) => each.heading)).toEqual(['# item base.bell', '# remove item.base.bell']);
    expect(written(result, 'base')).toBe(BASE);
  });
});

describe('a consolidation that would change the universe writes nothing', () => {
  // The staged section replaces the whole section it goes home to, so a patch
  // that names one field of many arrives at the file having dropped the rest.
  // It is a real edit, it loads, and only the diff can tell it apart from one
  // that consolidates cleanly.
  it('names the difference a partial patch would make, and keeps every byte', () => {
    const result = consolidate(base(), local('# location base.camp', 'x: 0, y: 0'));
    expect(result.differences).toEqual(['  locations: changed base.camp']);
    expect(writable(result)).toBe(false);
    expect(written(result, 'base')).toBe(BASE);
    expect(result.local).toBe(local('# location base.camp', 'x: 0, y: 0').text);
  });

  it('refuses as a whole, so a placeable section beside an unloadable one is not written either', () => {
    const result = consolidate(base(), local('# item base.rope', 'title: Cord', '', '# location base.camp', 'x: 0, y: 0'));
    expect(result.placed.map((each) => each.heading)).toEqual(['# item base.rope', '# location base.camp']);
    expect(result.differences).toEqual(['  locations: changed base.camp']);
    expect(written(result, 'base')).toBe(BASE);
  });
});

// The shipped tree, copied so the run is real: the CLI reads and writes files,
// and c3's "no file is written" is a claim about bytes on disk that an
// in-memory result cannot make.
const shippedNames = (): string[] => readdirSync('content').filter((name) => name.endsWith('.dsl') && name !== `${LOCAL_CHANGES_MODULE_ID}.dsl`);

interface Tree {
  dir: string;
  files: string[];
  localFile: string;
  before: Record<string, string>;
}

function copiedTree(): Tree {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-consolidate-'));
  const before: Record<string, string> = {};
  for (const name of shippedNames()) {
    before[name] = readFileSync(`content/${name}`, 'utf8');
    writeFileSync(path.join(dir, name), before[name], 'utf8');
  }
  return { dir, files: shippedNames().map((name) => path.join(dir, name)), localFile: path.join(dir, `${LOCAL_CHANGES_MODULE_ID}.dsl`), before };
}

const now = (tree: Tree): Record<string, string> => Object.fromEntries(shippedNames().map((name) => [name, readFileSync(path.join(tree.dir, name), 'utf8')]));

const sourcesOf = (tree: Tree): ModuleSource[] => shippedNames().map((name) => ({ name: name.replace(/\.dsl$/, ''), text: readFileSync(path.join(tree.dir, name), 'utf8') }));

function consolidateTree(tree: Tree): void {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    run([`content=${tree.files.join(',')}`, `local=${tree.localFile}`]);
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

// The edit an author would make: a whole `# item` section, typed at `/dsl` in a
// live session over the shipped content, staged through the same command table
// the REPL and the GUI both go through.
const STAGED = '/dsl item tutorial-island.lockpick examine: A bent sliver of metal, freshly filed. | thieving-tool';

function stage(tree: Tree, line: string): void {
  const baseSources = sourcesOf(tree);
  const dependencies = loadUniverseWithDiagnostics(baseSources).loadedModules;
  const authoring: AuthoringContext = {
    baseSources,
    dependencies,
    localSource: { name: LOCAL_CHANGES_MODULE_ID, text: initialLocalChangesModule(dependencies) },
    writeLocalChanges: (text) => writeFileSync(tree.localFile, text, 'utf8'),
  };
  const repl = openRepl(withEngineLocale([...baseSources, authoring.localSource]), { authoring });
  const result = runLine(repl.context, line);
  expect(result.output.filter((each) => each.kind === 'message' && each.tone === 'error')).toEqual([]);
}

describe('the round trip is closed, on the content that ships', () => {
  const tree = copiedTree();
  stage(tree, STAGED);
  const staged = loadUniverse(withEngineLocale([...sourcesOf(tree), { name: LOCAL_CHANGES_MODULE_ID, text: readFileSync(tree.localFile, 'utf8') }]));
  consolidateTree(tree);
  const after = loadUniverse(withEngineLocale(sourcesOf(tree)));

  it('loads the same universe from the files alone as it did with the edit staged on top', () => {
    expect(registryDiff(staged, after)).toEqual([]);
  });

  it('leaves the local module with nothing staged', () => {
    expect(localSectionHeadings(readFileSync(tree.localFile, 'utf8'))).toEqual([]);
  });

  it('wrote the edit into the file that declared the id, and touched no other file', () => {
    const written = now(tree);
    expect(written['tutorial-island.dsl']).toBe(tree.before['tutorial-island.dsl'].replace('worn smooth from use.', 'freshly filed.'));
    for (const name of shippedNames().filter((each) => each !== 'tutorial-island.dsl')) expect(written[name], name).toBe(tree.before[name]);
  });

  it('passes every # test the consolidated tree declares', () => {
    expect(after.tests.size).toBeGreaterThan(0);
    for (const id of after.tests.keys()) expect(runTest(id, after, createGameState()), id).toEqual({ passed: true });
  });

  it('leaves the tree it started from behind', () => {
    rmSync(tree.dir, { recursive: true, force: true });
  });
});

describe('a refused consolidation writes no file', () => {
  it('leaves every byte on disk where it was', () => {
    const tree = copiedTree();
    try {
      stage(tree, '/dsl item tutorial-island.lockpick examine: Only this line.');
      const staged = readFileSync(tree.localFile, 'utf8');
      consolidateTree(tree);
      expect(now(tree)).toEqual(tree.before);
      expect(readFileSync(tree.localFile, 'utf8')).toBe(staged);
    } finally {
      rmSync(tree.dir, { recursive: true, force: true });
    }
  });
});
