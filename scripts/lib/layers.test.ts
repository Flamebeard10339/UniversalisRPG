import { describe, expect, it } from 'vitest';
import { checkLayers, layerOf, importedPaths, OUTSIDE_STACK, pointsUpward, SOURCE_TREES, unlayeredFiles } from './layers';
import { sourceFiles } from './sourceFiles';

const from = (source: string): string[] => importedPaths('src/content/registry.ts', source);

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
});

describe('unlayeredFiles', () => {
  it('names swept source that belongs to no root, and passes over what is declared outside the stack', () => {
    expect(unlayeredFiles(['src/grammar/a.ts', 'src/stray.ts', 'src/vite-env.d.ts', 'scripts/b.ts'])).toEqual(['src/stray.ts']);
  });

  it('matches a declaration by exact path, so a directory cannot be exempted', () => {
    expect(unlayeredFiles(['src/legacy/a.ts', 'src/legacy'], ['src/legacy'])).toEqual(['src/legacy/a.ts']);
  });

  it('finds nothing in the tree as it stands: every source file under src and scripts has a layer', () => {
    expect(unlayeredFiles(SOURCE_TREES.flatMap((tree) => sourceFiles(tree)))).toEqual([]);
  });

  it('leaves nothing declared outside the stack that no longer exists', () => {
    const swept = new Set(SOURCE_TREES.flatMap((tree) => sourceFiles(tree)));
    expect(OUTSIDE_STACK.filter((path) => !swept.has(path))).toEqual([]);
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

  it('does not read a file it cannot place, since it has no layer to judge an import against', () => {
    const read: string[] = [];
    checkLayers(['src/content/registry.ts', 'src/stray.ts', 'src/vite-env.d.ts'], (file) => {
      read.push(file);
      return sources[file] ?? '';
    });
    expect(read).toEqual(['src/content/registry.ts']);
  });
});

describe('pointsUpward', () => {
  it('allows a layer to reach down and sideways, never up', () => {
    expect(pointsUpward('runtime', 'content')).toBe(false);
    expect(pointsUpward('runtime', 'runtime')).toBe(false);
    expect(pointsUpward('content', 'runtime')).toBe(true);
  });
});
