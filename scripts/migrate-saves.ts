import type { PruneWarning } from '../src/runtime/pruning';
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { qualify } from '../src/content/namespace';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { parseSaveSection } from '../src/content/sections/save';
import { CORPUS_DIR } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { splitSections } from '../src/grammar/structure';
import type { Span } from '../src/grammar/parser';
import { createGameState } from '../src/runtime/runtime';
import { SAVE_VERSION, loadSave } from '../src/runtime/save';

export interface ContentFile {
  path: string;
  text: string;
}

export type SaveBody = Record<string, unknown>;

export interface Fixture {
  id: string;
  file: string;
  version: number;
}

export interface ShapeChange {
  writtenFor: number;
  declared: string;
  moved(body: SaveBody, fixture: Fixture): SaveBody;
}

export const noFieldMoved = (writtenFor: number): ShapeChange => ({ writtenFor, declared: 'no field moved', moved: (body) => body });

export const SHAPE_CHANGE: ShapeChange | null = noFieldMoved(11);

export function isStaleDeclaration(change: ShapeChange | null): boolean {
  return change !== null && change.writtenFor !== SAVE_VERSION;
}

export interface MigrationReport {
  lines: string[];
  ok: boolean;
  files: ContentFile[];
}

type Classification = 'recording' | 'input' | 'unreferenced';

interface Rewrite {
  fixture: Fixture;
  span: Span;
  text: string;
}

const CREATE_VALID_TEST = '/create-valid-test';

function moduleSourceOf(file: ContentFile): ModuleSource {
  return { name: path.basename(file.path).replace(/\.[^.]*$/, ''), text: file.text };
}

function classify(registry: Registry, fixtures: readonly Fixture[]): (id: string) => Classification {
  const found = new Map<string, Classification>();
  for (const fixture of fixtures) found.set(fixture.id, 'unreferenced');
  for (const test of registry.tests.values()) {
    for (const directive of test.directives) {
      if (directive.kind === 'load' && found.get(directive.save) === 'unreferenced') found.set(directive.save, 'input');
      if (directive.kind === 'expect' || directive.kind === 'expect-only') found.set(directive.save, 'recording');
    }
  }
  return (id) => found.get(id) ?? 'unreferenced';
}

function splice(text: string, edits: readonly Rewrite[]): string {
  const ordered = [...edits].sort((a, b) => a.span.start - b.span.start);
  let out = '';
  let at = 0;
  for (const edit of ordered) {
    out += text.slice(at, edit.span.start) + edit.text;
    at = edit.span.end;
  }
  return out + text.slice(at);
}

function refused(lines: string[]): MigrationReport {
  return { lines: [...lines, '', 'Refused: no file was written.'], ok: false, files: [] };
}

const declareIt = `Set SHAPE_CHANGE in scripts/migrate-saves.ts, stamped writtenFor: ${SAVE_VERSION} as a literal — noFieldMoved(${SAVE_VERSION}) if the bump moved no field a fixture holds, and one of your own if it did.`;

function validationProblems(rewrites: readonly Rewrite[], registry: Registry): string[] {
  const problems: string[] = [];
  for (const rewrite of rewrites) {
    let warnings: PruneWarning[];
    try {
      const { version, ...diff } = JSON.parse(rewrite.text) as { version: number } & SaveBody;
      warnings = loadSave(createGameState(), { version, diff }, registry);
    } catch (error) {
      problems.push(`${rewrite.fixture.id}: ${(error as Error).message}`);
      continue;
    }
    for (const warning of warnings) problems.push(`${rewrite.fixture.id}: ${warning.path} — ${warning.message}`);
  }
  return problems;
}

export function migrate(files: readonly ContentFile[], change: ShapeChange | null): MigrationReport {
  if (change === null) {
    return refused([`No shape change is declared, so this run cannot say what the bump to SAVE_VERSION ${SAVE_VERSION} did to the fixtures.`, declareIt]);
  }

  if (isStaleDeclaration(change)) {
    return refused([`The declared shape change was written for SAVE_VERSION ${change.writtenFor}, not ${SAVE_VERSION}, so it is an earlier bump's and cannot say what this one did to the fixtures.`, declareIt]);
  }

  const sources = files.map(moduleSourceOf);
  const loaded = loadUniverseWithDiagnostics(sources);
  if (loaded.diagnostics.length > 0) {
    return refused(['The content does not load, so there is no registry to validate a migration against.', ...loaded.diagnostics.map(formatModuleDiagnostic)]);
  }

  const namespaces = new Map(loaded.parsed.map((module) => [module.source, module.namespace]));
  const fixtures: Fixture[] = [];
  const rewrites: Rewrite[] = [];
  const skipped: Fixture[] = [];
  const problems: string[] = [];

  for (const [index, file] of files.entries()) {
    const namespace = namespaces.get(sources[index]) ?? null;
    for (const section of splitSections(file.text)) {
      if (section.kind !== 'save') continue;
      const saved = parseSaveSection(section);
      const fixture: Fixture = { id: qualify(namespace, saved.id), file: file.path, version: saved.version };
      fixtures.push(fixture);
      if (saved.version === SAVE_VERSION) {
        skipped.push(fixture);
        continue;
      }
      if (section.body.length !== 1) {
        problems.push(`${fixture.id}: its body is ${section.body.length} lines, and rewriting one in place needs exactly one`);
        continue;
      }
      const body = change.moved(saved.diff, fixture);
      rewrites.push({ fixture, span: section.body[0].span, text: JSON.stringify({ version: SAVE_VERSION, ...body }) });
    }
  }

  problems.push(...validationProblems(rewrites, loaded.registry));

  const classificationOf = classify(loaded.registry, fixtures);
  const lines = [`shape change: ${change.declared}`, `SAVE_VERSION ${SAVE_VERSION}`, ''];

  for (const rewrite of rewrites) lines.push(`${rewrite.fixture.file}: ${rewrite.fixture.id} — version ${rewrite.fixture.version} rewritten to ${SAVE_VERSION} as ${classificationOf(rewrite.fixture.id)}`);
  for (const fixture of skipped) lines.push(`${fixture.file}: ${fixture.id} — already at ${SAVE_VERSION}, left untouched`);

  const unreferenced = fixtures.filter((fixture) => classificationOf(fixture.id) === 'unreferenced').map((fixture) => fixture.id);
  if (unreferenced.length > 0) lines.push('', `No # test names these fixtures, so nothing replays them: ${unreferenced.join(', ')}`);

  if (problems.length > 0) {
    return refused([...lines, '', 'A rewritten fixture does not load against the registry.', ...problems]);
  }

  const recordings = rewrites.filter((rewrite) => classificationOf(rewrite.fixture.id) === 'recording').map((rewrite) => rewrite.fixture.id);
  if (recordings.length > 0) {
    lines.push('', `These are recordings of a replay, and a shape migration only makes them loadable — it does not make them true. Regenerate each with ${CREATE_VALID_TEST}: ${recordings.join(', ')}`);
  }

  const touched = new Set(rewrites.map((rewrite) => rewrite.fixture.file));
  const written = files
    .filter((file) => touched.has(file.path))
    .map((file) => ({ path: file.path, text: splice(file.text, rewrites.filter((rewrite) => rewrite.fixture.file === file.path)) }));

  lines.push('', written.length > 0 ? `Rewrote ${rewrites.length} fixture(s) in ${written.length} file(s).` : 'Nothing to rewrite.');
  return { lines, ok: true, files: written };
}

export function readContent(directory: string): ContentFile[] {
  return globSync('**/*.dsl', { cwd: directory })
    .map((relative) => path.join(directory, relative).replace(/\\/g, '/'))
    .sort()
    .map((file) => ({ path: file, text: readFileSync(file, 'utf8') }));
}

export function writeMigration(report: MigrationReport): void {
  for (const file of report.files) writeFileSync(file.path, file.text);
}

const usage = [
  'Usage: npm run migrate-saves -- [<content directory>]',
  '',
  'Rewrites the body of every `# save` section under the directory (default: content)',
  'to the current SAVE_VERSION, applying the SHAPE_CHANGE declared in this file, and',
  'leaves every other byte alone. A fixture already stamped SAVE_VERSION is skipped,',
  'so a second run changes nothing. Nothing is written unless every rewritten fixture',
  `loads against the real registry. Recordings it rewrote are named for ${CREATE_VALID_TEST}:`,
  'a shape migration makes a recording loadable, never true.',
].join('\n');

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  if (args.length > 1) {
    console.error(`migrate-saves takes at most one directory\n\n${usage}`);
    process.exit(2);
  }
  const report = migrate(readContent(args[0] ?? CORPUS_DIR), SHAPE_CHANGE);
  console.log(report.lines.join('\n'));
  writeMigration(report);
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
