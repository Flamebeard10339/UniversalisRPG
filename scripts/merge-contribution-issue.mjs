import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const universesRoot = path.join(repoRoot, 'public', 'content', 'universes');

const typeAliases = new Map([
  ['actions', ['action', 'actions']],
  ['collectionLogs', ['collectionLog', 'collectionLogs']],
  ['dialogues', ['dialogue', 'dialogues']],
  ['displayProfiles', ['displayProfile', 'displayProfiles']],
  ['dropTables', ['dropTable', 'dropTables']],
  ['effects', ['effect', 'effects']],
  ['enemies', ['enemy', 'enemies']],
  ['entities', ['entity', 'entities']],
  ['flags', ['flag', 'flags']],
  ['interactionTypes', ['interactionType', 'interactionTypes']],
  ['items', ['item', 'items']],
  ['locations', ['location', 'locations']],
  ['resources', ['resource', 'resources', 'resourceDefinition', 'resourceDefinitions']],
  ['resourceDefinitions', ['resource', 'resources', 'resourceDefinition', 'resourceDefinitions']],
  ['skills', ['skill', 'skills']],
  ['stats', ['stat', 'stats']],
]);

const canonicalObjectType = (objectType) => {
  for (const [canonical, aliases] of typeAliases) {
    if (canonical === objectType || aliases.includes(objectType)) return canonical;
  }
  return objectType;
};

const moduleFileName = (moduleId) => `${moduleId}.json`;
const modulePath = (universeId, moduleId) => path.join(universesRoot, universeId, 'modules', moduleFileName(moduleId));
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

const changedJsonPattern = /##\s+Changed JSON\s+```json\s*([\s\S]*?)\s*```/i;

export const parseContributionIssue = (text) => {
  const targetUniverseId = text.match(/##\s+Target universe\s+([^\r\n]+)/i)?.[1]?.trim();
  const changedJson = text.match(changedJsonPattern)?.[1];
  if (!targetUniverseId) throw new Error('Issue body is missing "Target universe".');
  if (!changedJson) throw new Error('Issue body is missing a Changed JSON code block.');

  const changedFiles = JSON.parse(changedJson);
  if (!Array.isArray(changedFiles)) throw new Error('Changed JSON must be an array.');
  for (const [index, file] of changedFiles.entries()) {
    if (!file || typeof file !== 'object' || typeof file.path !== 'string' || !('json' in file)) {
      throw new Error(`Changed JSON entry ${index} must include path and json.`);
    }
  }
  return { targetUniverseId, changedFiles };
};

const moduleIdFromChangedFile = (file) => {
  const match = file.path.match(/^modules\/([^/]+)\.json$/i);
  const moduleId = match?.[1] ?? (file.json && typeof file.json === 'object' ? file.json.id : undefined);
  if (typeof moduleId !== 'string' || moduleId.trim().length === 0) {
    throw new Error(`Cannot determine module id from ${file.path}.`);
  }
  return moduleId;
};

export const addPackagedMods = ({ universeId, changedFiles, dryRun = false }) => {
  const moduleFiles = changedFiles.filter((file) => /^modules\/[^/]+\.json$/i.test(file.path));
  if (moduleFiles.length === 0) throw new Error('No module JSON files found in Changed JSON.');

  const manifestPath = universeManifestPath(universeId);
  const manifest = readJson(manifestPath);
  const moduleIds = moduleFiles.map(moduleIdFromChangedFile);
  const nextModules = Array.from(new Set([...(manifest.modules ?? []), ...moduleIds]));
  const writes = [];

  for (const file of moduleFiles) {
    const moduleId = moduleIdFromChangedFile(file);
    writes.push(writeJson(modulePath(universeId, moduleId), file.json, dryRun));
  }
  writes.push(writeJson(manifestPath, { ...manifest, modules: nextModules }, dryRun));

  return { universeId, moduleIds, writes };
};

const decodePathPart = (value) => value.replace(/~1/g, '/').replace(/~0/g, '~');

const applyJsonPatch = (value, ops) => {
  let next = structuredClone(value);
  const targetFor = (patchPath) => {
    if (patchPath === '') return { parent: null, key: '' };
    const parts = patchPath.split('/').slice(1).map(decodePathPart);
    const key = parts.pop() ?? '';
    let parent = next;
    for (const part of parts) parent = Array.isArray(parent) ? parent[Number(part)] : parent[part];
    return { parent, key };
  };

  for (const op of ops) {
    const { parent, key } = targetFor(op.path);
    if (parent === null) {
      if (op.op === 'remove') next = undefined;
      else next = structuredClone(op.value);
      continue;
    }
    if (Array.isArray(parent)) {
      const index = key === '-' ? parent.length : Number(key);
      if (op.op === 'remove') parent.splice(index, 1);
      else if (op.op === 'add') parent.splice(index, 0, structuredClone(op.value));
      else parent[index] = structuredClone(op.value);
    } else if (op.op === 'remove') {
      delete parent[key];
    } else {
      parent[key] = structuredClone(op.value);
    }
  }
  return next;
};

const typedDataEntryMatches = (entry, objectType, objectId) =>
  entry && typeof entry === 'object' &&
  entry.id === objectId &&
  typeAliases.get(canonicalObjectType(objectType))?.includes(entry.type);

const findTypedDataEntryIndex = (data, objectType, objectId) =>
  data.findIndex((entry) => typedDataEntryMatches(entry, objectType, objectId));

const findObjectDataEntryIndex = (data, objectType, objectId) => {
  const key = canonicalObjectType(objectType);
  const rows = data[key] ?? [];
  return { key, index: rows.findIndex((entry) => entry?.id === objectId) };
};

const applyPatchToModuleData = (targetModule, patch) => {
  if (!targetModule.data) targetModule.data = [];

  if (Array.isArray(targetModule.data)) {
    const index = findTypedDataEntryIndex(targetModule.data, patch.objectType, patch.objectId);
    const current = index >= 0 ? targetModule.data[index] : undefined;
    const patched = applyJsonPatch(current, patch.ops);
    if (patched === undefined) {
      if (index >= 0) targetModule.data.splice(index, 1);
      return;
    }
    const aliases = typeAliases.get(canonicalObjectType(patch.objectType));
    const nextEntry = { ...patched, type: patched.type ?? aliases?.[0] ?? patch.objectType, id: patch.objectId };
    if (index >= 0) targetModule.data[index] = nextEntry;
    else targetModule.data.push(nextEntry);
    return;
  }

  const { key, index } = findObjectDataEntryIndex(targetModule.data, patch.objectType, patch.objectId);
  const rows = targetModule.data[key] ?? [];
  const current = index >= 0 ? rows[index] : undefined;
  const patched = applyJsonPatch(current, patch.ops);
  if (patched === undefined) {
    targetModule.data[key] = rows.filter((_, rowIndex) => rowIndex !== index);
  } else if (index >= 0) {
    targetModule.data[key] = rows.map((row, rowIndex) => rowIndex === index ? { ...patched, id: patch.objectId } : row);
  } else {
    targetModule.data[key] = [...rows, { ...patched, id: patch.objectId }];
  }
};

export const mergeIntoExistingMod = ({ universeId, targetModId, changedFiles, dryRun = false }) => {
  if (!targetModId) throw new Error('merge-mod requires --target-mod <module-id>.');
  const contributionModules = changedFiles
    .filter((file) => /^modules\/[^/]+\.json$/i.test(file.path))
    .map((file) => file.json);
  if (contributionModules.length === 0) throw new Error('No module JSON files found in Changed JSON.');

  const targetPath = modulePath(universeId, targetModId);
  const targetModule = readJson(targetPath);
  let applied = 0;

  for (const module of contributionModules) {
    const patches = module?.['data-updates']?.patches ?? [];
    for (const patch of patches) {
      if (patch.targetModId !== targetModId) continue;
      applyPatchToModuleData(targetModule, patch);
      applied += 1;
    }
  }

  if (applied === 0) throw new Error(`No patches targeted ${targetModId}.`);
  return { universeId, targetModId, applied, writes: [writeJson(targetPath, targetModule, dryRun)] };
};

const parseArgs = (argv) => {
  const args = { workflow: '', issue: '', targetModId: '', dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--workflow') args.workflow = argv[++index] ?? '';
    else if (arg === '--issue') args.issue = argv[++index] ?? '';
    else if (arg === '--target-mod') args.targetModId = argv[++index] ?? '';
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
};

const usage = `Usage:
  node scripts/merge-contribution-issue.mjs --workflow add-mod --issue issue.md [--dry-run]
  node scripts/merge-contribution-issue.mjs --workflow merge-mod --target-mod base-core --issue issue.md [--dry-run]

Workflows:
  add-mod    Write changed module JSON into the target universe and add it to universe.json modules.
  merge-mod  Apply data-updates.patches from changed modules into an existing packaged module.`;

export const runCli = (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  if (args.help) return { text: usage };
  if (!args.workflow) throw new Error('Missing --workflow.');
  if (!args.issue) throw new Error('Missing --issue.');
  const issueText = args.issue === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(args.issue, 'utf8');
  const issue = parseContributionIssue(issueText);
  const result = args.workflow === 'add-mod'
    ? addPackagedMods({ universeId: issue.targetUniverseId, changedFiles: issue.changedFiles, dryRun: args.dryRun })
    : args.workflow === 'merge-mod'
      ? mergeIntoExistingMod({ universeId: issue.targetUniverseId, targetModId: args.targetModId, changedFiles: issue.changedFiles, dryRun: args.dryRun })
      : (() => { throw new Error(`Unknown workflow: ${args.workflow}`); })();
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
