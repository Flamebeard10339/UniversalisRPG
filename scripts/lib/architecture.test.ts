import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveModules, exportedNames, regionView, repoSourceTree, resolveImport, systemEdges, systemView, type SourceTree } from './architecture';
import type { Concept, Manifest, System } from './systems';

function system(name: string, paths: string[], concepts: Concept[] = []): System {
  return { name, paths, covers: [], lastAudit: null, lastAuditDoc: null, note: null, concepts };
}

function tree(files: Record<string, string>): SourceTree {
  return {
    files: Object.keys(files),
    read: (path) => {
      const source = files[path];
      if (source === undefined) throw new Error(`fixture has no ${path}`);
      return source;
    },
  };
}

const manifest: Manifest = {
  unowned: { note: '', paths: ['docs'] },
  systems: [
    system('Grammar', ['src/grammar']),
    system('Runtime', ['src/runtime'], [{ name: 'saves', paths: ['src/runtime/save.ts'], note: 'from a produces claim' }]),
  ],
};

describe('exportedNames', () => {
  it('reads every declaration form', () => {
    const source = [
      'export function plain() {}',
      'export async function waiting() {}',
      'export function* generating() {}',
      'export const value = 1;',
      'export let mutable = 1;',
      'export class Shape {}',
      'export abstract class Base {}',
      'export interface Contract {}',
      'export type Alias = string;',
      'export enum Colour {}',
      'export default function named() {}',
    ].join('\n');
    expect(exportedNames(source)).toEqual(['Alias', 'Base', 'Colour', 'Contract', 'Shape', 'generating', 'mutable', 'named', 'plain', 'value', 'waiting']);
  });

  it('reads a named export list, taking the exported name of an alias', () => {
    expect(exportedNames('const a = 1;\nexport { a, a as b };')).toEqual(['a', 'b']);
  });

  it('reads a type-only entry in an export list without its keyword', () => {
    expect(exportedNames('export { type Thing, other };')).toEqual(['Thing', 'other']);
  });

  it('records a bare default under the name it is imported by', () => {
    expect(exportedNames('export default { a: 1 };')).toEqual(['default']);
  });

  it('reads a type-only re-export list, which runtime.ts uses for eight of its names', () => {
    expect(exportedNames("export type { GameState, Save } from './save';")).toEqual(['GameState', 'Save']);
    expect(exportedNames('export type { Thing as PublicThing };')).toEqual(['PublicThing']);
  });

  it('records a star re-export, named when it is aliased', () => {
    expect(exportedNames("export * from './other';")).toEqual(['*']);
    expect(exportedNames("export * as helpers from './other';")).toEqual(['helpers']);
  });

  // The same rule `layers.ts` applies to imports: something commented out is
  // not part of the surface.
  it('ignores an export inside a comment', () => {
    expect(exportedNames('// export const gone = 1;\n/* export const also = 2; */\nexport const here = 3;')).toEqual(['here']);
  });

  // The declaration anchors on line start, so only a block comment whose
  // inner line begins with `export` can tell stripping from not stripping.
  it('ignores an export on its own line inside a block comment', () => {
    expect(exportedNames('/*\nexport const hidden = 1;\n*/\nexport const kept = 2;')).toEqual(['kept']);
  });

  it('ignores a non-exported declaration', () => {
    expect(exportedNames('const private_ = 1;\nfunction helper() {}')).toEqual([]);
  });

  it('reports nothing for a destructured export rather than guessing', () => {
    expect(exportedNames('export const { a, b } = source;')).toEqual([]);
  });
});

describe('resolveImport', () => {
  const files = new Set(['src/a.ts', 'src/b.tsx', 'src/c/index.ts', 'src/d.json']);

  it('finds a typescript module named without its extension', () => {
    expect(resolveImport('src/a', files)).toBe('src/a.ts');
    expect(resolveImport('src/b', files)).toBe('src/b.tsx');
  });

  it('finds a directory import through its index', () => {
    expect(resolveImport('src/c', files)).toBe('src/c/index.ts');
  });

  it('finds a path that is already exact', () => {
    expect(resolveImport('src/d.json', files)).toBe('src/d.json');
  });

  it('returns null for a module outside the tree, which is not an architectural fact', () => {
    expect(resolveImport('src/missing', files)).toBeNull();
  });
});

describe('deriveModules', () => {
  const source = tree({
    'src/grammar/parser.ts': 'export const parse = 1;',
    'src/runtime/save.ts': "import { parse } from '../grammar/parser';\nexport const save = 1;",
    'src/runtime/save.test.ts': "import { save } from './save';\nexport const helper = 1;",
    'docs/workflow.md': '# not source',
  });

  it('attributes each module to its owning system and resolves its imports', () => {
    const modules = deriveModules(manifest, source);
    expect(modules.map((module) => module.path)).toEqual(['src/grammar/parser.ts', 'src/runtime/save.test.ts', 'src/runtime/save.ts']);
    expect(modules.find((module) => module.path === 'src/runtime/save.ts')).toMatchObject({ system: 'Runtime', test: false, imports: ['src/grammar/parser.ts'] });
  });

  it('marks a test module without discarding what it exports', () => {
    const test = deriveModules(manifest, source).find((module) => module.path === 'src/runtime/save.test.ts');
    expect(test).toMatchObject({ test: true, exports: ['helper'] });
  });

  it('ignores a tracked file that is not typescript', () => {
    expect(deriveModules(manifest, source).some((module) => module.path === 'docs/workflow.md')).toBe(false);
  });
});

describe('systemEdges', () => {
  it('records one edge per system pair, carrying the file imports that prove it', () => {
    const modules = deriveModules(
      manifest,
      tree({
        'src/grammar/parser.ts': 'export const parse = 1;',
        'src/runtime/save.ts': "import { parse } from '../grammar/parser';",
        'src/runtime/load.ts': "import { parse } from '../grammar/parser';",
      }),
    );
    expect(systemEdges(modules)).toEqual([
      {
        from: 'Runtime',
        to: 'Grammar',
        imports: [
          { from: 'src/runtime/load.ts', to: 'src/grammar/parser.ts', test: false },
          { from: 'src/runtime/save.ts', to: 'src/grammar/parser.ts', test: false },
        ],
      },
    ]);
  });

  it('does not make an edge out of an import inside one system', () => {
    const modules = deriveModules(manifest, tree({ 'src/runtime/a.ts': "import './b';", 'src/runtime/b.ts': 'export const b = 1;' }));
    expect(systemEdges(modules)).toEqual([]);
  });

  // A dependency only the tests have is a different fact from one the
  // shipped code has, so the edge carries which it is instead of merging them.
  it('marks an edge that exists only in a test', () => {
    const modules = deriveModules(manifest, tree({ 'src/grammar/parser.ts': 'export const parse = 1;', 'src/runtime/save.test.ts': "import { parse } from '../grammar/parser';" }));
    expect(systemEdges(modules)[0].imports.every((edge) => edge.test)).toBe(true);
  });

  it('ignores an import whose target belongs to no system', () => {
    const modules = deriveModules(manifest, tree({ 'src/runtime/save.ts': "import './stray';", 'src/stray.ts': 'export const stray = 1;' }));
    expect(systemEdges(modules)).toEqual([]);
  });
});

describe('systemView', () => {
  const source = tree({
    'src/grammar/parser.ts': 'export const parse = 1;',
    'src/runtime/save.ts': "import { parse } from '../grammar/parser';\nexport const save = 1;\nexport const load = 2;",
    'src/runtime/travel.ts': 'export const travel = 1;',
    'src/runtime/save.test.ts': "import './save';\nexport const helper = 1;",
  });
  const modules = deriveModules(manifest, source);

  it('answers files, exports and both dependency directions for one system', () => {
    const view = systemView(manifest, source, modules, 'Runtime')!;
    expect(view.files).toEqual(['src/runtime/save.ts', 'src/runtime/travel.ts', 'src/runtime/save.test.ts']);
    expect(view.dependsOn.map((edge) => edge.to)).toEqual(['Grammar']);
    expect(view.dependedOnBy).toEqual([]);
    expect(systemView(manifest, source, modules, 'Grammar')!.dependedOnBy.map((edge) => edge.from)).toEqual(['Runtime']);
  });

  it('names the exported surface of production modules, rather than counting it', () => {
    expect(systemView(manifest, source, modules, 'Runtime')!.surface).toEqual([
      { path: 'src/runtime/save.ts', exports: ['load', 'save'] },
      { path: 'src/runtime/travel.ts', exports: ['travel'] },
    ]);
  });

  it('names the files each concept claims, and the production files no concept claims', () => {
    const view = systemView(manifest, source, modules, 'Runtime')!;
    expect(view.concepts.map((entry) => [entry.concept.name, entry.files])).toEqual([['saves', ['src/runtime/save.ts']]]);
    expect(view.unclaimed).toEqual(['src/runtime/travel.ts']);
  });

  it('returns null for a system the manifest does not declare', () => {
    expect(systemView(manifest, source, modules, 'Nope')).toBeNull();
  });
});

describe('regionView', () => {
  const overlapping: Manifest = {
    unowned: { note: '', paths: ['docs'] },
    systems: [
      system('Grammar', ['src/grammar']),
      system('DSL load path', ['src/content']),
      system('Contribution system', ['src/content/modportal.ts'], [{ name: 'mod portal', paths: ['src/content/modportal.ts'], note: 'from a produces claim' }]),
    ],
  };
  const source = tree({
    'src/grammar/parser.ts': 'export const parse = 1;',
    'src/content/universe.ts': 'export const universe = 1;',
    'src/content/registry.ts': "import './modportal';\nimport './universe';",
    'src/content/modportal.ts': "import { parse } from '../grammar/parser';\nexport const portal = 1;",
  });
  const modules = deriveModules(overlapping, source);

  it('reports the single owner and the many coverers of one file', () => {
    const view = regionView(overlapping, source, modules, 'src/content/modportal.ts');
    expect(view.files).toEqual(['src/content/modportal.ts']);
    expect(view.owners).toEqual(['Contribution system']);
    expect(view.coveredBy).toEqual(['DSL load path', 'Contribution system']);
  });

  it('names what a file exports rather than counting it', () => {
    expect(regionView(overlapping, source, modules, 'src/content/modportal.ts').surface).toEqual([{ path: 'src/content/modportal.ts', exports: ['portal'] }]);
  });

  it('reports only the imports that leave the owning system', () => {
    const view = regionView(overlapping, source, modules, 'src/content/modportal.ts');
    expect(view.importsOut).toEqual([{ path: 'src/grammar/parser.ts', system: 'Grammar' }]);
  });

  // The blindness that let `auditPrompt.ts` keep calling a narrowed
  // `resolveActiveSpec`: every file in one system is a sibling, so filtering
  // callers to the cross-system ones deleted every caller a directory can
  // hold. Both kinds are named; which of them crosses is a label.
  it('names a same-system sibling caller as well as a cross-system one, labelling which crosses', () => {
    const callers = tree({
      'src/grammar/parser.ts': 'export const parse = 1;',
      'src/grammar/lexer.ts': "import { parse } from './parser';",
      'src/content/registry.ts': "import { parse } from '../grammar/parser';",
    });
    const view = regionView(overlapping, callers, deriveModules(overlapping, callers), 'src/grammar/parser.ts');
    expect(view.importedBy).toEqual([
      { path: 'src/content/registry.ts', system: 'DSL load path', crossesBoundary: true },
      { path: 'src/grammar/lexer.ts', system: 'Grammar', crossesBoundary: false },
    ]);
  });

  it('leaves a same-system import out of importsOut, since inside a system it is ordinary coupling', () => {
    const view = regionView(overlapping, source, modules, 'src/content/registry.ts');
    expect(view.importsOut).toEqual([{ path: 'src/content/modportal.ts', system: 'Contribution system' }]);
  });

  // The region a planner actually asks about: a directory, whose surface is
  // what they would have to import and whose ownership is not single-valued.
  it('answers for a directory with every file under it, its whole surface and every system it spans', () => {
    const view = regionView(overlapping, source, modules, 'src/content');
    expect(view.files).toEqual(['src/content/universe.ts', 'src/content/registry.ts', 'src/content/modportal.ts']);
    expect(view.owners).toEqual(['Contribution system', 'DSL load path']);
    expect(view.surface).toEqual([
      { path: 'src/content/modportal.ts', exports: ['portal'] },
      { path: 'src/content/universe.ts', exports: ['universe'] },
    ]);
  });

  // Inside the region the boundary crossing is not the reader's business:
  // they asked about the region, and `registry.ts -> modportal.ts` is a
  // dependency it already contains.
  it('leaves an import whose target is inside the region out of both directions', () => {
    const view = regionView(overlapping, source, modules, 'src/content');
    expect(view.importsOut).toEqual([{ path: 'src/grammar/parser.ts', system: 'Grammar' }]);
    expect(view.importedBy).toEqual([]);
  });

  it('reads a windows separator and a trailing slash as the same region', () => {
    expect(regionView(overlapping, source, modules, 'src\\content\\modportal.ts').owners).toEqual(['Contribution system']);
    expect(regionView(overlapping, source, modules, 'src/content/').files).toHaveLength(3);
  });

  // A write grant names a file before anyone has written it, and ownership
  // is declared over regions, so the answer is the system that will own it.
  it('still names the owner of a path the tree does not hold', () => {
    const view = regionView(overlapping, source, modules, 'src/content/planned.ts');
    expect(view).toMatchObject({ files: [], owners: ['DSL load path'], surface: [], importsOut: [], importedBy: [] });
  });

  it('answers for a path no system owns instead of refusing', () => {
    const view = regionView(overlapping, source, modules, 'docs/workflow.md');
    expect(view).toMatchObject({ owners: [], coveredBy: [], surface: [], importsOut: [], importedBy: [] });
  });
});

// Real-seam tests: these reach git and the disk on purpose, because the seam
// is the only part a fixture cannot exercise, and both defects they pin lived
// exactly there.
describe('repoSourceTree', () => {
  it('lists only files that are actually there', () => {
    expect(repoSourceTree().files.filter((file) => !existsSync(file))).toEqual([]);
  });

  it('reads every typescript file it listed', () => {
    const tree = repoSourceTree();
    const sources = tree.files.filter((file) => /[.]tsx?$/.test(file));
    expect(sources.length).toBeGreaterThan(0);
    expect(() => sources.forEach((file) => tree.read(file))).not.toThrow();
  });
});

// A NUL makes a file binary to git and to grep: no diff to review on any pull
// request, no line numbers from ripgrep, and a whole-file conflict when two
// branches touch disjoint lines. One reached this branch's own audit inside a
// template literal that was meant to hold a separator, and nothing noticed
// because every other check reads the file through a parser that does not care.
describe('the tracked source tree', () => {
  const TEXTUAL = new Set([9, 10, 13]);

  it('holds no control byte that would make a file binary to git', () => {
    const offenders = repoSourceTree()
      .files.filter((file) => /[.]tsx?$/.test(file))
      .filter((file) => readFileSync(file).some((byte) => byte < 32 && !TEXTUAL.has(byte)));
    expect(offenders).toEqual([]);
  });
});
