import { join } from 'node:path';
import { posix } from './sourceFiles';
import { stripComments } from './stripComments';

export const LAYERS = ['grammar', 'content', 'runtime', 'ui', 'scripts'] as const;
export type Layer = (typeof LAYERS)[number];

export const ROOTS: Record<Layer, string> = {
  grammar: 'src/grammar',
  content: 'src/content',
  runtime: 'src/runtime',
  ui: 'src/ui',
  scripts: 'scripts',
};

const DEPTH: Record<Layer, number> = { grammar: 0, content: 1, runtime: 2, ui: 3, scripts: 4 };

export const pointsUpward = (from: Layer, to: Layer): boolean => DEPTH[to] > DEPTH[from];

// Every way a module can name another one: `from`, a bare or dynamic `import`,
// and `require`, in any of the three quote styles — nothing in this repo pins
// one, so matching a single style is matching a coding habit rather than a rule.
const IMPORT_PATTERN = /\b(?:from|import|require)\s*\(?\s*(['"`])(\.[^'"`]*)\1/g;

// A directory import names the layer root itself, with the index file implied.
export function layerOf(path: string): Layer | null {
  const normalized = posix(path);
  return LAYERS.find((layer) => normalized === ROOTS[layer] || normalized.startsWith(`${ROOTS[layer]}/`)) ?? null;
}

// Comments are blanked first, so an import someone commented out is not an
// import. String literals stay, because a dynamic `import()` lives in one.
export function importedPaths(fromFile: string, source: string): string[] {
  const directory = posix(fromFile).replace(/\/[^/]*$/, '');
  return [...stripComments(source).join('\n').matchAll(IMPORT_PATTERN)].map(([, , specifier]) => posix(join(directory, specifier)));
}
