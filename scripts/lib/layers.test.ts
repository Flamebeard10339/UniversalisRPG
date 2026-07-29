import { describe, expect, it } from 'vitest';
import { importedPaths, layerOf, pointsUpward } from './layers';

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
});

describe('pointsUpward', () => {
  it('allows a layer to reach down and sideways, never up', () => {
    expect(pointsUpward('runtime', 'content')).toBe(false);
    expect(pointsUpward('runtime', 'runtime')).toBe(false);
    expect(pointsUpward('content', 'runtime')).toBe(true);
  });
});
