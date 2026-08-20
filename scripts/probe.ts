import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatVersion } from '../src/grammar/dependency';
import { CONTENT_SECTION_MAPS, formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { canSerialize, declaredGlobalIds, roundTripModule, roundTripUniverse } from '../src/content/serialize';
import { type ModuleSource, type ParsedModule } from '../src/content/universe';

export type RoundTripMode = 'universe' | 'module';

export interface ProbeOptions {
  show: string[];
  roundTrip: boolean;
  roundTripMode?: RoundTripMode;
  each?: boolean;
}

export interface ProbeArgs extends ProbeOptions {
  sources: string[];
}

export interface ProbeReport {
  lines: string[];
  ok: boolean;
}

// One vocabulary, because the row gives every registry map a kind to be named
// by. `--show variables.x` used to be the spelling for the four maps no section
// kind claimed, and `variable` was the natural wrong guess; it is now the right
// one.
const SHOWABLE = new Map<string, keyof Registry>(CONTENT_SECTION_MAPS);

export const DOCUMENT_SEPARATOR = '---';

const usage = [
  'Usage: npm run probe -- <source>... [--show <kind>.<id>] [--round-trip] [--each]',
  '',
  '  <source>       a DSL file, or - to read from stdin',
  '  --show         print one registry record as JSON; repeatable',
  '  --round-trip[=universe|module]',
  '                 universe (the default): serialize every loaded module, reload',
  '                 the universe from those serializations alone, and report what',
  '                 changed. module: serialize each module and reload it beside the',
  '                 other sources unchanged — which is what publishing one module',
  '                 does, and is how a patch module that owns no ids shows up as',
  '                 serializing to nothing',
  '  --each         load every source on its own and report a verdict per source,',
  '                 instead of loading them together as one universe',
  '',
  `A stdin body splits on a line of ${DOCUMENT_SEPARATOR}, so one heredoc can carry a table of`,
  'variants to survey with --each.',
  '',
  'Loads the sources as a universe and prints what the loader says about them.',
  'Exits non-zero when the loader refuses, a --show finds nothing, or a module',
  'does not survive a round trip. --each is a survey rather than an assertion:',
  'it reports each verdict and exits 0, because a table of rejections is a',
  'normal thing to ask for.',
].join('\n');

export function parseProbeArgs(raw: readonly string[]): ProbeArgs {
  const args: ProbeArgs = { sources: [], show: [], roundTrip: false, roundTripMode: 'universe', each: false };
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--help' || arg === '-h') {
      throw new Error(usage);
    } else if (arg === '--each') {
      args.each = true;
    } else if (arg === '--round-trip' || arg.startsWith('--round-trip=')) {
      args.roundTrip = true;
      const mode = arg.startsWith('--round-trip=') ? arg.slice('--round-trip='.length) : 'universe';
      if (mode !== 'universe' && mode !== 'module') throw new Error(`--round-trip takes universe or module, not ${mode}`);
      args.roundTripMode = mode;
    } else if (arg === '--show') {
      const spec = raw[++i];
      if (spec === undefined) throw new Error('--show wants a <kind>.<id> after it');
      args.show.push(spec);
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag ${arg}\n\n${usage}`);
    } else {
      args.sources.push(arg);
    }
  }
  if (args.sources.length === 0) throw new Error(`name at least one source\n\n${usage}`);
  if (args.sources.filter((source) => source === '-').length > 1) throw new Error('stdin can only be read once — pass - at most once, and split the body on a line of ---');
  if (args.each && (args.show.length > 0 || args.roundTrip)) throw new Error('--each surveys sources one at a time, so it cannot be combined with --show or --round-trip');
  return args;
}

function counts(registry: Registry): string {
  const parts: string[] = [];
  for (const [kind, map] of CONTENT_SECTION_MAPS) {
    const size = (registry[map] as ReadonlyMap<string, unknown>).size;
    if (size > 0) parts.push(`${kind} ${size}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

function showRecord(registry: Registry, spec: string): { lines: string[]; ok: boolean } {
  const dot = spec.indexOf('.');
  if (dot < 1 || dot === spec.length - 1) return { lines: [`${spec}: not a <kind>.<id>, as in entity.base.rat`], ok: false };
  const kind = spec.slice(0, dot);
  const id = spec.slice(dot + 1);
  const map = SHOWABLE.get(kind);
  if (map === undefined) {
    const kinds = CONTENT_SECTION_MAPS.map(([each]) => each).join(', ');
    return { lines: [`${spec}: ${kind} names nothing the registry holds.`, `  section kinds: ${kinds}`], ok: false };
  }
  const records = registry[map] as ReadonlyMap<string, unknown>;
  const record = records.get(id);
  if (record === undefined) {
    const defined = [...records.keys()].sort();
    return { lines: [`${spec}: no ${kind} with that id. Defined: ${defined.length > 0 ? defined.join(', ') : 'none'}`], ok: false };
  }
  return { lines: [`${kind}.${id}`, JSON.stringify(record, null, 2)], ok: true };
}

// One module at a time, reloaded beside the other sources unchanged. That is
// what publishing a single module does, and it is the only shape in which a
// patch module owning no ids shows up as serializing to nothing. It is not the
// question `--round-trip` answers by default, because those other sources then
// replay their own edits over the print.
function roundTripEachModule(sources: readonly ModuleSource[], parsed: readonly ParsedModule[], loaded: Registry): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  let ok = true;
  for (const module of parsed) {
    if (!canSerialize(module)) {
      lines.push(`${module.info.id}: no # info, so its ids are root ids that no namespace prefix matches — it serializes to nothing, which is a fact about the source rather than a defect`);
      continue;
    }
    const others = sources.filter((source) => source !== module.source);
    const trip = roundTripModule(loaded, { info: module.info, globals: declaredGlobalIds(module) }, (printed) => loadUniverseWithDiagnostics([...others, { ...module.source, text: printed }]));
    if (trip.diagnostics.length > 0) {
      lines.push(`${module.info.id}: its serialization does not load beside the others`, ...trip.diagnostics.map((each) => `  ${formatModuleDiagnostic(each)}`));
      ok = false;
    } else if (trip.differences.length > 0) {
      lines.push(`${module.info.id}: publishing this module alone would not preserve the universe`, ...trip.differences);
      ok = false;
    } else {
      lines.push(`${module.info.id}: round-trips clean on its own`);
    }
  }
  return { lines, ok };
}

function roundTrip(parsed: readonly ParsedModule[], loaded: Registry): { lines: string[]; ok: boolean } {
  const unserializable = parsed.filter((module) => !canSerialize(module));
  if (unserializable.length > 0) {
    return {
      lines: [
        `not round-tripped: ${unserializable.map((module) => module.info.id).join(', ')} declare no # info, so their ids are root ids that no namespace prefix matches and they serialize to nothing.`,
        'The universe is round-tripped whole, so one such source ends the check for all of them. Give each a # info to run it.',
      ],
      ok: true,
    };
  }

  const trip = roundTripUniverse(loaded, parsed, (printed) => loadUniverseWithDiagnostics(printed));
  const named = parsed.map((module) => module.info.id).join(', ');
  if (trip.diagnostics.length > 0) return { lines: [`${named}: the serialization does not load`, ...trip.diagnostics.map((each) => `  ${formatModuleDiagnostic(each)}`)], ok: false };
  if (trip.differences.length > 0) return { lines: [`${named}: the serialization loads to a different registry`, ...trip.differences], ok: false };
  return { lines: [`${named}: round-trips clean`], ok: true };
}

function survey(sources: readonly ModuleSource[]): ProbeReport {
  const lines = sources.map((source) => {
    const loaded = loadUniverseWithDiagnostics([source]);
    if (loaded.diagnostics.length > 0) return `${source.name}: ${loaded.diagnostics.map((each) => each.message).join('; ')}`;
    return `${source.name}: loads — ${counts(loaded.registry)}`;
  });
  return { lines, ok: true };
}

export function probe(sources: readonly ModuleSource[], options: ProbeOptions): ProbeReport {
  if (options.each) return survey(sources);

  const loaded = loadUniverseWithDiagnostics(sources);
  if (loaded.diagnostics.length > 0) {
    return { lines: loaded.diagnostics.map(formatModuleDiagnostic), ok: false };
  }

  const parsed = loaded.parsed;
  const lines = [`loaded ${parsed.length} module(s): ${parsed.map((module) => `${module.info.id} ${formatVersion(module.info.version)}`).join(', ')}`, `  ${counts(loaded.registry)}`];
  let ok = true;

  for (const spec of options.show) {
    const shown = showRecord(loaded.registry, spec);
    lines.push('', ...shown.lines);
    if (!shown.ok) ok = false;
  }

  if (options.roundTrip) {
    const trip = options.roundTripMode === 'module' ? roundTripEachModule(sources, parsed, loaded.registry) : roundTrip(parsed, loaded.registry);
    lines.push('', ...trip.lines);
    if (!trip.ok) ok = false;
  }

  return { lines, ok };
}

// A source's name is its module id when the document declares no `# info`, so
// the separator this puts between the name and the ordinal has to be one an id
// may contain. `stdin[3]` was not: every document without an `# info` was
// refused as "stdin[3] is not a usable module id", which made a survey unable
// to tell a variant that loads from one the loader rejected — the whole point
// of `--each`.
export function splitDocuments(name: string, text: string): ModuleSource[] {
  const documents = text.split(new RegExp(`^${DOCUMENT_SEPARATOR}[ \\t]*$`, 'm'));
  if (documents.length === 1) return [{ name, text }];
  return documents.map((document, index) => ({ name: `${name}-${index + 1}`, text: document })).filter((source) => source.text.trim() !== '');
}

function readSources(files: readonly string[]): ModuleSource[] {
  return files.flatMap((file) => (file === '-' ? splitDocuments('stdin', readFileSync(0, 'utf8')) : [{ name: path.basename(file).replace(/\.[^.]*$/, ''), text: readFileSync(file, 'utf8') }]));
}

function main(): void {
  let sources: ModuleSource[];
  let args: ProbeArgs;
  try {
    args = parseProbeArgs(process.argv.slice(2));
    sources = readSources(args.sources);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const report = probe(sources, args);
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
