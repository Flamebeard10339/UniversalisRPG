import path from 'node:path';
import { CORPUS_DIR } from '../src/content/shipped';
import { SAVE_VERSION } from '../src/runtime/save';
import {
  classifier,
  edited,
  loadContent,
  loadProblems,
  readContent,
  savesIn,
  writeFiles,
  type ContentFile,
  type Edit,
  type Fixture,
  type SaveBody,
} from './lib/saveFixtures';

export { readContent, type ContentFile, type Fixture, type SaveBody };

export interface ShapeChange {
  writtenFor: number;
  declared: string;
  moved(body: SaveBody, fixture: Fixture): SaveBody;
}

export const noFieldMoved = (writtenFor: number): ShapeChange => ({ writtenFor, declared: 'no field moved', moved: (body) => body });

const rerolledCopies: ShapeChange = {
  writtenFor: 13,
  declared: 'every item copy and every cluster in its plane keeps a roll',
  moved(body) {
    const table = body.instances as { byId?: Record<string, { kind?: string; payload?: Record<string, unknown> }> } | undefined;
    for (const held of Object.values(table?.byId ?? {})) {
      if (held.kind !== 'item' || !held.payload) continue;
      delete held.payload.experience;
      held.payload.roll = 0;
      for (const cluster of Object.values((held.payload.plane ?? {}) as Record<string, Record<string, unknown>>)) cluster.roll = 0;
    }
    return body;
  },
};

export const SHAPE_CHANGE: ShapeChange | null = rerolledCopies;

export function isStaleDeclaration(change: ShapeChange | null): boolean {
  return change !== null && change.writtenFor !== SAVE_VERSION;
}

export interface MigrationReport {
  lines: string[];
  ok: boolean;
  files: ContentFile[];
}

interface Rewrite extends Edit {
  fixture: Fixture;
  over?: string[];
}

const CREATE_VALID_TEST = '/create-valid-test';

function refused(lines: string[]): MigrationReport {
  return { lines: [...lines, '', 'Refused: no file was written.'], ok: false, files: [] };
}

const declareIt = `Set SHAPE_CHANGE in scripts/migrate-saves.ts, stamped writtenFor: ${SAVE_VERSION} as a literal — noFieldMoved(${SAVE_VERSION}) if the bump moved no field a fixture holds, and one of your own if it did.`;

export function migrate(files: readonly ContentFile[], change: ShapeChange | null): MigrationReport {
  if (change === null) {
    return refused([`No shape change is declared, so this run cannot say what the bump to SAVE_VERSION ${SAVE_VERSION} did to the fixtures.`, declareIt]);
  }

  if (isStaleDeclaration(change)) {
    return refused([`The declared shape change was written for SAVE_VERSION ${change.writtenFor}, not ${SAVE_VERSION}, so it is an earlier bump's and cannot say what this one did to the fixtures.`, declareIt]);
  }

  const loaded = loadContent(files);
  if (loaded.diagnostics.length > 0) {
    return refused(['The content does not load, so there is no registry to validate a migration against.', ...loaded.diagnostics]);
  }

  const fixtures: Fixture[] = [];
  const rewrites: Rewrite[] = [];
  const skipped: Fixture[] = [];
  const problems: string[] = [];

  for (const written of savesIn(files, loaded)) {
    const { fixture } = written;
    fixtures.push(fixture);
    if (fixture.version === SAVE_VERSION) {
      skipped.push(fixture);
      continue;
    }
    if (written.span === null) {
      problems.push(`${fixture.id}: its body is ${written.spread} lines, and rewriting one in place needs exactly one`);
      continue;
    }
    const body = change.moved(written.body, fixture);
    rewrites.push({ fixture, span: written.span, ...(written.over ? { over: written.over } : {}), text: JSON.stringify({ version: SAVE_VERSION, ...body }) });
  }

  problems.push(...loadProblems(rewrites.map((rewrite) => ({ id: rewrite.fixture.id, over: rewrite.over, text: rewrite.text })), loaded.registry));

  const classificationOf = classifier(loaded.registry, fixtures);
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

  const byFile = new Map<string, Edit[]>();
  for (const rewrite of rewrites) byFile.set(rewrite.fixture.file, [...(byFile.get(rewrite.fixture.file) ?? []), rewrite]);
  const written = edited(files, byFile);

  lines.push('', written.length > 0 ? `Rewrote ${rewrites.length} fixture(s) in ${written.length} file(s).` : 'Nothing to rewrite.');
  return { lines, ok: true, files: written };
}

export function writeMigration(report: MigrationReport): void {
  writeFiles(report.files);
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
  '',
  'An id a body names that nothing declares any more is `npm run repair-saves`, not this.',
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
