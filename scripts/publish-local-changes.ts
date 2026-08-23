import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildContributionIssueBody, localDiagnostics, localModuleLoaded } from '../src/content/contribution';
import { formatModuleDiagnostic } from '../src/content/registry';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { LOCAL_CHANGES_MODULE_ID } from '../src/content/localChanges';
import { MOD_PENDING_LABEL } from '../src/content/modportal';
import { CORPUS_DIR } from '../src/content/shipped';
import { ModuleSource } from '../src/content/universe';
import { sourceFiles } from './probe';

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = CORPUS_DIR;
const defaultLocal = `${CORPUS_DIR}/${LOCAL_CHANGES_MODULE_ID}.dsl`;

interface Args {
  contentFiles: string[];
  localFile: string;
  title: string;
  notes?: string;
  labels: string[];
  repo?: string;
  create: boolean;
}

function usage(): never {
  console.error(
    [
      'Usage: tsx scripts/publish-local-changes.ts [local=<file>] [content=<a.dsl,b.dsl>] [--title <title>] [--notes <text>] [--notes-file <file>] [--label <label>] [--repo owner/name] [--create]',
      '',
      'Default mode prints the issue body. --create calls `gh issue create` with that body.',
    ].join('\n'),
  );
  process.exit(1);
}

function splitFiles(value: string): string[] {
  return value.split(',').map((file) => file.trim()).filter(Boolean);
}

export function parseArgs(raw: string[]): Args {
  const args: Args = {
    contentFiles: splitFiles(defaultContent),
    localFile: defaultLocal,
    title: '[Content]: local changes',
    labels: ['content', 'community', MOD_PENDING_LABEL],
    create: false,
  };

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--help' || arg === '-h') usage();
    if (arg === '--create') {
      args.create = true;
      continue;
    }
    if (arg === '--title') {
      args.title = raw[++i] ?? usage();
      continue;
    }
    if (arg === '--notes') {
      args.notes = raw[++i] ?? usage();
      continue;
    }
    if (arg === '--notes-file') {
      args.notes = readFileSync(repoPath(raw[++i] ?? usage()), 'utf8');
      continue;
    }
    if (arg === '--label') {
      args.labels = splitFiles(raw[++i] ?? usage());
      continue;
    }
    if (arg === '--repo') {
      args.repo = raw[++i] ?? usage();
      continue;
    }
    if (arg.startsWith('local=')) {
      args.localFile = arg.slice('local='.length);
      continue;
    }
    if (arg.startsWith('content=')) {
      args.contentFiles = splitFiles(arg.slice('content='.length));
      continue;
    }
    usage();
  }

  return args;
}

function repoPath(file: string): string {
  return path.resolve(repoRoot, file);
}

function sourceName(file: string): string {
  return path.basename(file).replace(/\.[^.]*$/, '');
}

function source(file: string): ModuleSource {
  return { name: sourceName(file), text: readFileSync(file, 'utf8') };
}

// A source may name a directory, which stands for the .dsl files in it, so `content` names the whole corpus.
const contentSources = (files: readonly string[]): ModuleSource[] => files.flatMap((file) => sourceFiles(repoPath(file))).map(source);

function fail(lines: string[]): never {
  for (const line of lines) console.error(line);
  process.exit(1);
}

export function createIssue(args: Args, body: string): number {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-issue-'));
  const bodyFile = path.join(dir, 'body.md');
  try {
    writeFileSync(bodyFile, body, 'utf8');
    const ghArgs = ['issue', 'create', '--title', args.title, '--body-file', bodyFile];
    for (const label of args.labels) ghArgs.push('--label', label);
    if (args.repo) ghArgs.push('--repo', args.repo);
    const result = spawnSync('gh', ghArgs, { stdio: 'inherit' });
    if (result.error) console.error(`Could not create GitHub issue with gh: ${result.error.message}`);
    return result.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function main(raw: string[] = process.argv.slice(2)): void {
  const args = parseArgs(raw);
  if (!existsSync(repoPath(args.localFile))) fail([`Local changes file not found: ${args.localFile}`]);

  const baseSources = contentSources(args.contentFiles);
  const localSource = source(args.localFile);
  const validation = loadUniverseWithDiagnostics([...baseSources, localSource]);
  if (!localModuleLoaded(localSource.name, validation)) {
    fail([
      `${LOCAL_CHANGES_MODULE_ID} did not validate:`,
      ...localDiagnostics(localSource.name, validation.diagnostics).map((diagnostic) => `  ${formatModuleDiagnostic(diagnostic)}`),
    ]);
  }

  const body = buildContributionIssueBody({
    notes: args.notes,
    localModule: localSource.text,
    validation,
    contentFiles: args.contentFiles,
  });

  if (!args.create) console.log(body);
  else process.exit(createIssue(args, body));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
