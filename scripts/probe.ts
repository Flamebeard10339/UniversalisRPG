import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sourceFiles } from './lib/dslSources';
import { everyDirective } from '../src/content/sections/test';
import { formatVersion } from '../src/grammar/dependency';
import {  formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { mapOf } from '../src/content/registry';
import { localId } from '../src/content/locale';
import { contentSectionMaps } from '../src/content/sections';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { canSerialize, declaredGlobalIds, roundTripModule, roundTripUniverse } from '../src/content/serialize';
import { withModulesOff, type ModuleSource, type ParsedModule } from '../src/content/universe';
import { modulesNamed } from '../src/content/packs';
import { createGameState } from '../src/runtime/state';
import { replayTest, runTest, type TestRun } from '../src/runtime/session';
import { serializeSave } from '../src/runtime/save';
import { overLines } from '../src/content/sections/save';
import { endSaveId } from '../src/runtime/runLog';
import { traceTests } from './lib/trace';

export type RoundTripMode = 'universe' | 'module';

export interface ProbeOptions {
  show: string[];
  test?: string[];
  record?: string[];
  trace?: string[];
  roundTrip: boolean;
  roundTripMode?: RoundTripMode;
  each?: boolean;
}

export interface ProbeArgs extends ProbeOptions {
  sources: string[];
  off: string[];
}

export interface ProbeReport {
  lines: string[];
  ok: boolean;
}

const SHOWABLE = new Map<string, string>(contentSectionMaps());

export const DOCUMENT_SEPARATOR = '---';

const usage = [
  'Usage: npm run probe -- <source>... [--off <pack>] [--show <kind>.<id>] [--test <id>] [--trace <id>] [--record <id>] [--round-trip] [--each]',
  '',
  '  <source>       a DSL file, a directory of them, or - to read from stdin',
  '  --off          turn a pack or a module off before loading, by the name the',
  '                 settings page offers it under; repeatable. `--off quests` is',
  '                 the town with no quest in it',
  '  --show         print one registry record as JSON; repeatable',
  '  --trace        run one # test and print a line per step: what the step was, which',
  '                 loop pass it ran in, and what moved in the save because of it. This is',
  '                 how a long probabilistic loop is read — a failing route already names',
  '                 the pass it stopped on, and this says what the world looked like on the',
  '                 way there. A long run prints its first thirty steps and its last twenty',
  '                 and says how many it left out; repeatable',
  '  --record       run one # test and print the state it ends on as the # save section',
  '                 its own closing expect: names, so the printed section replaces that',
  '                 section in the file wholesale; repeatable. This is how a route whose',
  '                 content changed on purpose gets its sheet back. The run\'s verdict is',
  '                 printed above the section, and failing is the ordinary case because the',
  '                 sheet being replaced is stale. A route that stopped before its last',
  '                 directive ended somewhere it does not end, so that one is refused: it',
  '                 says which step it stopped at, prints no body, and exits non-zero.',
  '  --test         run one # test and report PASSED/FAILED; repeatable. An id',
  '                 that names no test but stands as a prefix over some — a',
  '                 module id — runs every test under it',
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
  const args: ProbeArgs = { sources: [], off: [], show: [], test: [], roundTrip: false, roundTripMode: 'universe', each: false };
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
    } else if (arg === '--off') {
      const spec = raw[++i];
      if (spec === undefined) throw new Error('--off wants a pack or module name after it');
      args.off.push(spec);
    } else if (arg === '--show') {
      const spec = raw[++i];
      if (spec === undefined) throw new Error('--show wants a <kind>.<id> after it');
      args.show.push(spec);
    } else if (arg === '--trace') {
      const spec = raw[++i];
      if (spec === undefined) throw new Error('--trace wants a # test id after it');
      (args.trace ??= []).push(spec);
    } else if (arg === '--record') {
      const spec = raw[++i];
      if (spec === undefined) throw new Error('--record wants a # test id after it');
      (args.record ??= []).push(spec);
    } else if (arg === '--test') {
      const spec = raw[++i];
      if (spec === undefined) throw new Error('--test wants a # test id after it');
      args.test!.push(spec);
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag ${arg}\n\n${usage}`);
    } else {
      args.sources.push(arg);
    }
  }
  if (args.sources.length === 0) throw new Error(`name at least one source\n\n${usage}`);
  if (args.sources.filter((source) => source === '-').length > 1) throw new Error('stdin can only be read once — pass - at most once, and split the body on a line of ---');
  if (args.each && (args.show.length > 0 || args.test!.length > 0 || (args.record ?? []).length > 0 || args.roundTrip)) throw new Error('--each surveys sources one at a time, so it cannot be combined with --show, --test or --round-trip');
  return args;
}

function counts(registry: Registry): string {
  const parts: string[] = [];
  for (const [kind, map] of contentSectionMaps()) {
    const size = (mapOf(registry, map) as ReadonlyMap<string, unknown>).size;
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
    const kinds = contentSectionMaps().map(([each]) => each).join(', ');
    return { lines: [`${spec}: ${kind} names nothing the registry holds.`, `  section kinds: ${kinds}`], ok: false };
  }
  const records = mapOf(registry, map) as ReadonlyMap<string, unknown>;
  const record = records.get(id);
  if (record === undefined) {
    const defined = [...records.keys()].sort();
    return { lines: [`${spec}: no ${kind} with that id. Defined: ${defined.length > 0 ? defined.join(', ') : 'none'}`], ok: false };
  }
  return { lines: [`${kind}.${id}`, JSON.stringify(record, null, 2)], ok: true };
}

function testsNamed(registry: Registry, spec: string): string[] {
  if (registry.tests.has(spec)) return [spec];
  return [...registry.tests.keys()].filter((id) => id.startsWith(`${spec}.`)).sort();
}

function runTests(registry: Registry, specs: readonly string[]): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  let ok = true;
  for (const spec of specs) {
    const named = testsNamed(registry, spec);
    if (named.length === 0) {
      const defined = [...registry.tests.keys()].sort();
      lines.push(`${spec}: no # test with that id, and none under it. Defined: ${defined.length > 0 ? defined.join(', ') : 'none'}`);
      ok = false;
      continue;
    }
    for (const id of named) {
      const failure = ((): string | null => {
        try {
          const result = runTest(id, registry, createGameState());
          return result.passed ? null : (result.failure ?? 'no reason given');
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      })();
      lines.push(failure === null ? `${id}: PASSED` : `${id}: FAILED — ${failure}`);
      if (failure !== null) ok = false;
    }
  }
  return { lines, ok };
}

function closingSaveId(registry: Registry, testId: string): string | undefined {
  let closing: string | undefined;
  for (const directive of everyDirective(registry.tests.get(testId)?.directives ?? [])) {
    if (directive.kind === 'expect' || directive.kind === 'expect-only') closing = directive.save;
  }
  return closing;
}

export function recordedSheetId(registry: Registry, testId: string): string | undefined {
  const closing = closingSaveId(registry, testId);
  return closing === undefined ? undefined : localId(registry.namespace.ownerOf('save', closing) ?? null, closing);
}

function recordTests(registry: Registry, specs: readonly string[]): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  let ok = true;
  for (const spec of specs) {
    const named = testsNamed(registry, spec);
    if (named.length === 0) {
      lines.push(`${spec}: no # test with that id, and none under it.`);
      ok = false;
      continue;
    }
    for (const id of named) {
      const state = createGameState();
      let run: TestRun;
      try {
        run = replayTest(id, registry, state);
      } catch (error) {
        lines.push(`${id}: threw before it could be recorded — ${error instanceof Error ? error.message : String(error)}`);
        ok = false;
        continue;
      }
      const verdict = run.result.passed ? null : (run.result.failure ?? 'no reason given');
      if (run.walked < run.steps) {
        lines.push(`${id}: FAILED — ${verdict ?? 'no reason given'}`);
        lines.push(`${id}: stopped at step ${run.walked} of ${run.steps}, so the state it left is not the one this route ends on and no body is printed`);
        ok = false;
        continue;
      }
      const closing = closingSaveId(registry, id);
      const sheet = recordedSheetId(registry, id);
      const over = (closing === undefined ? undefined : registry.saves.get(closing))?.over ?? [];
      lines.push(verdict === null ? `${id}: PASSED, so this sheet says what the one in the file already says` : `${id}: FAILED — ${verdict}`);
      if (sheet === undefined) lines.push(`${id}: closes on no expect:, so this replaces nothing and is named the way a recorded run names its end`);
      lines.push(`# save ${sheet ?? endSaveId(id.split('.').pop()!)}`, ...overLines(over), serializeSave(state, registry, over), '');
    }
  }
  return { lines, ok };
}

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

  const named = options.test ?? [];
  if (named.length > 0) {
    const ran = runTests(loaded.registry, named);
    lines.push('', ...ran.lines);
    if (!ran.ok) ok = false;
  }

  const traced = options.trace ?? [];
  if (traced.length > 0) {
    const ran = traceTests(loaded.registry, traced.flatMap((spec) => testsNamed(loaded.registry, spec)));
    lines.push('', ...ran.lines);
    if (!ran.ok) ok = false;
  }

  const recorded = options.record ?? [];
  if (recorded.length > 0) {
    const ran = recordTests(loaded.registry, recorded);
    lines.push('', ...ran.lines);
    if (!ran.ok) ok = false;
  }

  if (options.roundTrip) {
    const trip = options.roundTripMode === 'module' ? roundTripEachModule(sources, parsed, loaded.registry) : roundTrip(parsed, loaded.registry);
    lines.push('', ...trip.lines);
    if (!trip.ok) ok = false;
  }

  return { lines, ok };
}

export function splitDocuments(name: string, text: string): ModuleSource[] {
  const documents = text.split(new RegExp(`^${DOCUMENT_SEPARATOR}[ \\t]*$`, 'm'));
  if (documents.length === 1) return [{ name, text }];
  return documents.map((document, index) => ({ name: `${name}-${index + 1}`, text: document })).filter((source) => source.text.trim() !== '');
}

const asSource = (file: string): ModuleSource => ({ name: path.basename(file).replace(/\.[^.]*$/, ''), text: readFileSync(file, 'utf8') });

export function readSources(files: readonly string[]): ModuleSource[] {
  return files.flatMap((file) => (file === '-' ? splitDocuments('stdin', readFileSync(0, 'utf8')) : sourceFiles(file).map(asSource)));
}

function main(): void {
  let sources: ModuleSource[];
  let args: ProbeArgs;
  try {
    args = parseProbeArgs(process.argv.slice(2));
    sources = readSources(args.sources);
    if (args.off.length > 0) sources = withModulesOff(sources, modulesNamed(loadUniverseWithDiagnostics(sources).modules, args.off));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const report = probe(sources, args);
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
