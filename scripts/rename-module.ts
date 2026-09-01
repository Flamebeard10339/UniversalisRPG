import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic } from '../src/content/registry';
import { CORPUS_DIR } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { covers } from './lib/layers';
import { occurrencesOf } from './lib/idForms';
import { posix, trackedFiles } from './lib/sourceFiles';

export { occurrencesOf };

export const SCOPE: readonly string[] = [CORPUS_DIR, 'src', 'scripts', 'package.json'];

const CORPUS = CORPUS_DIR;
const MODULE_EXTENSION = '.dsl';

export interface TextFile {
  path: string;
  text: string;
}

export interface RenameReport {
  lines: string[];
  ok: boolean;
  files: TextFile[];
  moved: { from: string; to: string } | null;
}

const stemOf = (file: string): string => path.basename(file).replace(/\.[^.]*$/, '');

export const sourceOf = (file: TextFile): ModuleSource => ({ name: stemOf(file.path), text: file.text });

export const corpusOf = (files: readonly TextFile[], root: string = CORPUS): TextFile[] => files.filter((file) => covers(root, file.path) && file.path.endsWith(MODULE_EXTENSION));

const refused = (lines: string[]): RenameReport => ({ lines: [...lines, '', 'Refused: no file was written.'], ok: false, files: [], moved: null });

const differences = (expected: readonly string[], found: readonly string[]): string[] => {
  const held = new Set(found);
  const wanted = new Set(expected);
  return [...expected.filter((line) => !held.has(line)).map((line) => `missing: ${line}`), ...found.filter((line) => !wanted.has(line)).map((line) => `unexpected: ${line}`)];
};

export function rename(files: readonly TextFile[], from: string, to: string): RenameReport {
  if (from === to) return refused([`${from} and ${to} are the same id, so there is nothing to rename.`]);

  const corpus = corpusOf(files);
  const sources = corpus.map(sourceOf);
  const loaded = loadUniverseWithDiagnostics(sources);
  if (loaded.diagnostics.length > 0) {
    return refused(['The corpus does not load, so a rename has no registry to be checked against.', ...loaded.diagnostics.map(formatModuleDiagnostic)]);
  }

  const declared = loaded.parsed.filter((module) => module.namespace !== null);
  const named = declared.find((module) => module.namespace === from);
  if (named === undefined) {
    return refused([`No module declares the id ${from}.`, `Declared: ${declared.map((module) => module.namespace).sort().join(', ')}`]);
  }
  if (declared.some((module) => module.namespace === to)) {
    return refused([`${to} is already declared, and two modules may not share an id.`, `Declared: ${declared.map((module) => module.namespace).sort().join(', ')}`]);
  }

  const held = corpus[sources.indexOf(named.source)]!;
  const moved = stemOf(held.path) === from ? { from: held.path, to: posix(path.join(path.dirname(held.path), `${to}${path.extname(held.path)}`)) } : null;
  if (moved !== null && files.some((file) => file.path === moved.to)) {
    return refused([`${moved.to} already exists, so the module's own file has nowhere to go.`]);
  }

  const pattern = occurrencesOf(from);
  const counts = new Map<string, number>();
  const written = new Map<string, TextFile>();
  for (const file of files) {
    const found = file.text.match(pattern)?.length ?? 0;
    const at = moved !== null && file.path === moved.from ? moved.to : file.path;
    if (found === 0 && at === file.path) continue;
    counts.set(at, found);
    written.set(file.path, { path: at, text: file.text.replace(pattern, to) });
  }

  const reloaded = loadUniverseWithDiagnostics(corpusOf(files.map((file) => written.get(file.path) ?? file)).map(sourceOf));
  if (reloaded.diagnostics.length > 0) {
    return refused([`The corpus does not load once ${from} is written as ${to}.`, ...reloaded.diagnostics.map(formatModuleDiagnostic)]);
  }

  const drift = differences(loaded.registry.namespace.renamed(from, to).snapshot(), reloaded.registry.namespace.snapshot());
  if (drift.length > 0) {
    return refused([`Renaming ${from} to ${to} did not leave the registry it should have.`, ...drift.slice(0, 20), ...(drift.length > 20 ? [`… and ${drift.length - 20} more`] : [])]);
  }

  const total = [...counts.values()].reduce((sum, each) => sum + each, 0);
  return {
    lines: [
      ...(moved === null ? [] : [`${moved.from} → ${moved.to}`, '']),
      ...[...counts].sort(([one], [other]) => one.localeCompare(other)).map(([file, found]) => `${file}: ${found}`),
      '',
      `${total} occurrence(s) of ${from} written as ${to} in ${counts.size} file(s).`,
    ],
    ok: true,
    files: [...written.values()],
    moved,
  };
}

export function readScope(roots: readonly string[] = SCOPE): TextFile[] {
  return trackedFiles()
    .map(posix)
    .filter((file) => roots.some((root) => covers(root, file)))
    .sort()
    .map((file) => ({ path: file, text: readFileSync(file, 'utf8') }));
}

export function writeRename(report: RenameReport): void {
  for (const file of report.files) writeFileSync(file.path, file.text);
  if (report.moved !== null) unlinkSync(report.moved.from);
}

const usage = [
  'Usage: npm run rename-module -- <old id> <new id>',
  '',
  'Writes a module id under a new name everywhere it is machine-meaningful: the',
  '`# info` heading, every address written whole in a DSL body, every key and value',
  'inside a `# save`, the string literals under src/ and scripts/ that name it, and',
  "the module's own file. An id is matched whole, so renaming town leaves",
  'town-quests and old-town alone.',
  '',
  `Only ${SCOPE.join(', ')} are touched. Nothing is written unless the corpus loads`,
  'afterwards and its namespace holds exactly the keys the rename should have left —',
  'which the namespace derives, so a kind or a field added next month is covered.',
].join('\n');

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  if (args.length !== 2) {
    console.error(`rename-module takes an old id and a new id\n\n${usage}`);
    process.exit(2);
  }
  const report = rename(readScope(), args[0]!, args[1]!);
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
  writeRename(report);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
