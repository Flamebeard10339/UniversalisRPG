import { describe, expect, it } from 'vitest';
import { checkLayers, layerCheckOutput, layerOf, importedPaths, MODULE_EXTENSIONS, OUTSIDE_STACK, ROOTS, SOURCE_TREES, sweptFiles, pointsUpward, unlayeredFiles } from './layers';
import { trackedFiles } from './sourceFiles';
import { covers } from './systems';

const from = (source: string): string[] => importedPaths('src/content/registry.ts', source);

// One git call for the whole file: every case that asks about the tree as it
// stands asks it of this list.
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
});

describe('sweptFiles', () => {
  it('takes every module under a source tree and nothing else', () => {
    expect(sweptFiles(['src/main.tsx', 'src/legacy.js', 'scripts/lib/git.ts', 'src/index.css', 'content/isle.dsl', 'docs/workflow.md', 'vite.config.ts'])).toEqual([
      'src/main.tsx',
      'src/legacy.js',
      'scripts/lib/git.ts',
    ]);
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
      edges: 2,
      violations: [{ from: 'src/grammar/a.ts', to: 'src/content/registry' }],
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
  const clean = { edges: 7, violations: [], unlayered: [] };

  it('passes a clean report, and says how much it read', () => {
    const { out, err, exitCode } = layerCheckOutput(['a.ts', 'b.ts'], clean);
    expect(exitCode).toBe(0);
    expect(err).toEqual([]);
    expect(out[0]).toContain('2 module(s) read under src and scripts; 7 cross-file imports');
    expect(out[out.length - 1]).toBe('Every module belongs to a layer, and every import points downward.');
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
