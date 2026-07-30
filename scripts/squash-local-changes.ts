import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../src/content/registry';
import type { Registry } from '../src/content/registry';
import { serializeRegistryModule } from '../src/content/serialize';
import { ModuleSource, parseModuleSource, ParsedModule } from '../src/content/universe';

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = 'content/tutorial-island.dsl';
const defaultLocal = 'content/local-changes.dsl';

interface Args {
  contentFiles: string[];
  localFile: string;
  moduleId?: string;
  outFile?: string;
}

function usage(): never {
  console.error(
    [
      'Usage: tsx scripts/squash-local-changes.ts [local=<file>] [content=<a.dsl,b.dsl>] [--module <id>] [--out <file>]',
      '',
      'Prints a canonical DSL source for one loaded module after applying local changes.',
    ].join('\n'),
  );
  process.exit(1);
}

function splitFiles(value: string): string[] {
  return value.split(',').map((file) => file.trim()).filter(Boolean);
}

function parseArgs(raw: string[]): Args {
  const args: Args = { contentFiles: splitFiles(defaultContent), localFile: defaultLocal };
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--help' || arg === '-h') usage();
    if (arg === '--module') {
      args.moduleId = raw[++i] ?? usage();
      continue;
    }
    if (arg === '--out') {
      args.outFile = raw[++i] ?? usage();
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
  return { name: sourceName(file), text: readFileSync(repoPath(file), 'utf8') };
}

function fail(lines: string[]): never {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function parsed(source: ModuleSource): ParsedModule {
  try {
    return parseModuleSource(source);
  } catch (error) {
    if (error instanceof Error) fail([error.message]);
    throw error;
  }
}

function variableIds(module: ParsedModule): string[] {
  return module.sections.filter((section) => section.kind === 'variable').map((section) => (section.value as { id: string }).id);
}

function writeOutput(file: string, text: string): void {
  const target = repoPath(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, 'utf8');
}

const CONTENT_MAPS = ['entities', 'locations', 'items', 'stats', 'skills', 'recipes', 'resources', 'dialogues', 'tests', 'flags', 'variables', 'saves'] as const;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = stable((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

function registryDiff(before: Registry, after: Registry): string[] {
  const lines: string[] = [];
  for (const name of CONTENT_MAPS) {
    const left = before[name] as Map<string, unknown>;
    const right = after[name] as Map<string, unknown>;
    for (const key of [...left.keys()].sort()) {
      if (!right.has(key)) lines.push(`  ${name}: missing ${key}`);
      else if (JSON.stringify(stable(left.get(key))) !== JSON.stringify(stable(right.get(key)))) lines.push(`  ${name}: changed ${key}`);
    }
    for (const key of [...right.keys()].sort()) if (!left.has(key)) lines.push(`  ${name}: added ${key}`);
  }
  return lines;
}

const args = parseArgs(process.argv.slice(2));
if (!existsSync(repoPath(args.localFile))) fail([`Local changes file not found: ${args.localFile}`]);

const baseSources = args.contentFiles.map(source);
const localSource = source(args.localFile);
const parsedModules = [...baseSources, localSource].map(parsed);
const targetId = args.moduleId ?? parsedModules[0]?.info.id ?? usage();
const target = parsedModules.find((module) => module.info.id === targetId);
if (!target) fail([`No loaded source declares module id ${targetId}`]);

const loaded = loadUniverseWithDiagnostics([...baseSources, localSource]);
if (loaded.diagnostics.length > 0) fail(['Cannot squash while diagnostics are present:', ...loaded.diagnostics.map((diagnostic) => `  ${formatModuleDiagnostic(diagnostic)}`)]);

const globals = new Set<string>(variableIds(target));
const localParsed = parsedModules.find((module) => module.source === localSource);
// Variables are global tuning knobs rather than module-owned content, so a
// local-created variable can become part of the squashed module's globals. A
// local-created item/entity/etc. is still refused by registryDiff below.
if (localParsed && localParsed.info.id !== targetId) for (const id of variableIds(localParsed)) globals.add(id);

const squashed = serializeRegistryModule(loaded.registry, { info: target.info, globalVariables: [...globals].sort() });
const validationSources = parsedModules
  .filter((module) => module.info.id !== targetId)
  .map((module) => module.source)
  .filter((source) => source !== localSource);
const checked = loadUniverseWithDiagnostics([...validationSources, { ...target.source, text: squashed }]);
if (checked.diagnostics.length > 0) {
  fail(['Squashed output did not validate:', ...checked.diagnostics.map((diagnostic) => `  ${formatModuleDiagnostic(diagnostic)}`)]);
}
const differences = registryDiff(loaded.registry, checked.registry);
if (differences.length > 0) {
  fail([
    `Squashed output would not preserve the loaded universe for module ${targetId}.`,
    'Run the command once per touched module, or publish local-changes as its own module when it creates new content.',
    ...differences,
  ]);
}

if (args.outFile) writeOutput(args.outFile, squashed);
else console.log(squashed.trimEnd());
