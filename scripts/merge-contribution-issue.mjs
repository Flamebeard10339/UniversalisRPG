import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const universesRoot = path.join(repoRoot, 'public', 'content', 'universes');

const modulePath = (universeId, moduleId) => path.join(universesRoot, universeId, 'modules', `${moduleId}.md`);
const universeManifestPath = (universeId) => path.join(universesRoot, universeId, 'universe.json');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value, dryRun) => {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, json);
  }
  return { path: filePath, json: value };
};
const writeText = (filePath, text, dryRun) => {
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text);
  }
  return { path: filePath };
};

// Each changed/new DSL module is embedded as its complete, self-contained
// source under a '### <path>' heading (see formatDslModulesBlock in
// src/lib/githubIssues.ts) — a plug-and-play file, not a diff, so parsing it
// back out is a plain extraction, no patch-application logic needed.
const dslModulesSectionPattern = /##\s+Changed DSL Modules\s*\n([\s\S]*)$/i;
const dslModuleBlockPattern = /###\s+([^\r\n]+)\r?\n```md\r?\n([\s\S]*?)\r?\n```/g;

export const parseContributionIssue = (text) => {
  const targetUniverseId = text.match(/##\s+Target universe\s+([^\r\n]+)/i)?.[1]?.trim();
  if (!targetUniverseId) throw new Error('Issue body is missing "Target universe".');

  const dslModules = [];
  const dslSectionMatch = text.match(dslModulesSectionPattern);
  if (dslSectionMatch) {
    for (const match of dslSectionMatch[1].matchAll(dslModuleBlockPattern)) {
      dslModules.push({ path: match[1].trim(), source: match[2] });
    }
  }

  return { targetUniverseId, dslModules };
};

const MODULE_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

const bumpPatchVersion = (version) => {
  const match = MODULE_VERSION_PATTERN.exec(version);
  if (!match) return null;
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
};

const withVersion = (source, version) => source.replace(/^(version:\s*)\S+/m, `$1${version}`);

// A DSL module is authored as a complete, self-contained file — merging it
// is a plain upsert (write the text to modules/<id>.md, register the id in
// universe.json only if it's new), never patch-application: unlike the
// retired JSON-patch workflows, there's no "does this still apply cleanly"
// question, since the incoming source always fully replaces whatever's on
// disk. A module whose file already exists gets its version bumped from
// whatever's currently on disk (not whatever the contributor's session had,
// which may be stale if something else merged in the meantime) — a brand
// new module keeps the version the contributor declared.
export const upsertDslModules = ({ universeId, dslModules, dryRun = false }) => {
  if (!dslModules || dslModules.length === 0) throw new Error('No Changed DSL Modules block found in the issue.');

  const writes = [];
  const moduleIds = [];
  const bumped = [];
  const newModuleIds = [];

  for (const file of dslModules) {
    const moduleId = file.path.match(/^modules\/([^/]+)\.md$/i)?.[1];
    if (!moduleId) throw new Error(`Could not determine a module id from "${file.path}".`);

    const targetPath = modulePath(universeId, moduleId);
    const exists = fs.existsSync(targetPath);
    const currentText = exists ? fs.readFileSync(targetPath, 'utf8') : null;
    if (currentText === file.source) continue;

    let nextSource = file.source;
    if (exists) {
      const currentVersion = currentText.match(/^version:\s*(\S+)/m)?.[1];
      const nextVersion = currentVersion ? bumpPatchVersion(currentVersion) : null;
      if (currentVersion && nextVersion) {
        nextSource = withVersion(file.source, nextVersion);
        bumped.push({ moduleId, from: currentVersion, to: nextVersion });
      }
    } else {
      newModuleIds.push(moduleId);
    }

    writes.push(writeText(targetPath, nextSource, dryRun));
    moduleIds.push(moduleId);
  }

  if (newModuleIds.length > 0) {
    const manifestPath = universeManifestPath(universeId);
    const manifest = readJson(manifestPath);
    writes.push(writeJson(manifestPath, { ...manifest, modules: [...(manifest.modules ?? []), ...newModuleIds] }, dryRun));
  }

  return { universeId, moduleIds, bumped, writes };
};

const parseArgs = (argv) => {
  const args = { issue: '', dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--issue') args.issue = argv[++index] ?? '';
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
};

const usage = `Usage:
  node scripts/merge-contribution-issue.mjs --issue issue.md [--dry-run]

Applies each "## Changed DSL Modules" file in a submitted contribution issue
(src/lib/githubIssues.ts's formatContributionIssueBody) to
public/content/universes/<universe>/modules/<id>.md: writes a new file and
registers it in universe.json if it doesn't exist yet, or overwrites an
existing one and bumps its version's patch number.`;

export const runCli = (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  if (args.help) return { text: usage };
  if (!args.issue) throw new Error('Missing --issue.');
  const issueText = args.issue === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(args.issue, 'utf8');
  const issue = parseContributionIssue(issueText);
  const result = upsertDslModules({ universeId: issue.targetUniverseId, dslModules: issue.dslModules, dryRun: args.dryRun });
  return { text: JSON.stringify({ ...result, writes: result.writes.map((write) => path.relative(repoRoot, write.path)) }, null, 2) };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { text } = runCli();
    console.log(text);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exit(1);
  }
}
