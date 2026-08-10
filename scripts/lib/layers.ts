import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { posix, trackedFiles } from './sourceFiles';
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
// stack's world by being a module under one of these, and the roots then decide
// which layer it is; the two being separate is what lets a file belong to no
// root and still be seen. Every root lies under one of these, which is a test
// rather than a rule anyone has to remember.
export const SOURCE_TREES: readonly string[] = ['src', 'scripts'];

// What the loader would treat as a module. Wider than the tree currently holds:
// a `.js` module dropped into `src/` is source that imports, and a sweep that
// reads only what is there today is a sweep that stops being a partition the
// first time someone adds a file.
export const MODULE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

// Swept modules deliberately not part of the layered stack, each against the
// reason it is out. Matched by exact path, never by prefix, so a directory
// cannot be exempted and a file created next to one of these joins nothing —
// and the reason is what keeps this from being the cheap way past the gate.
export const OUTSIDE_STACK: Readonly<Record<string, string>> = {
  'src/vite-env.d.ts': 'an ambient declaration for the bundler, with no runtime and nothing to import',
};

const DEPTH: Record<Layer, number> = { grammar: 0, content: 1, runtime: 2, ui: 3, scripts: 4 };

export const pointsUpward = (from: Layer, to: Layer): boolean => DEPTH[to] > DEPTH[from];

// Every way a module can name another one: `from`, a bare or dynamic `import`,
// and `require`, in any of the three quote styles — nothing in this repo pins
// one, so matching a single style is matching a coding habit rather than a rule.
const IMPORT_PATTERN = /\b(?:from|import|require)\s*\(?\s*(['"`])(\.[^'"`]*)\1/g;

const withoutExtension = (path: string): string => {
  const extension = MODULE_EXTENSIONS.find((candidate) => path.endsWith(candidate));
  return extension === undefined ? path : path.slice(0, -extension.length);
};

// A root naming a file claims that file and no more. Both spellings of it
// resolve, because `tsconfig.json` sets no `allowImportingTsExtensions` and so
// `../main` is the only spelling a source file can write for `src/main.tsx` —
// but the extensionless form is a name, not a directory prefix, and treating it
// as one would let a whole `src/main/` tree inherit a layer it never declared.
const namesFile = (root: string): boolean => MODULE_EXTENSIONS.some((extension) => root.endsWith(extension));
const claims = (root: string, file: string): boolean => (namesFile(root) ? withoutExtension(root) === withoutExtension(file) : covers(root, file));

// A directory import names the layer root itself, with the index file implied.
export function layerOf(path: string): Layer | null {
  const file = posix(path);
  return LAYERS.find((layer) => ROOTS[layer].some((root) => claims(root, file))) ?? null;
}

// Comments are blanked first, so an import someone commented out is not an
// import. String literals stay, because a dynamic `import()` lives in one.
export function importedPaths(fromFile: string, source: string): string[] {
  const directory = posix(fromFile).replace(/\/[^/]*$/, '');
  return [...stripComments(source).join('\n').matchAll(IMPORT_PATTERN)].map(([, , specifier]) => posix(join(directory, specifier)));
}

// Which of the repository's files the layer rule owes an answer about. Drawn
// from the tracked set rather than from a walk of its own, so that the rule and
// `audit-status` — the partition c7 is modelled on — disagree about no file.
// Tracked *and* present, for the reason `repoSourceTree` gives: the index still
// lists a file deleted or renamed in the working tree, and a rule that reads
// what is not there dies on an ordinary intermediate state instead of reporting.
export function sweptFiles(tracked: readonly string[], exists: (file: string) => boolean = existsSync): string[] {
  return tracked.map(posix).filter((file) => SOURCE_TREES.some((tree) => covers(tree, file)) && MODULE_EXTENSIONS.some((extension) => file.endsWith(extension)) && exists(file));
}

// Swept modules belonging to no layer and declared outside none: the file the
// layer rule reads in neither direction, and cannot report on because it never
// visited it.
export function unlayeredFiles(files: readonly string[], outside: Readonly<Record<string, string>> = OUTSIDE_STACK): string[] {
  return files.map(posix).filter((file) => layerOf(file) === null && outside[file] === undefined);
}

export interface Violation {
  from: string;
  to: string;
}

export interface LayerReport {
  // Files actually opened, which is fewer than were swept whenever one of them
  // belongs to no layer: a claim of what was read has to be the count of what
  // was read, or the run reports coverage it did not have.
  read: number;
  edges: number;
  violations: Violation[];
  unlayered: string[];
}

// Reading is passed in, so the whole decision — which files were seen, which
// belong nowhere, which imports climb — is exercised without a tree on disk.
export function checkLayers(files: readonly string[], read: (file: string) => string, outside: Readonly<Record<string, string>> = OUTSIDE_STACK): LayerReport {
  const violations: Violation[] = [];
  let edges = 0;
  let opened = 0;
  for (const file of files) {
    const layer = layerOf(file);
    if (layer === null) continue;
    opened++;
    for (const target of importedPaths(file, read(file))) {
      const targetLayer = layerOf(target);
      if (targetLayer === null) continue;
      edges++;
      if (pointsUpward(layer, targetLayer)) violations.push({ from: posix(file), to: target });
    }
  }
  return { read: opened, edges, violations, unlayered: unlayeredFiles(files, outside) };
}

export interface LayerCheckOutput {
  out: string[];
  err: string[];
  exitCode: number;
}

// What the run says and what it exits with, decided here rather than in the
// runner: the three things c7 promises — that every module was read, that an
// unplaced one fails the run, and that it is named — are only assertable where
// a test can reach them, and above this there is nothing left but the console.
export function layerCheckOutput(files: readonly string[], report: LayerReport): LayerCheckOutput {
  const out = [`${files.length} module(s) swept under ${SOURCE_TREES.join(' and ')}, ${report.read} read; ${report.edges} cross-file imports checked across ${LAYERS.length} layers (${LAYERS.join(' < ')}).`];
  const err: string[] = [];

  // A sweep that found nothing is a broken sweep, not a clean tree, and the two
  // are otherwise the same green run — which is the whole failure mode a
  // partition assertion exists to prevent.
  if (files.length === 0) err.push('\nThe sweep found no modules at all. That is a broken enumeration, not a clean tree: this repository has source under every declared tree.');

  if (report.violations.length > 0) {
    err.push(`\n${report.violations.length} import(s) point upward. A layer may import the layers below it and itself, never above:`);
    for (const violation of report.violations) err.push(`  ${violation.from} -> ${violation.to}`);
    err.push('Fix the import, or move the code: a file that needs something from above usually holds two layers’ work.');
  }

  if (report.unlayered.length > 0) {
    err.push(`\n${report.unlayered.length} module(s) belong to no declared root, so no import of theirs is read in either direction:`);
    for (const file of report.unlayered) err.push(`  ${file}`);
    err.push('Put each under a layer root in ROOTS (scripts/lib/layers.ts). A module that genuinely has no layer joins OUTSIDE_STACK beside the reason it is out, which a reviewer reads.');
  }

  if (err.length > 0) return { out, err, exitCode: 1 };
  return { out: [...out, 'Every module belongs to a layer, and every import points downward.'], err, exitCode: 0 };
}

export interface LayerCheckEffects {
  tracked: () => string[];
  exists: (file: string) => boolean;
  read: (file: string) => string;
}

// The composition, here rather than in the runner: which enumeration feeds the
// sweep is a decision, and left above this it was four lines no test could
// reach — an empty sweep and a discarded exit code both survived the suite.
export function runLayerCheck(effects: LayerCheckEffects = { tracked: trackedFiles, exists: existsSync, read: (file) => readFileSync(file, 'utf8') }): LayerCheckOutput {
  const files = sweptFiles(effects.tracked(), effects.exists);
  return layerCheckOutput(files, checkLayers(files, effects.read));
}
