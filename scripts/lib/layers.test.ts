import { describe, expect, it } from 'vitest';
import { checkLayers, covers, layerCheckOutput, layerOf, importedPaths, MODULE_EXTENSIONS, OUTSIDE_STACK, ROOTS, runLayerCheck, SOURCE_TREES, sweptFiles, pointsUpward, unlayeredFiles } from './layers';
import { trackedFiles } from './sourceFiles';

const from = (source: string): string[] => importedPaths('src/content/registry.ts', source);

const swept = sweptFiles(trackedFiles());

describe('importedPaths', () => {
  it('finds every spelling of an import, in every quote style', () => {
    expect(
      from(
        [
          "import { a } from '../runtime/a';",
          'import type { B } from "../runtime/b";',
          'export * from `../runtime/c`;',
          "import '../runtime/d';",
          "const e = await import('../runtime/e');",
          "const f = require('../runtime/f');",
        ].join('\n'),
      ),
    ).toEqual(['src/runtime/a', 'src/runtime/b', 'src/runtime/c', 'src/runtime/d', 'src/runtime/e', 'src/runtime/f']);
  });

  it('does not read an import someone commented out as an import', () => {
    expect(from("// import { a } from '../runtime/a';\n/* import '../runtime/b'; */\n")).toEqual([]);
  });

  it('resolves a directory import to the directory itself', () => {
    expect(from("import { a } from '../runtime';")).toEqual(['src/runtime']);
  });
});

describe('layerOf', () => {
  it('names the layer of a directory import as well as a file one', () => {
    expect(layerOf('src/runtime')).toBe('runtime');
    expect(layerOf('src/runtime/save')).toBe('runtime');
    expect(layerOf('src/runtimes/save')).toBeNull();
    expect(layerOf('content/tutorial-island.dsl')).toBeNull();
  });

  it('places the browser driver’s entry point at ui, where a root names a file rather than a directory', () => {
    expect(layerOf('src/main.tsx')).toBe('ui');
    expect(layerOf('src/ui/App.tsx')).toBe('ui');
  });

  it('reads a file root through the extensionless spelling an importer has to write', () => {
    expect(layerOf('src/main')).toBe('ui');
    expect(layerOf('src/runtime/save.js')).toBe('runtime');
  });

  it('lets a root that names a file claim that file and nothing under a directory of the same name', () => {
    expect(layerOf('src/main/deep/nested.ts')).toBeNull();
    expect(layerOf('src/mainly.ts')).toBeNull();
  });
});

describe('sweptFiles', () => {
  it('takes every module under a source tree and nothing else', () => {
    expect(sweptFiles(['src/main.tsx', 'src/legacy.js', 'scripts/lib/git.ts', 'src/index.css', 'content/isle.dsl', 'docs/workflow.md', 'vite.config.ts'], () => true)).toEqual([
      'src/main.tsx',
      'src/legacy.js',
      'scripts/lib/git.ts',
    ]);
  });

  it('passes over a file the index still lists and the working tree no longer holds', () => {
    expect(sweptFiles(['src/main.tsx', 'src/grammar/renamed.ts'], (file) => file !== 'src/grammar/renamed.ts')).toEqual(['src/main.tsx']);
  });

  it('reaches into every declared tree, and holds the tree it has', () => {
    for (const tree of SOURCE_TREES) expect(swept.filter((file) => covers(tree, file)).length).toBeGreaterThan(20);
    expect(swept).toContain('src/main.tsx');
    expect(swept).toContain('src/grammar/condition.ts');
    expect(swept).toContain('scripts/layer-check.ts');
    expect(swept.length).toBeGreaterThan(190);
  });

  it('leaves no declared root outside a swept tree, which is what keeps the two lists from drifting apart by hand', () => {
    const unreachable = Object.values(ROOTS)
      .flat()
      .filter((root) => !SOURCE_TREES.some((tree) => covers(tree, root)));
    expect(unreachable).toEqual([]);
  });
});

describe('unlayeredFiles', () => {
  it('names swept source that belongs to no root, and passes over what is declared outside the stack', () => {
    expect(unlayeredFiles(['src/grammar/a.ts', 'src/stray.ts', 'src/vite-env.d.ts', 'scripts/b.ts'])).toEqual(['src/stray.ts']);
  });

  it('matches a declaration by exact path, so a directory cannot be exempted', () => {
    expect(unlayeredFiles(['src/legacy/a.ts', 'src/legacy'], { 'src/legacy': 'a reason' })).toEqual(['src/legacy/a.ts']);
  });

  it('finds nothing in the tree as it stands: every module under src and scripts has a layer', () => {
    expect(unlayeredFiles(swept)).toEqual([]);
  });

  it('leaves nothing declared outside the stack that no longer exists, and no entry without a reason', () => {
    expect(Object.keys(OUTSIDE_STACK).filter((path) => !swept.includes(path))).toEqual([]);
    expect(Object.entries(OUTSIDE_STACK).filter(([, why]) => why.trim() === '')).toEqual([]);
  });
});

describe('checkLayers', () => {
  const sources: Record<string, string> = {
    'src/content/registry.ts': "import { a } from '../grammar/a';",
    'src/grammar/a.ts': "import { b } from '../content/registry';",
    'src/stray.ts': "import { c } from './grammar/a';",
  };

  it('reports an upward import, counts every edge it resolved, and partitions what it swept', () => {
    expect(checkLayers(Object.keys(sources), (file) => sources[file])).toEqual({
      read: 2,
      edges: 2,
      violations: [{ from: 'src/grammar/a.ts', to: 'src/content/registry' }],
      cycles: [{ members: ['src/content/registry.ts', 'src/grammar/a.ts'], closedBy: [{ from: 'src/grammar/a.ts', to: 'src/content/registry.ts' }] }],
      unlayered: ['src/stray.ts'],
    });
  });

  it('catches a layer below ui reaching the browser driver’s entry point', () => {
    expect(checkLayers(['src/runtime/boot.ts'], () => "import { root } from '../main';").violations).toEqual([{ from: 'src/runtime/boot.ts', to: 'src/main' }]);
  });

  it('does not read a file it cannot place, since it has no layer to judge an import against', () => {
    const read: string[] = [];
    checkLayers(['src/content/registry.ts', 'src/stray.ts', 'src/vite-env.d.ts'], (file) => {
      read.push(file);
      return sources[file] ?? '';
    });
    expect(read).toEqual(['src/content/registry.ts']);
  });
});

describe('layerCheckOutput', () => {
  const clean = { read: 2, edges: 7, violations: [], cycles: [], unlayered: [] };

  it('passes a clean report, and counts what it read apart from what it swept', () => {
    const { out, err, exitCode } = layerCheckOutput(['a.ts', 'b.ts', 'src/vite-env.d.ts'], clean);
    expect(exitCode).toBe(0);
    expect(err).toEqual([]);
    expect(out[0]).toContain('3 module(s) swept under src and scripts, 2 read; 7 cross-file imports');
    expect(out[out.length - 1]).toBe('Every module belongs to a layer, every import points downward, and no module imports its way back to itself.');
  });

  it('fails a sweep that found nothing, which is a broken enumeration rather than a clean tree', () => {
    const { err, exitCode } = layerCheckOutput([], { read: 0, edges: 0, violations: [], cycles: [], unlayered: [] });
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('no modules at all');
  });

  it('fails the run on a module belonging to no root, and names it', () => {
    const { err, exitCode } = layerCheckOutput(['a.ts'], { ...clean, unlayered: ['src/stray.ts'] });
    expect(exitCode).toBe(1);
    expect(err).toContain('  src/stray.ts');
    expect(err.join('\n')).not.toContain('every import points downward');
  });

  it('fails the run on an upward import, and names both ends', () => {
    const { err, exitCode } = layerCheckOutput(['a.ts'], { ...clean, violations: [{ from: 'src/grammar/a.ts', to: 'src/runtime/b' }] });
    expect(exitCode).toBe(1);
    expect(err).toContain('  src/grammar/a.ts -> src/runtime/b');
  });

  it('fails the run on a cycle, and names every module on it as well as the imports that close it', () => {
    const { err, exitCode } = layerCheckOutput(['a.ts'], {
      ...clean,
      cycles: [{ members: ['src/runtime/a.ts', 'src/runtime/b.ts', 'src/runtime/c.ts'], closedBy: [{ from: 'src/runtime/c.ts', to: 'src/runtime/a.ts' }] }],
    });
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('1 import cycle(s), holding 3 module(s)');
    expect(err).toContain('    src/runtime/a.ts');
    expect(err).toContain('    src/runtime/b.ts');
    expect(err).toContain('    src/runtime/c.ts');
    expect(err).toContain('    src/runtime/c.ts -> src/runtime/a.ts');
  });
});

describe('runLayerCheck', () => {
  const tree: Record<string, string> = {
    'src/grammar/a.ts': '',
    'src/content/b.ts': "import { a } from '../grammar/a';",
    'scripts/c.ts': "import { b } from '../src/content/b';",
  };

  it('feeds the sweep to the check and the check to the report, over the enumeration it is given', () => {
    const { out, exitCode } = runLayerCheck({ tracked: () => [...Object.keys(tree), 'docs/workflow.md'], exists: () => true, read: (file) => tree[file] });
    expect(exitCode).toBe(0);
    expect(out[0]).toContain('3 module(s) swept under src and scripts, 3 read; 2 cross-file imports');
  });

  it('fails when the enumeration it is handed comes back empty, rather than reporting a clean tree', () => {
    const { exitCode } = runLayerCheck({ tracked: () => [], exists: () => true, read: () => '' });
    expect(exitCode).toBe(1);
  });

  it('carries a cycle all the way to the exit code, naming the modules on it and the import that closes it', () => {
    const cyclic: Record<string, string> = {
      'src/runtime/a.ts': "import { b } from './b';",
      'src/runtime/b.ts': "import { a } from './a';",
      'src/grammar/g.ts': 'export const g = 1;',
    };
    const { exitCode, err } = runLayerCheck({ tracked: () => Object.keys(cyclic), exists: () => true, read: (file) => cyclic[file] });
    expect(exitCode).toBe(1);
    expect(err).toContain('    src/runtime/a.ts');
    expect(err).toContain('    src/runtime/b.ts');
    expect(err).toContain('    src/runtime/b.ts -> src/runtime/a.ts');
  });

  it('carries an upward import all the way to the exit code', () => {
    const { exitCode, err } = runLayerCheck({ tracked: () => ['src/grammar/a.ts'], exists: () => true, read: () => "import { c } from '../../scripts/c';" });
    expect(exitCode).toBe(1);
    expect(err).toContain('  src/grammar/a.ts -> scripts/c');
  });

  it('reaches this repository through its own effects, and finds the tree there', () => {
    const { out, exitCode } = runLayerCheck();
    const [, sweptCount, readCount, edgeCount] = /^(\d+) module\(s\) swept under src and scripts, (\d+) read; (\d+) cross-file/.exec(out[0]) ?? [];
    expect(exitCode).toBe(0);
    expect(Number(sweptCount)).toBe(swept.length);
    expect(Number(readCount)).toBe(swept.length - Object.keys(OUTSIDE_STACK).length);
    expect(Number(edgeCount)).toBeGreaterThan(500);
  });
});

describe('MODULE_EXTENSIONS', () => {
  it('covers what the loader would load, not only what the tree happens to hold today', () => {
    for (const extension of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']) expect(MODULE_EXTENSIONS).toContain(extension);
  });
});

describe('pointsUpward', () => {
  it('allows a layer to reach down and sideways, never up', () => {
    expect(pointsUpward('runtime', 'content')).toBe(false);
    expect(pointsUpward('runtime', 'runtime')).toBe(false);
    expect(pointsUpward('content', 'runtime')).toBe(true);
  });
});
