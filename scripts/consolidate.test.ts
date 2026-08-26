import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { consolidate, contentFiles, parseArgs, run, writable } from './consolidate';
import { openRepl } from './play-cli';
import { withEngineLocale } from '../src/content/engineLocale';
import { initialLocalChangesModule, localSectionHeadings, LOCAL_CHANGES_MODULE_ID } from '../src/content/localChanges';
import { type Registry } from '../src/content/registry';
import { loadUniverse, loadUniverseWithDiagnostics } from '../src/content/load';
import { registryDiff } from '../src/content/registryDiff';
import { CORPUS_DIR, shippedFiles } from '../src/content/shipped';
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

  it('leaves every other byte alone, down to a restage that says what the file already said', () => {
    const result = consolidate(base(), local('# item base.rope', 'title: Rope'));
    expect(writable(result)).toBe(true);
    expect(written(result, 'base')).toBe(BASE);
  });

  it.each([
    ['a CRLF file', true],
    ['an LF file', false],
  ])('keeps the line endings of %s it splices into', (_name, crlf) => {
    const text = crlf ? BASE.split('\n').join('\r\n') : BASE;
    const restaged = consolidate([{ name: 'base', text }], local('# item base.rope', 'title: Rope'));
    expect(writable(restaged)).toBe(true);
    expect(written(restaged, 'base')).toBe(text);

    const edited = consolidate([{ name: 'base', text }], local('# item base.rope', 'title: Cord'));
    expect(written(edited, 'base')).toBe(text.replace('title: Rope', 'title: Cord'));
  });

  it('takes the declaring section out of its file when the staged section is a removal', () => {
    const result = consolidate(base(), local('# remove item.base.bell'));
    expect(writable(result)).toBe(true);
    expect(written(result, 'base')).toBe(BASE.replace('# item bell\ntitle: Bell\n\n', ''));
  });

  it('places two sections into one file without either moving the other', () => {
    const result = consolidate(base(), local('# item base.rope', 'title: A Considerably Longer Rope', '', '# item base.bell', 'title: Chime'));
    expect(writable(result)).toBe(true);
    expect(written(result, 'base')).toBe(BASE.replace('title: Rope', 'title: A Considerably Longer Rope').replace('title: Bell', 'title: Chime'));
  });

  it('reports a section no file under content/ declares by id, and leaves it staged', () => {
    const result = consolidate(base(), local('# item gem', 'title: Gem'));
    expect(result.placed).toEqual([]);
    expect(result.unplaced).toEqual([{ heading: '# item gem', reason: 'no file under content/ declares item local-changes.gem' }]);
    expect(written(result, 'base')).toBe(BASE);
    expect(localSectionHeadings(result.local)).toEqual(['# item gem']);
  });

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

const shippedNames = (): string[] => [...shippedFiles()];

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
    before[name] = readFileSync(`${CORPUS_DIR}/${name}`, 'utf8');
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

const STAGED = '/dsl item core.lockpick examine: A bent sliver of metal, freshly filed. | thieving-tool';

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

// Copy and cleanup belong in hooks: a `-t` filtered run still runs these, and skips the `it` bodies.
describe('the round trip is closed, on the content that ships', () => {
  let tree: Tree;
  let staged: Registry;
  let after: Registry;

  beforeAll(() => {
    tree = copiedTree();
    stage(tree, STAGED);
    staged = loadUniverse(withEngineLocale([...sourcesOf(tree), { name: LOCAL_CHANGES_MODULE_ID, text: readFileSync(tree.localFile, 'utf8') }]));
    consolidateTree(tree);
    after = loadUniverse(withEngineLocale(sourcesOf(tree)));
  });

  afterAll(() => {
    rmSync(tree.dir, { recursive: true, force: true });
  });

  it('loads the same universe from the files alone as it did with the edit staged on top', () => {
    expect(registryDiff(staged, after)).toEqual([]);
  });

  it('leaves the local module with nothing staged', () => {
    expect(localSectionHeadings(readFileSync(tree.localFile, 'utf8'))).toEqual([]);
  });

  it('wrote the edit into the file that declared the id, and touched no other file', () => {
    const written = now(tree);
    expect(written['core.dsl']).toBe(tree.before['core.dsl'].replace('worn smooth from use.', 'freshly filed.'));
    for (const name of shippedNames().filter((each) => each !== 'core.dsl')) expect(written[name], name).toBe(tree.before[name]);
  });

  it('passes every # test the consolidated tree declares', () => {
    expect(after.tests.size).toBeGreaterThan(0);
    for (const id of after.tests.keys()) expect(runTest(id, after, createGameState()), id).toEqual({ passed: true });
  });
});

describe('a consolidation whose result does not load writes nothing either', () => {
  const CHESTED = ['# info base', 'version: 1.0.0', '', '# item rope', 'title: Rope', '', '# entity chest', 'title: Chest', 'open:', '  give: rope', '', '# location camp', 'x: 0, y: 0', 'starting', 'entities: chest', ''].join('\n');
  const extra: ModuleSource = { name: 'extra', text: ['# info extra', 'version: 1.0.0', 'dependencies:', '  base', '', '# item ribbon', 'title: Ribbon', ''].join('\n') };
  const staging = (...body: string[]): ModuleSource => ({
    name: LOCAL_CHANGES_MODULE_ID,
    text: [`# info ${LOCAL_CHANGES_MODULE_ID}`, 'version: 0.0.0', 'dependencies:', '  base', '  extra', '', ...body, ''].join('\n'),
  });

  it('names the diagnostic the splice would have caused, and keeps every byte', () => {
    const sources = [{ name: 'base', text: CHESTED }, extra];
    const result = consolidate(sources, staging('# entity base.chest', 'title: Chest', 'open:', '  give: extra.ribbon'));
    expect(result.placed.map((each) => each.heading)).toEqual(['# entity base.chest']);
    expect(result.diagnostics.join(' ')).toMatch(/ribbon/);
    expect(result.differences).toEqual([]);
    expect(writable(result)).toBe(false);
    expect(written(result, 'base')).toBe(CHESTED);
  });
});

describe('the command surface', () => {
  it('defaults to every .dsl under content/ but the local file, and takes an override', () => {
    expect([...contentFiles(parseArgs([]))].sort()).toEqual(shippedNames().map((name) => `${CORPUS_DIR}/${name}`).sort());
    expect(contentFiles(parseArgs([`local=${CORPUS_DIR}/${LOCAL_CHANGES_MODULE_ID}.dsl`]))).not.toContain(`${CORPUS_DIR}/${LOCAL_CHANGES_MODULE_ID}.dsl`);
    expect(contentFiles(parseArgs(['content=a.dsl, b.dsl']))).toEqual(['a.dsl', 'b.dsl']);
  });

  it('reads the flags it documents', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
    expect(parseArgs(['local=x.dsl']).localFile).toBe('x.dsl');
    expect(parseArgs([]).localFile).toBe(`${CORPUS_DIR}/${LOCAL_CHANGES_MODULE_ID}.dsl`);
  });

  const said = (argv: readonly string[]): { out: string[]; err: string[]; code: number | undefined } => {
    const out: string[] = [];
    const err: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line) => void out.push(String(line)));
    const error = vi.spyOn(console, 'error').mockImplementation((line) => void err.push(String(line)));
    process.exitCode = undefined;
    try {
      run(argv);
      return { out, err, code: process.exitCode };
    } finally {
      process.exitCode = undefined;
      log.mockRestore();
      error.mockRestore();
    }
  };

  it('says so and stops when there is no local file, and when there is nothing in it', () => {
    const tree = copiedTree();
    try {
      const missing = said([`content=${tree.files.join(',')}`, `local=${tree.localFile}`]);
      expect(missing.out.join(' ')).toContain('does not exist');
      expect(missing.code).toBeUndefined();

      writeFileSync(tree.localFile, initialLocalChangesModule(['core']), 'utf8');
      const empty = said([`content=${tree.files.join(',')}`, `local=${tree.localFile}`]);
      expect(empty.out.join(' ')).toContain('Nothing staged in');
      expect(now(tree)).toEqual(tree.before);
    } finally {
      rmSync(tree.dir, { recursive: true, force: true });
    }
  });

  it('prints the plan and writes nothing under --dry-run', () => {
    const tree = copiedTree();
    try {
      stage(tree, STAGED);
      const staged = readFileSync(tree.localFile, 'utf8');
      const result = said([`content=${tree.files.join(',')}`, `local=${tree.localFile}`, '--dry-run']);
      expect(result.out.join(' ')).toContain('Would write # item core.lockpick into core.dsl');
      expect(now(tree)).toEqual(tree.before);
      expect(readFileSync(tree.localFile, 'utf8')).toBe(staged);
    } finally {
      rmSync(tree.dir, { recursive: true, force: true });
    }
  });

  it('exits non-zero and writes nothing when nothing staged could be placed', () => {
    const tree = copiedTree();
    try {
      stage(tree, '/dsl item gem title: Gem');
      const result = said([`content=${tree.files.join(',')}`, `local=${tree.localFile}`]);
      expect(result.err.join(' ')).toContain('Left staged: # item gem');
      expect(result.code).toBe(1);
      expect(now(tree)).toEqual(tree.before);
    } finally {
      rmSync(tree.dir, { recursive: true, force: true });
    }
  });
});

describe('a refused consolidation writes no file', () => {
  it('leaves every byte on disk where it was', () => {
    const tree = copiedTree();
    try {
      stage(tree, '/dsl item core.lockpick examine: Only this line.');
      const staged = readFileSync(tree.localFile, 'utf8');
      consolidateTree(tree);
      expect(now(tree)).toEqual(tree.before);
      expect(readFileSync(tree.localFile, 'utf8')).toBe(staged);
    } finally {
      rmSync(tree.dir, { recursive: true, force: true });
    }
  });
});
