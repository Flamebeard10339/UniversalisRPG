import { join } from 'node:path';
import { posix } from './sourceFiles';
import { stripComments } from './stripComments';
import { covers } from './systems';

export const LAYERS = ['grammar', 'content', 'runtime', 'ui', 'scripts'] as const;
export type Layer = (typeof LAYERS)[number];

export const ROOTS: Record<Layer, readonly string[]> = {
  grammar: ['src/grammar'],
  content: ['src/content'],
  runtime: ['src/runtime'],
  ui: ['src/ui', 'src/main.tsx'],
  scripts: ['scripts'],
};

// What the sweep enumerates, as against what the roots claim. A file is in the
// stack's world by being source under one of these, and the roots then decide
// which layer it is; the two being separate is what lets a file belong to no
// root and still be seen.
export const SOURCE_TREES: readonly string[] = ['src', 'scripts'];

// Swept source that is deliberately not part of the layered stack. Matched by
// exact path, never by prefix, so a directory cannot be exempted and a file
// created next to one of these joins nothing.
export const OUTSIDE_STACK: readonly string[] = ['src/vite-env.d.ts'];

const DEPTH: Record<Layer, number> = { grammar: 0, content: 1, runtime: 2, ui: 3, scripts: 4 };

export const pointsUpward = (from: Layer, to: Layer): boolean => DEPTH[to] > DEPTH[from];

// Every way a module can name another one: `from`, a bare or dynamic `import`,
// and `require`, in any of the three quote styles — nothing in this repo pins
// one, so matching a single style is matching a coding habit rather than a rule.
const IMPORT_PATTERN = /\b(?:from|import|require)\s*\(?\s*(['"`])(\.[^'"`]*)\1/g;

// A directory import names the layer root itself, with the index file implied.
export function layerOf(path: string): Layer | null {
  const file = posix(path);
  return LAYERS.find((layer) => ROOTS[layer].some((root) => covers(root, file))) ?? null;
}

// Comments are blanked first, so an import someone commented out is not an
// import. String literals stay, because a dynamic `import()` lives in one.
export function importedPaths(fromFile: string, source: string): string[] {
  const directory = posix(fromFile).replace(/\/[^/]*$/, '');
  return [...stripComments(source).join('\n').matchAll(IMPORT_PATTERN)].map(([, , specifier]) => posix(join(directory, specifier)));
}

// Swept source belonging to no layer and declared outside none: the file the
// layer rule reads in neither direction, and cannot report on because it never
// visited it.
export function unlayeredFiles(files: readonly string[], outside: readonly string[] = OUTSIDE_STACK): string[] {
  const declared = new Set(outside.map(posix));
  return files.map(posix).filter((file) => layerOf(file) === null && !declared.has(file));
}

export interface Violation {
  from: string;
  to: string;
}

export interface LayerReport {
  edges: number;
  violations: Violation[];
  unlayered: string[];
}

// Reading is passed in, so the whole decision — which files were seen, which
// belong nowhere, which imports climb — is exercised without a tree on disk.
export function checkLayers(files: readonly string[], read: (file: string) => string, outside: readonly string[] = OUTSIDE_STACK): LayerReport {
  const violations: Violation[] = [];
  let edges = 0;
  for (const file of files) {
    const layer = layerOf(file);
    if (layer === null) continue;
    for (const target of importedPaths(file, read(file))) {
      const targetLayer = layerOf(target);
      if (targetLayer === null) continue;
      edges++;
      if (pointsUpward(layer, targetLayer)) violations.push({ from: posix(file), to: target });
    }
  }
  return { edges, violations, unlayered: unlayeredFiles(files, outside) };
}
