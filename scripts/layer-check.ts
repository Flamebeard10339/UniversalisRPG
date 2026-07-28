import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, relative } from 'node:path';

const LAYERS = ['grammar', 'content', 'runtime', 'ui', 'scripts'] as const;
type Layer = (typeof LAYERS)[number];

const DEPTH: Record<Layer, number> = {
  grammar: 0,
  content: 1,
  runtime: 2,
  ui: 3,
  scripts: 4,
};

const ROOTS: Record<Layer, string> = {
  grammar: 'src/grammar',
  content: 'src/content',
  runtime: 'src/runtime',
  ui: 'src/ui',
  scripts: 'scripts',
};

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*'(\.[^']*)'/g;

interface Violation {
  from: string;
  to: string;
}

function sourceFiles(directory: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(path);
  }
  return found;
}

function posix(path: string): string {
  return normalize(path).replace(/\\/g, '/');
}

function layerOf(path: string): Layer | null {
  const normalized = posix(path);
  return LAYERS.find((layer) => normalized.startsWith(`${ROOTS[layer]}/`)) ?? null;
}

function resolveSpecifier(fromFile: string, specifier: string): string {
  return posix(join(posix(fromFile).replace(/\/[^/]*$/, ''), specifier));
}

const violations: Violation[] = [];
let edges = 0;

for (const layer of LAYERS) {
  for (const file of sourceFiles(ROOTS[layer])) {
    const source = readFileSync(file, 'utf8');
    for (const [, specifier] of source.matchAll(IMPORT_PATTERN)) {
      const target = resolveSpecifier(file, specifier);
      const targetLayer = layerOf(target);
      if (targetLayer === null) continue;
      edges++;
      if (DEPTH[targetLayer] > DEPTH[layer]) violations.push({ from: posix(relative(process.cwd(), file)), to: target });
    }
  }
}

for (const violation of violations) console.error(`${violation.from} -> ${violation.to}`);

console.log(
  `${edges} cross-file imports checked across ${LAYERS.length} layers ` +
    `(${LAYERS.map((layer) => layer).join(' < ')}).`,
);

if (violations.length > 0) {
  console.error(
    `\n${violations.length} import(s) point upward. A layer may import the layers below it and itself, never above.\n` +
      `Fix the import, or move the code: a file that needs something from above usually holds two layers' work.`,
  );
  process.exit(1);
}

console.log('Every import points downward.');
