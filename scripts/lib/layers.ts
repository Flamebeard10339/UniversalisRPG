import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findCycles, type Cycle } from './acyclic';
import { posix, trackedFiles } from './sourceFiles';
import { stripComments } from './stripComments';

export const covers = (path: string, file: string): boolean => (path.startsWith('*.') ? file.endsWith(path.slice(1)) && !file.includes('/') : file === path || file.startsWith(`${path}/`));

export const LAYERS = ['grammar', 'content', 'runtime', 'ui', 'scripts'] as const;
export type Layer = (typeof LAYERS)[number];

export const ROOTS: Record<Layer, readonly string[]> = {
  grammar: ['src/grammar'],
  content: ['src/content'],
  runtime: ['src/runtime'],
  ui: ['src/ui', 'src/main.tsx'],
  scripts: ['scripts'],
};

export const SOURCE_TREES: readonly string[] = ['src', 'scripts'];

export const MODULE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

export const OUTSIDE_STACK: Readonly<Record<string, string>> = {
  'src/vite-env.d.ts': 'an ambient declaration for the bundler, with no runtime and nothing to import',
};

export const pointsUpward = (from: Layer, to: Layer): boolean => LAYERS.indexOf(to) > LAYERS.indexOf(from);

const IMPORT_PATTERN = /\b(?:from|import|require)\s*\(?\s*(['"`])(\.[^'"`]*)\1/g;

const withoutExtension = (path: string): string => {
  const extension = MODULE_EXTENSIONS.find((candidate) => path.endsWith(candidate));
  return extension === undefined ? path : path.slice(0, -extension.length);
};

const namesFile = (root: string): boolean => MODULE_EXTENSIONS.some((extension) => root.endsWith(extension));
const claims = (root: string, file: string): boolean => (namesFile(root) ? withoutExtension(root) === withoutExtension(file) : covers(root, file));

export function layerOf(path: string): Layer | null {
  const file = posix(path);
  return LAYERS.find((layer) => ROOTS[layer].some((root) => claims(root, file))) ?? null;
}

export function importedPaths(fromFile: string, source: string): string[] {
  const directory = posix(fromFile).replace(/\/[^/]*$/, '');
  return [...stripComments(source, posix(fromFile)).join('\n').matchAll(IMPORT_PATTERN)].map(([, , specifier]) => posix(join(directory, specifier)));
}

export function sweptFiles(tracked: readonly string[], exists: (file: string) => boolean = existsSync): string[] {
  return tracked.map(posix).filter((file) => SOURCE_TREES.some((tree) => covers(tree, file)) && MODULE_EXTENSIONS.some((extension) => file.endsWith(extension)) && exists(file));
}

export function shippedModules(tracked: readonly string[] = trackedFiles(), exists: (file: string) => boolean = existsSync): string[] {
  return sweptFiles(tracked, exists).filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file));
}

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
  cycles: Cycle[];
  read: number;
  edges: number;
  violations: Violation[];
  unlayered: string[];
}

export function checkLayers(files: readonly string[], read: (file: string) => string, outside: Readonly<Record<string, string>> = OUTSIDE_STACK): LayerReport {
  const violations: Violation[] = [];
  let edges = 0;
  let opened = 0;
  const swept = new Set(files.map(posix));
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

export function runLayerCheck(effects: LayerCheckEffects = { tracked: trackedFiles, exists: existsSync, read: (file) => readFileSync(file, 'utf8') }): LayerCheckOutput {
  const files = sweptFiles(effects.tracked(), effects.exists);
  return layerCheckOutput(files, checkLayers(files, effects.read));
}
