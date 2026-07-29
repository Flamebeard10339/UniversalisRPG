import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { APPROVED_MOD_LABEL, DEFAULT_MODPORTAL_CACHE, emptyModportalManifest, materializeApprovedModIssue, upsertModportalEntries } from '../src/content/modportal';
import type { ApprovedModIssue, MaterializedMod, ModportalEntry, ModportalManifest } from '../src/content/modportal';
import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = 'content/tutorial-island.dsl';

type Command = 'sync' | 'list' | 'enable' | 'disable' | 'sources' | 'show';

interface Args {
  command: Command;
  target?: string;
  cacheDir: string;
  label: string;
  repo?: string;
  fromFile?: string;
  contentFiles: string[];
}

function usage(): never {
  console.error(
    [
      'Usage: tsx scripts/modportal.ts <sync|list|enable|disable|sources|show> [target] [--cache <dir>] [--repo owner/name] [--label approved-mod] [--from issues.json] [content=<a.dsl,b.dsl>]',
      '',
      'sync reads GitHub issues labelled approved-mod through gh issue list, unless --from supplies a local JSON issue list.',
    ].join('\n'),
  );
  process.exit(1);
}

function splitFiles(value: string): string[] {
  return value.split(',').map((file) => file.trim()).filter(Boolean);
}

function parseArgs(raw: string[]): Args {
  if (raw.length === 0 || raw[0] === '--help' || raw[0] === '-h') usage();
  const command = raw[0] as Command;
  if (!['sync', 'list', 'enable', 'disable', 'sources', 'show'].includes(command)) usage();
  const args: Args = { command, cacheDir: DEFAULT_MODPORTAL_CACHE, label: APPROVED_MOD_LABEL, contentFiles: splitFiles(defaultContent) };

  for (let i = 1; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--cache') {
      args.cacheDir = raw[++i] ?? usage();
      continue;
    }
    if (arg.startsWith('--cache=')) {
      args.cacheDir = arg.slice('--cache='.length);
      continue;
    }
    if (arg === '--repo') {
      args.repo = raw[++i] ?? usage();
      continue;
    }
    if (arg === '--label') {
      args.label = raw[++i] ?? usage();
      continue;
    }
    if (arg === '--from') {
      args.fromFile = raw[++i] ?? usage();
      continue;
    }
    if (arg.startsWith('content=')) {
      args.contentFiles = splitFiles(arg.slice('content='.length));
      continue;
    }
    if (!args.target) {
      args.target = arg;
      continue;
    }
    usage();
  }

  if ((command === 'enable' || command === 'disable' || command === 'show') && !args.target) usage();
  return args;
}

function repoPath(file: string): string {
  return path.resolve(repoRoot, file);
}

function cachePath(args: Args, file = ''): string {
  return path.resolve(repoRoot, args.cacheDir, file);
}

function manifestPath(args: Args): string {
  return cachePath(args, 'manifest.json');
}

function readManifest(args: Args): ModportalManifest {
  const file = manifestPath(args);
  if (!existsSync(file)) return emptyModportalManifest(args.label);
  return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as ModportalManifest;
}

function writeManifest(args: Args, manifest: ModportalManifest): void {
  mkdirSync(cachePath(args), { recursive: true });
  writeFileSync(manifestPath(args), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function issueListFromGitHub(args: Args): unknown[] {
  const ghArgs = ['issue', 'list', '--state', 'open', '--label', args.label, '--json', 'number,title,body,url,updatedAt'];
  if (args.repo) ghArgs.push('--repo', args.repo);
  let output: string;
  try {
    output = execFileSync('gh', ghArgs, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Could not read approved mod issues with gh: ${detail}`);
    process.exit(1);
  }
  const parsed = JSON.parse(output) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function issueList(args: Args): unknown[] {
  if (!args.fromFile) return issueListFromGitHub(args);
  const parsed = JSON.parse(readFileSync(repoPath(args.fromFile), 'utf8').replace(/^\uFEFF/, '')) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function sourceName(file: string): string {
  return path.basename(file).replace(/\.[^.]*$/, '');
}

function contentSource(file: string): ModuleSource {
  return { name: sourceName(file), text: readFileSync(repoPath(file), 'utf8') };
}

function entrySource(args: Args, entry: ModportalEntry): ModuleSource {
  return { name: entry.moduleId, text: readFileSync(cachePath(args, entry.file), 'utf8'), enabled: entry.enabled };
}

function validateEnabled(args: Args, entries: readonly ModportalEntry[]): string[] {
  const sources = [...args.contentFiles.map(contentSource), ...entries.map((entry) => entrySource(args, entry))];
  const loaded = loadUniverseWithDiagnostics(sources);
  return loaded.diagnostics.map(formatModuleDiagnostic);
}

function findEntry(manifest: ModportalManifest, target: string): ModportalEntry | undefined {
  return manifest.entries.find((entry) => entry.moduleId === target || String(entry.issue) === target || `#${entry.issue}` === target);
}

function sync(args: Args): void {
  let materialized: MaterializedMod[];
  try {
    materialized = issueList(args).map((issue) => materializeApprovedModIssue(issue as ApprovedModIssue));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Could not materialize approved mod issue: ${detail}`);
    process.exit(1);
  }
  const manifest = upsertModportalEntries(readManifest(args), materialized, new Date().toISOString());
  mkdirSync(cachePath(args), { recursive: true });
  for (const mod of materialized) writeFileSync(cachePath(args, mod.file), mod.text, 'utf8');
  writeManifest(args, manifest);

  const diagnostics = validateEnabled(args, manifest.entries);
  for (const diagnostic of diagnostics) console.error(`Disabled module: ${diagnostic}`);
  console.log(`Synced ${manifest.entries.length} approved mod(s) to ${args.cacheDir}.`);
  if (diagnostics.length > 0) process.exit(1);
}

function list(args: Args): void {
  const manifest = readManifest(args);
  if (manifest.entries.length === 0) {
    console.log('No approved mods synced.');
    return;
  }
  for (const entry of manifest.entries) {
    const mark = entry.enabled ? 'enabled ' : 'disabled';
    const url = entry.url ? ` ${entry.url}` : '';
    console.log(`${mark} #${entry.issue} ${entry.moduleId} - ${entry.title}${url}`);
  }
}

function toggle(args: Args, enabled: boolean): void {
  const manifest = readManifest(args);
  const entry = findEntry(manifest, args.target!);
  if (!entry) {
    console.error(`No approved mod matches ${args.target}`);
    process.exit(1);
  }
  entry.enabled = enabled;
  writeManifest(args, manifest);
  console.log(`${enabled ? 'Enabled' : 'Disabled'} ${entry.moduleId} (#${entry.issue}).`);
}

function sources(args: Args): void {
  const manifest = readManifest(args);
  for (const entry of manifest.entries.filter((entry) => entry.enabled)) console.log(path.relative(repoRoot, cachePath(args, entry.file)));
}

function show(args: Args): void {
  const manifest = readManifest(args);
  const entry = findEntry(manifest, args.target!);
  if (!entry) {
    console.error(`No approved mod matches ${args.target}`);
    process.exit(1);
  }
  console.log(readFileSync(cachePath(args, entry.file), 'utf8').trimEnd());
}

const args = parseArgs(process.argv.slice(2));
if (args.command === 'sync') sync(args);
else if (args.command === 'list') list(args);
else if (args.command === 'enable') toggle(args, true);
else if (args.command === 'disable') toggle(args, false);
else if (args.command === 'sources') sources(args);
else show(args);
