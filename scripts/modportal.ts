import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LISTABLE_MOD_LABELS, materializeApprovedModIssue, planModportalSync } from '../src/content/modportal';
import type { ApprovedModIssue, MaterializedMod, ModportalEntry, ModportalManifest, ModTier } from '../src/content/modportal';
import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';
import { DEFAULT_MODPORTAL_CACHE, MODPORTAL_MANIFEST_FILE, modportalEntryPath, orphanEntryFiles, readEntryText, readModportalCache } from './lib/modportalCache';

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = 'content/tutorial-island.dsl';

type Command = 'sync' | 'list' | 'enable' | 'disable' | 'sources' | 'show';

interface Args {
  command: Command;
  target?: string;
  cacheDir: string;
  repo?: string;
  fromFile?: string;
  contentFiles: string[];
}

function usage(): never {
  console.error(
    [
      'Usage: tsx scripts/modportal.ts <sync|list|enable|disable|sources|show> [target] [--cache <dir>] [--repo owner/name] [--from issues.json] [content=<a.dsl,b.dsl>]',
      '',
      `sync reads open GitHub issues labelled ${LISTABLE_MOD_LABELS.map((tier) => tier.label).join(' or ')} through gh issue list,`,
      'unless --from supplies a local JSON issue list. A mod-approved issue syncs available but switched',
      'off; only mod-auto-enabled defaults on, and only if the enabled set still loads with it.',
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
  const args: Args = { command, cacheDir: DEFAULT_MODPORTAL_CACHE, contentFiles: splitFiles(defaultContent) };

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

function readManifest(args: Args): ModportalManifest {
  const { manifest, warnings } = readModportalCache(cachePath(args));
  for (const warning of warnings) console.error(warning);
  return manifest;
}

function writeManifest(args: Args, manifest: ModportalManifest): void {
  mkdirSync(cachePath(args), { recursive: true });
  writeFileSync(cachePath(args, MODPORTAL_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function issuesFromGitHub(args: Args, label: string): unknown[] {
  const ghArgs = ['issue', 'list', '--state', 'open', '--label', label, '--json', 'number,title,body,url,updatedAt,labels'];
  if (args.repo) ghArgs.push('--repo', args.repo);
  let output: string;
  try {
    output = execFileSync('gh', ghArgs, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Could not read ${label} issues with gh: ${detail}`);
    process.exit(1);
  }
  const parsed = JSON.parse(output) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

// gh's repeated --label is an AND, so each listable tier is its own query. An
// issue carrying both labels reaches us twice and keeps the stronger tier.
function issueList(args: Args): ApprovedModIssue[] {
  if (args.fromFile) {
    const parsed = JSON.parse(readFileSync(repoPath(args.fromFile), 'utf8').replace(/^\uFEFF/, '')) as unknown;
    return (Array.isArray(parsed) ? parsed : [parsed]) as ApprovedModIssue[];
  }
  const byIssue = new Map<number, ApprovedModIssue>();
  for (const { label, tier } of LISTABLE_MOD_LABELS) {
    for (const raw of issuesFromGitHub(args, label)) {
      const issue = { ...(raw as ApprovedModIssue), tier };
      if (tier === 'auto-enabled' || !byIssue.has(issue.number)) byIssue.set(issue.number, issue);
    }
  }
  return [...byIssue.values()];
}

function sourceName(file: string): string {
  return path.basename(file).replace(/\.[^.]*$/, '');
}

function contentSource(file: string): ModuleSource {
  return { name: sourceName(file), text: readFileSync(repoPath(file), 'utf8') };
}

function findEntry(manifest: ModportalManifest, target: string): ModportalEntry | undefined {
  return manifest.entries.find((entry) => entry.moduleId === target || String(entry.issue) === target || `#${entry.issue}` === target);
}

function tierLabel(tier: ModTier): string {
  return LISTABLE_MOD_LABELS.find((listable) => listable.tier === tier)?.label ?? tier;
}

function sync(args: Args): void {
  const materialized: MaterializedMod[] = [];
  const unusable: string[] = [];
  const base = args.contentFiles.map(contentSource);
  for (const issue of issueList(args)) {
    try {
      materialized.push(materializeApprovedModIssue(issue, base));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      unusable.push(`Skipped #${issue?.number ?? '?'}: ${detail}`);
    }
  }

  const manifest = planModportalSync({
    existing: readManifest(args),
    materialized,
    base,
    syncedAt: new Date().toISOString(),
  });

  mkdirSync(cachePath(args), { recursive: true });
  for (const mod of materialized) writeFileSync(cachePath(args, mod.file), mod.text, 'utf8');
  for (const orphan of orphanEntryFiles(cachePath(args), manifest.entries)) rmSync(cachePath(args, orphan), { force: true });
  writeManifest(args, manifest);

  for (const line of unusable) console.error(line);
  for (const entry of manifest.entries.filter((entry) => entry.diagnostics)) {
    console.error(`Blocked #${entry.issue} ${entry.moduleId}:`);
    for (const diagnostic of entry.diagnostics ?? []) console.error(`  ${diagnostic}`);
  }

  const enabled = manifest.entries.filter((entry) => entry.enabled).length;
  const blocked = manifest.entries.filter((entry) => entry.diagnostics).length;
  const available = manifest.entries.length - enabled - blocked;
  console.log(`Synced ${manifest.entries.length} mod(s) to ${args.cacheDir}: ${enabled} enabled, ${available} available, ${blocked} blocked, ${unusable.length} unusable.`);
}

function list(args: Args): void {
  const manifest = readManifest(args);
  if (manifest.entries.length === 0) {
    console.log('No mods synced.');
    return;
  }
  for (const entry of manifest.entries) {
    const mark = entry.diagnostics ? 'blocked ' : entry.enabled ? 'enabled ' : 'disabled';
    const url = entry.url ? ` ${entry.url}` : '';
    console.log(`${mark} #${entry.issue} ${entry.moduleId} [${tierLabel(entry.tier)}] - ${entry.title}${url}`);
    for (const diagnostic of entry.diagnostics ?? []) console.log(`         ${diagnostic}`);
  }
}

// Reads what is on disk rather than what was just materialized, because this is
// the check `enable` needs: whether the cache as it would stand loads.
function validateCachedEnabled(args: Args, entries: readonly ModportalEntry[]): string[] {
  const diagnostics: string[] = [];
  const sources = args.contentFiles.map(contentSource);
  for (const entry of entries.filter((entry) => entry.enabled)) {
    const { text, warning } = readEntryText(cachePath(args), entry);
    if (text === undefined) diagnostics.push(warning!);
    else sources.push({ name: entry.moduleId, text });
  }
  return [...diagnostics, ...loadUniverseWithDiagnostics(sources).diagnostics.map(formatModuleDiagnostic)];
}

// Enabling is staged and proved before it is written; disabling needs no proof,
// so a cache holding a broken enabled mod is always repairable.
function toggle(args: Args, enabled: boolean): void {
  const manifest = readManifest(args);
  const entry = findEntry(manifest, args.target!);
  if (!entry) {
    console.error(`No mod matches ${args.target}`);
    process.exit(1);
  }
  entry.enabled = enabled;
  if (enabled) {
    const diagnostics = validateCachedEnabled(args, manifest.entries);
    if (diagnostics.length > 0) {
      for (const diagnostic of diagnostics) console.error(diagnostic);
      console.error(`Left ${entry.moduleId} switched off: enabling it would stop ${args.cacheDir} loading.`);
      process.exit(1);
    }
    delete entry.diagnostics;
  }
  manifest.intent[String(entry.issue)] = enabled;
  writeManifest(args, manifest);
  console.log(`${enabled ? 'Enabled' : 'Disabled'} ${entry.moduleId} (#${entry.issue}).`);
}

function sources(args: Args): void {
  const manifest = readManifest(args);
  for (const entry of manifest.entries.filter((entry) => entry.enabled)) console.log(path.relative(repoRoot, modportalEntryPath(cachePath(args), entry)));
}

function show(args: Args): void {
  const manifest = readManifest(args);
  const entry = findEntry(manifest, args.target!);
  if (!entry) {
    console.error(`No mod matches ${args.target}`);
    process.exit(1);
  }
  const { text, warning } = readEntryText(cachePath(args), entry);
  if (text === undefined) {
    console.error(warning!);
    process.exit(1);
  }
  console.log(text.trimEnd());
}

const args = parseArgs(process.argv.slice(2));
if (args.command === 'sync') sync(args);
else if (args.command === 'list') list(args);
else if (args.command === 'enable') toggle(args, true);
else if (args.command === 'disable') toggle(args, false);
else if (args.command === 'sources') sources(args);
else show(args);
