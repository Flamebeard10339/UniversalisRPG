import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findCycles, type Cycle } from './acyclic';
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
// root and still be seen.
export const SOURCE_TREES: readonly string[] = ['src', 'scripts'];

// What the loader would treat as a module — deliberately wider than the tree
// currently holds, since a sweep that knows only the extensions already present
// stops being a partition the first time someone adds a file.
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

// Both spellings of a file root resolve, because `tsconfig.json` sets no
// `allowImportingTsExtensions`: `../main` is the only spelling a source file can
// write for `src/main.tsx`. The extensionless form is a name, not a prefix.
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
// from the tracked set rather than from a walk of its own, so that this rule and
// `audit-status` disagree about no file — and tracked *and* present, because the
// index still lists one deleted or renamed in the working tree.
export function sweptFiles(tracked: readonly string[], exists: (file: string) => boolean = existsSync): string[] {
  return tracked.map(posix).filter((file) => SOURCE_TREES.some((tree) => covers(tree, file)) && MODULE_EXTENSIONS.some((extension) => file.endsWith(extension)) && exists(file));
}

// The same enumeration with the tests taken out: what a rule about the code
// this repository ships is owed an answer over. A rule that walks one tree of
// its own reaches whichever driver that tree happens to hold and no other —
// which is how three mutations to `scripts/` survived a brand rule that walked
// `src`.
export function shippedModules(tracked: readonly string[] = trackedFiles(), exists: (file: string) => boolean = existsSync): string[] {
  return sweptFiles(tracked, exists).filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file));
}

// A specifier names a module, not a file. Resolved against what was swept so
// that the graph holds only edges the loader would take — the same list the
// rule above walks, so the two cannot disagree about what an import points at.
export function resolveModule(specifier: string, swept: ReadonlySet<string>): string | null {
  for (const candidate of [specifier, ...MODULE_EXTENSIONS.map((extension) => `${specifier}${extension}`), ...MODULE_EXTENSIONS.map((extension) => `${specifier}/index${extension}`)]) {
    if (swept.has(candidate)) return candidate;
  }
  return null;
}

export function unlayeredFiles(files: readonly string[], outside: Readonly<Record<string, string>> = OUTSIDE_STACK): string[] {
  return files.map(posix).filter((file) => layerOf(file) === null && outside[file] === undefined);
}

export interface Violation {
  from: string;
  to: string;
}

export interface LayerReport {
  // Groups of modules that import each other around, which is the one shape
  // that has no reading order: a component of two or more can only be
  // understood whole. Empty is the only passing value, and it is not a
  // threshold — it is the size at which "read this first" has an answer.
  cycles: Cycle[];
  // Files opened, which is fewer than were swept whenever one belongs to no
  // layer — a count of the sweep would report coverage the run did not have.
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
  const swept = new Set(files.map(posix));
  // The cycle rule answers over what the repository ships. A test importing
  // its subject cannot produce the initialisation-order defect this exists to
  // stop, because nothing ships that graph.
  const shipped = shippedModules(files, () => true);
  const out = new Map<string, string[]>();
  for (const file of files) {
    const layer = layerOf(file);
    if (layer === null) continue;
    opened++;
    const targets = importedPaths(file, read(file));
    out.set(posix(file), [...new Set(targets.map((target) => resolveModule(target, swept)).filter((target): target is string => target !== null))]);
    for (const target of targets) {
      const targetLayer = layerOf(target);
      if (targetLayer === null) continue;
      edges++;
      if (pointsUpward(layer, targetLayer)) violations.push({ from: posix(file), to: target });
    }
  }
  const inShipped = new Set(shipped);
  const cycles = findCycles(shipped, (node) => (out.get(node) ?? []).filter((target) => inShipped.has(target)));
  return { read: opened, edges, violations, cycles, unlayered: unlayeredFiles(files, outside) };
}

export interface LayerCheckOutput {
  out: string[];
  err: string[];
  exitCode: number;
}

// What the run says and what it exits with. Above this there is nothing left
// but the console, which is what makes the exit code assertable.
export function layerCheckOutput(files: readonly string[], report: LayerReport): LayerCheckOutput {
  const out = [`${files.length} module(s) swept under ${SOURCE_TREES.join(' and ')}, ${report.read} read; ${report.edges} cross-file imports checked across ${LAYERS.length} layers (${LAYERS.join(' < ')}).`];
  const err: string[] = [];

  if (files.length === 0) err.push('\nThe sweep found no modules at all. That is a broken enumeration, not a clean tree: this repository has source under every declared tree.');

  if (report.violations.length > 0) {
    err.push(`\n${report.violations.length} import(s) point upward. A layer may import the layers below it and itself, never above:`);
    for (const violation of report.violations) err.push(`  ${violation.from} -> ${violation.to}`);
    err.push('Fix the import, or move the code: a file that needs something from above usually holds two layers’ work.');
  }

  if (report.cycles.length > 0) {
    const onCycles = report.cycles.reduce((total, cycle) => total + cycle.members.length, 0);
    err.push(`
${report.cycles.length} import cycle(s), holding ${onCycles} module(s). A cycle has no reading order: every module on one has to be understood with all the others, and none of them can be initialised first.`);
    for (const cycle of report.cycles) {
      err.push(`  ${cycle.members.length} modules:`);
      for (const member of cycle.members) err.push(`    ${member}`);
      err.push(`  closed by ${cycle.closedBy.length} import(s) — invert or move these and the rest becomes an order:`);
      for (const edge of cycle.closedBy) err.push(`    ${edge.from} -> ${edge.to}`);
    }
    err.push('Move the declaration down rather than adding an indirection: where two modules both need a shape, the shape belongs beneath both.');
  }

  if (report.unlayered.length > 0) {
    err.push(`\n${report.unlayered.length} module(s) belong to no declared root, so no import of theirs is read in either direction:`);
    for (const file of report.unlayered) err.push(`  ${file}`);
    err.push('Put each under a layer root in ROOTS (scripts/lib/layers.ts). A module that genuinely has no layer joins OUTSIDE_STACK beside the reason it is out, which a reviewer reads.');
  }

  if (err.length > 0) return { out, err, exitCode: 1 };
  return { out: [...out, 'Every module belongs to a layer, every import points downward, and no module imports its way back to itself.'], err, exitCode: 0 };
}

export interface LayerCheckEffects {
  tracked: () => string[];
  exists: (file: string) => boolean;
  read: (file: string) => string;
}

// The composition, here rather than in the runner: which enumeration feeds the
// sweep is a decision, and a decision above this line is one no test can reach.
export function runLayerCheck(effects: LayerCheckEffects = { tracked: trackedFiles, exists: existsSync, read: (file) => readFileSync(file, 'utf8') }): LayerCheckOutput {
  const files = sweptFiles(effects.tracked(), effects.exists);
  return layerCheckOutput(files, checkLayers(files, effects.read));
}
