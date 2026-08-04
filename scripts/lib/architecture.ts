import { existsSync, readFileSync } from 'node:fs';
import { importedPaths } from './layers';
import { posix, trackedFiles } from './sourceFiles';
import { stripComments } from './stripComments';
import { canonicalPath, conceptsClaiming, covers, coveringSystems, ownerOf, type Concept, type Manifest, type System } from './systems';

// Everything here is computed from the tree at call time and written back
// nowhere. A stored architecture map is a second model of the same code that
// somebody has to keep in agreement with it; the manifest holds only what
// cannot be derived — what a system is *for*, and what it is *supposed* to
// own — and this module answers the rest by looking.

// The effect, passed in as data. `files` is the universe of tracked paths and
// `read` is the only way this module reaches a disk, so every function below
// is pure over a fixture and needs no temp repo to test.
export interface SourceTree {
  files: string[];
  read: (path: string) => string;
}

const SOURCE = /\.tsx?$/;
const TEST = /\.test\.tsx?$/;

const isSourceFile = (path: string): boolean => SOURCE.test(path);
const isTestFile = (path: string): boolean => TEST.test(path);

// Tracked *and* present. `git ls-files` answers from the index, so a file
// deleted or renamed in the working tree is still listed while nothing is
// there to read — which is the state a worker is in at the moment it asks
// where something lives. A view derived from the tree describes the tree as
// it is, so what is not there is not in it, and the read still answers.
export function repoSourceTree(): SourceTree {
  const files = trackedFiles()
    .map(posix)
    .filter((file) => existsSync(file));
  return { files, read: (path) => readFileSync(path, 'utf8') };
}

// An import names a module, not a file: `./save` is `save.ts`, `save.tsx` or
// `save/index.ts` depending on what exists. Resolving it matters here because
// a system that declares an exact file never matches an unresolved specifier.
export function resolveImport(specifier: string, files: ReadonlySet<string>): string | null {
  for (const candidate of [specifier, `${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`, `${specifier}/index.tsx`]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

const DECLARATION = /^\s*export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\s*\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
const NAMED_LIST = /^\s*export\s*(?:type\s*)?\{([^}]*)\}/gm;
const STAR_REEXPORT = /^\s*export\s*\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s*)?from/gm;
const BARE_DEFAULT = /^\s*export\s+default\s+(?!(?:async\s+)?(?:function|class)\s+[A-Za-z_$])/m;

// The public surface as names. Comments are blanked first, so an export
// somebody commented out is not an export — the same reason `layers.ts`
// strips before matching imports.
//
// Deliberately syntactic and deliberately not a type checker: this feeds a
// report, and the alternative is a TypeScript program per invocation. What it
// does not see is a destructured export (`export const { a, b } = x`), which
// reports nothing rather than guessing.
export function exportedNames(source: string): string[] {
  const code = stripComments(source).join('\n');
  const names = new Set<string>();
  for (const [, name] of code.matchAll(DECLARATION)) names.add(name);
  for (const [, list] of code.matchAll(NAMED_LIST)) {
    for (const entry of list.split(',')) {
      const parts = entry.trim().split(/\s+as\s+/);
      const name = (parts[parts.length - 1] ?? '').trim().replace(/^type\s+/, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  for (const [, alias] of code.matchAll(STAR_REEXPORT)) names.add(alias ?? '*');
  if (BARE_DEFAULT.test(code)) names.add('default');
  return [...names].sort();
}

export interface Module {
  path: string;
  system: string | null;
  test: boolean;
  exports: string[];
  // Repo-relative paths, resolved against the tree. An import this could not
  // resolve is dropped rather than guessed at — a package import is not a
  // fact about this repository's architecture.
  imports: string[];
}

export function deriveModules(manifest: Manifest, tree: SourceTree): Module[] {
  const known = new Set(tree.files);
  return tree.files
    .filter(isSourceFile)
    .map((path) => {
      const source = tree.read(path);
      return {
        path,
        system: ownerOf(manifest, path)?.system.name ?? null,
        test: isTestFile(path),
        exports: exportedNames(source),
        imports: [...new Set(importedPaths(path, source).map((target) => resolveImport(target, known)).filter((target): target is string => target !== null))].sort(),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export interface ImportEdge {
  from: string;
  to: string;
  test: boolean;
}

export interface SystemEdge {
  from: string;
  to: string;
  imports: ImportEdge[];
}

// The observed dependency graph, as against the one anybody believes in. A
// system importing itself is not an edge; a file importing across a system
// boundary is.
export function systemEdges(modules: Module[]): SystemEdge[] {
  const byPath = new Map(modules.map((module) => [module.path, module]));
  const edges = new Map<string, SystemEdge>();
  for (const module of modules) {
    if (module.system === null) continue;
    for (const target of module.imports) {
      const to = byPath.get(target)?.system ?? null;
      if (to === null || to === module.system) continue;
      const key = JSON.stringify([module.system, to]);
      if (!edges.has(key)) edges.set(key, { from: module.system, to, imports: [] });
      edges.get(key)!.imports.push({ from: module.path, to: target, test: module.test });
    }
  }
  return [...edges.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

export interface ConceptView {
  concept: Concept;
  files: string[];
}

export interface ModuleSurface {
  path: string;
  exports: string[];
}

// The names, not a total. Every caller that used to reduce this to a number
// was discarding the one thing the caller then had to go and look up by
// hand: what a region would make you import. Modules arrive path-sorted from
// `deriveModules`, and one exporting nothing is not part of a surface.
export function exportedSurface(modules: Module[]): ModuleSurface[] {
  return modules.filter((module) => module.exports.length > 0).map((module) => ({ path: module.path, exports: module.exports }));
}

export interface SystemView {
  system: System;
  // Every tracked file the system owns, not only its source: a workflow file
  // or a fixture is membership too.
  files: string[];
  modules: Module[];
  surface: ModuleSurface[];
  dependsOn: SystemEdge[];
  dependedOnBy: SystemEdge[];
  concepts: ConceptView[];
  // Owned source files no concept claims — what the registry does not yet
  // describe, which is the honest answer to "is this system mapped".
  unclaimed: string[];
}

export function systemView(manifest: Manifest, tree: SourceTree, modules: Module[], name: string): SystemView | null {
  const system = manifest.systems.find((candidate) => candidate.name === name);
  if (system === undefined) return null;

  const files = tree.files.filter((file) => ownerOf(manifest, file)?.system.name === name);
  const own = modules.filter((module) => module.system === name);
  const edges = systemEdges(modules);

  const concepts = system.concepts.map((concept) => ({ concept, files: files.filter((file) => concept.paths.some((path) => covers(path, file))) }));

  return {
    system,
    files,
    modules: own,
    // A test file's exports are helpers for itself, never surface anyone
    // else may depend on, so a system's is of production modules. Every
    // module still carries its own exports — the policy lives here, in the
    // summary, rather than being hidden in what was collected.
    surface: exportedSurface(own.filter((module) => !module.test)),
    dependsOn: edges.filter((edge) => edge.from === name),
    dependedOnBy: edges.filter((edge) => edge.to === name),
    concepts,
    unclaimed: files.filter((file) => isSourceFile(file) && !isTestFile(file) && conceptsClaiming(system, file).length === 0),
  };
}

export interface RegionView {
  path: string;
  // Every tracked file at or beneath the queried path: the file itself when
  // the query names one, the whole region when it names a directory, and
  // nothing when the tree does not hold it — which is the honest answer for
  // a write grant on a file nobody has written yet.
  files: string[];
  // Not single-valued, because a directory can straddle two systems and
  // naming one of them would be a wrong answer rather than a short one.
  owners: string[];
  coveredBy: string[];
  surface: ModuleSurface[];
  // Only the imports that leave the region's owning system. Everything
  // inside it is ordinary coupling; what crosses a boundary is the
  // architectural fact.
  importsOut: Array<{ path: string; system: string }>;
  importedBy: Array<{ path: string; system: string }>;
}

export function regionView(manifest: Manifest, tree: SourceTree, modules: Module[], path: string): RegionView {
  const target = canonicalPath(posix(path));
  const files = tree.files.filter((file) => covers(target, file));
  const inRegion = new Set(files);
  const own = modules.filter((module) => inRegion.has(module.path));
  const byPath = new Map(modules.map((candidate) => [candidate.path, candidate]));

  // A path the tree does not hold is still owned: `systems.json` declares
  // regions, not files, so ownership answers for a file that is only planned.
  const claimants = files.length > 0 ? files : [target];

  const importsOut = new Map<string, string>();
  for (const module of own) {
    for (const to of module.imports) {
      const system = byPath.get(to)?.system ?? null;
      if (inRegion.has(to) || system === null || system === module.system) continue;
      importsOut.set(to, system);
    }
  }

  return {
    path: target,
    files,
    owners: [...new Set(claimants.map((file) => ownerOf(manifest, file)?.system.name).filter((name): name is string => name !== undefined))].sort(),
    coveredBy: [...new Set(claimants.flatMap((file) => coveringSystems(manifest, file)))],
    surface: exportedSurface(own),
    importsOut: [...importsOut].map(([to, system]) => ({ path: to, system })),
    importedBy: modules
      .filter((candidate) => !inRegion.has(candidate.path) && candidate.system !== null)
      .filter((candidate) => candidate.imports.some((to) => inRegion.has(to) && byPath.get(to)?.system !== candidate.system))
      .map((candidate) => ({ path: candidate.path, system: candidate.system as string })),
  };
}
