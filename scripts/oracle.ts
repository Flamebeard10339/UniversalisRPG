import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { probe, readSources } from './probe';
import { withEngineLocale } from '../src/content/engineLocale';
import { remarksOn } from '../src/runtime/worldRemarks';
import { align, type Hole } from '../src/grammar/form';
import { amissIn, fillingWords, offeringAt, type Addressed, type Amiss } from '../src/content/completion';
import { grammarLines, standingLines } from '../src/content/grammarTree';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type ModuleDiagnostic } from '../src/content/registry';
import { shippedSources } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { declaredBy } from '../src/content/references';
import { splitSections, type RawLine, type RawSection } from '../src/grammar/structure';
import { sectionKinds } from '../src/content/sections';

const usage = [
  'Usage: npm run oracle -- [<kind>...]',
  '       npm run oracle -- --at <draft.dsl> [--walk [<line>]]',
  '',
  '  <kind>    print every line that may be written under that kind, at the',
  '            indentation it is written at; with no kind, print every kind',
  '            A directory in place of a draft is the whole world in it: every line',
  '            of every module the engine has something to say about, then whether it',
  '            loads, whether it prints back to itself, and whether every route it',
  '            holds still walks. `--at content` is the shipped corpus\'s own verdict,',
  '            which is what a contributor runs and what CI runs — the suite reads no',
  '            content at all, so this is the only thing that answers for it',
  '  --at      read a draft: every line the engine has something to say about,',
  '            then what it says when handed the whole file beside the world as',
  '            it stands. That is the answer to "is this draft good, and where is',
  '            it not", and it stops there',
  '  --walk    go on, after that, to walk the cursor to each placeholder in turn',
  '            and say where the line sits, what it is read as, and what may stand',
  '            there. Name a line number and it answers for that line alone, which',
  '            is what to reach for when one line has you stuck; with none it walks',
  '            the whole file, and that is thousands of lines for a module',
  '',
  'A draft is whichever module its own `# info` names, so an edited copy of a module',
  'that already ships is read in place of the shipped one rather than beside it.',
  'Ids come from the corpus, and under --at from the draft as well, so what this',
  'prints is what the page would show with the draft loaded.',
].join('\n');

const corpus = (): ModuleSource[] => [...shippedSources()];

export interface Reading {
  known: Addressed[];
  said: readonly ModuleDiagnostic[];
  read: string;
  stood: boolean;
}

export function reading(file: string, text: string, world: readonly ModuleSource[]): Reading {
  const declared = moduleDeclaredIn(text);
  const beside = world.filter((each) => declared === null || moduleDeclaredIn(each.text) !== declared);
  const replaced = declared !== null && beside.length < world.length;
  const { source, supplied } = draftModule(file, text, beside);
  const loaded = loadUniverseWithDiagnostics([...beside, source]);
  return {
    known: declaredBy(loaded.registry),
    said: loaded.diagnostics,
    read: supplied
      ? `read as # info ${source.name} standing on everything already loaded, since the file declares no module of its own`
      : replaced
        ? `read as the module it declares, in place of the ${declared} that already ships`
        : 'read as the module it declares',
    stood: loaded.diagnostics.length === 0,
  };
}

const DECLARES_A_MODULE = /^#[ \t]+info\b/m;

const UNNAMED = '';

function moduleDeclaredIn(text: string): string | null {
  try {
    const info = splitSections(text).find((section) => section.kind === 'info');
    return info === undefined ? null : (info.id ?? UNNAMED);
  } catch {
    return DECLARES_A_MODULE.test(text) ? UNNAMED : null;
  }
}

const slug = (file: string): string => path.basename(file).replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'draft';

export function draftModule(file: string, text: string, world: readonly ModuleSource[]): { source: ModuleSource; supplied: boolean } {
  const id = slug(file);
  if (moduleDeclaredIn(text) !== null) return { source: { name: id, text }, supplied: false };
  const loaded = loadUniverseWithDiagnostics(world).loadedModules;
  const head = [`# info ${id}`, 'version: 0.0.1', ...(loaded.length === 0 ? [] : ['dependencies:', ...loaded.map((each) => `  ${each}`)]), ''];
  return { source: { name: id, text: [...head, text].join('\n') }, supplied: true };
}

export function takenLines({ said, read, stood }: Reading): string[] {
  if (stood) return [`the engine takes this file into the world, ${read}`, ''];
  return [`the engine will not take this file into the world, ${read}.`, 'It stops at the first thing it cannot take, so fixing this may uncover another:', ...said.map((each) => `  ${formatModuleDiagnostic(each)}`), ''];
}

const namesAt = (text: string, cursor: number, known: readonly Addressed[], already: Set<string>): string | undefined => {
  const offering = offeringAt(text, cursor, known);
  if (offering.filling === null) return undefined;
  const kind = offering.filling.kind ?? [...new Set(offering.offers.flatMap((offer) => (offer.kind === undefined ? [] : [offer.kind])))][0];
  const ids = (of: string): string => {
    const named = known.filter((each) => each.kind === of).map((each) => each.address).sort();
    return named.length === 0 ? 'none anywhere' : `${named.join(', ')}${named.length === 1 ? '' : ` — ${named.length} in all`}`;
  };
  const holds = offering.filling.holds;
  const under =
    holds === undefined
      ? kind === undefined
        ? []
        : [`      <${offering.filling.hole}>`, `        ${ids(kind)}`]
      : [
          ...(holds.words.length === 0 ? [] : ['      <operators>', `        ${holds.words.join(', ')}`]),
          ...holds.names.flatMap((each) => [`      <${each.hole}>`, `        ${ids(each.kind)}`]),
        ];
  const words = `    ${fillingWords({ ...offering.filling, ...(kind === undefined ? {} : { kind }) })}`;
  const key = [kind, ...(holds?.words ?? []), ...(holds?.names ?? []).map((each) => each.hole)].join('|');
  if (under.length === 0) return words;
  if (already.has(key)) return `${words}, as above`;
  already.add(key);
  return [words, ...under].join('\n');
};

const holesOf = (offering: { reads: string | null; filling: { form: string } | null }, line: string): readonly Hole[] => {
  const form = offering.reads ?? offering.filling?.form;
  return form === undefined ? [] : (align(form, line.trimStart())?.holes ?? []);
};

const wrongIn = (each: Amiss): string[] => [
  `  line ${each.line}: ${each.written.trim() === '' ? '(blank)' : each.written.trim()}`,
  ...(each.refused === null ? [] : [`    the engine will not read this line: ${each.refused}`]),
  ...(each.undeclared.length === 0 ? [] : [`    nothing declares ${each.undeclared.map((one) => `${one.id} as a # ${one.kind}${one.meant === undefined ? '' : `, one letter from ${one.meant}`}`).join(', ')}`]),
];

export function amissLines(text: string, known: readonly Addressed[], stood = true): string[] {
  const amiss = amissIn(text, known).map((each) => (stood ? each : { ...each, undeclared: [] })).filter((each) => each.refused !== null || each.undeclared.length > 0);
  if (amiss.length === 0) return [stood ? 'nothing here is refused and every id it names is declared' : 'no line here is refused on its own, and the engine still will not take the file: see below. Until it does, what this draft declares is not in the world, so no id it names is checked.', ''];
  return [
    `${amiss.length} line(s) the engine has something to say about:`,
    ...(stood ? [] : ['  (the file is not in the world — see below — so what it declares is not known, and only refusals are listed)']),
    ...amiss.flatMap(wrongIn),
    '',
  ];
}

const lineStarts = (draft: readonly string[]): number[] => {
  const starts: number[] = [];
  let at = 0;
  for (const line of draft) {
    starts.push(at);
    at += line.length + 1;
  }
  return starts;
};

const linesRead = (draft: readonly string[], starts: readonly number[]): ReadonlySet<number> | null => {
  let sections: RawSection[];
  try {
    sections = splitSections(draft.join('\n'));
  } catch {
    return null;
  }
  const lineOf = (offset: number): number => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid]! <= offset) low = mid;
      else high = mid - 1;
    }
    return low;
  };
  const kept = new Set<number>();
  const mark = (lines: readonly RawLine[]): void => {
    for (const line of lines) {
      kept.add(lineOf(line.span.start));
      mark(line.children);
    }
  };
  for (const section of sections) {
    kept.add(lineOf(section.span.start));
    mark(section.body);
  }
  return kept;
};

export function offeringLines(text: string, known: readonly Addressed[], only: number | null = null): string[] {
  const out: string[] = [];
  const already = new Set<string>();
  const draft = text.split('\n');
  const starts = lineStarts(draft);
  const read = linesRead(draft, starts);
  const writing = (after: number): boolean => draft.slice(after + 1).find((line) => line.trim() !== '')?.startsWith('#') !== true;
  const dropped = (index: number, line: string): boolean => read !== null && line.trim() !== '' && !read.has(index);
  for (const [index, line] of draft.entries()) {
    if (only !== null && index + 1 !== only) continue;
    if (dropped(index, line)) continue;
    const at = starts[index]! + line.length;
    const offering = offeringAt(text, at, known);
    const reads = offering.reads ?? offering.filling?.form;
    const note = offering.offers.find((offer) => offer.form === reads)?.note;
    const opening = at - line.trimStart().length;
    out.push(`${line || '·'}`);
    out.push(`    in ${offering.where.join(' › ')}, reads as ${reads ?? '?'}${note === undefined ? '' : `   — ${note}`}`);
    if (offering.refused !== null) out.push(`    REFUSED, the engine will not read this line: ${offering.refused}`);
    if (offering.undeclared.length > 0) out.push(`    nothing declares these yet, which is only a remark if you mean to declare them: ${offering.undeclared.map((each) => `${each.id} as a # ${each.kind}${each.meant === undefined ? '' : `, one letter from ${each.meant}`}`).join(', ')}`);
    const seen = new Set<string>();
    for (const hole of holesOf(offering, line)) {
      const said = namesAt(text, opening + hole.end, known, already);
      if (said !== undefined && !seen.has(said)) out.push(...said.split('\n'));
      if (said !== undefined) seen.add(said);
    }
    if (line.trim() === '' && writing(index)) out.push(...standingLines(offering.offers).map((each) => `      ${each}`));
  }
  return out;
}

export interface Asked {
  at: string | null;
  walk: boolean;
  line: number | null;
  kinds: readonly string[];
}

const requireDraft = (value: string | undefined): string => {
  if (value === undefined || value.startsWith('-')) throw new Error(`--at wants a draft file after it\n\n${usage}`);
  return value;
};

const LINE = /^\d+$/;

const requireLine = (value: string): number => {
  if (!LINE.test(value) || Number(value) < 1) throw new Error(`--walk takes a line number, and ${JSON.stringify(value)} is not one\n\n${usage}`);
  return Number(value);
};

export function parseArgs(argv: readonly string[]): Asked {
  let at: string | null = null;
  let walk = false;
  let line: number | null = null;
  const kinds: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--at') {
      at = requireDraft(argv[++i]);
      continue;
    }
    if (arg.startsWith('--at=')) {
      at = requireDraft(arg.slice('--at='.length));
      continue;
    }
    if (arg === '--walk') {
      walk = true;
      if (argv[i + 1] !== undefined && LINE.test(argv[i + 1]!)) line = requireLine(argv[++i]!);
      continue;
    }
    if (arg.startsWith('--walk=')) {
      walk = true;
      line = requireLine(arg.slice('--walk='.length));
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`unknown flag ${arg}\n\n${usage}`);
    kinds.push(arg);
  }
  return { at, walk, line, kinds };
}

const WALK = 'For any one line — where it sits, what it is read as, and what may stand there — run this again with --walk <line>, or --walk alone for the whole file.';

export function corpusLines(sources: readonly ModuleSource[]): { lines: string[]; ok: boolean } {
  const world = withEngineLocale(sources);
  const loaded = loadUniverseWithDiagnostics(world);
  const known = declaredBy(loaded.registry);
  const stood = loaded.diagnostics.length === 0;
  const said = sources.flatMap((source) => {
    const amiss = amissIn(source.text, known)
      .map((each) => (stood ? each : { ...each, undeclared: [] }))
      .filter((each) => each.refused !== null || each.undeclared.length > 0);
    return amiss.length === 0 ? [] : [`${source.name}: ${amiss.length} line(s) the engine has something to say about:`, ...amiss.flatMap(wrongIn), ''];
  });
  const remarks = stood ? remarksOn(world, loaded.registry) : [];
  const remarked = remarks.length === 0 ? [] : [`${remarks.length} thing(s) the engine takes and an author probably did not mean:`, ...remarks.map((each) => `  ${each.where} ${each.says}`), ''];
  const verdict = probe(world, { show: [], roundTrip: true, test: [...loaded.registry.tests.keys()] });
  const read = `${sources.length} module(s) read`;
  const lines = [
    ...(said.length === 0
      ? [stood ? `${read}: no line is refused and every id they name is declared` : `${read}: no line is refused on its own, and the world still does not load — see below`, '']
      : [...said, ...(stood ? [] : ['  (the world does not load — see below — so what it declares is not known, and only refusals are listed above)', ''])]),
    ...remarked,
    ...verdict.lines,
  ];
  return { lines, ok: stood && verdict.ok && said.length === 0 && remarks.length === 0 };
}

export function atLines(file: string, written: string, world: readonly ModuleSource[], walk: boolean, line: number | null = null): string[] {
  const read = reading(file, written, world);
  const short = [...amissLines(written, read.known, read.stood), ...takenLines(read)];
  return walk ? [...short, ...offeringLines(written, read.known, line)] : [...short, WALK];
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return;
  }
  let asked: Asked;
  try {
    asked = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (asked.at !== null) {
    if (statSync(asked.at).isDirectory()) {
      const report = corpusLines(readSources([asked.at]));
      console.log(report.lines.join('\n'));
      if (!report.ok) process.exit(1);
      return;
    }
    const written = readFileSync(asked.at, 'utf8').replace(/\r\n?/g, '\n');
    console.log(atLines(asked.at, written, corpus(), asked.walk, asked.line).join('\n'));
    return;
  }
  console.log(grammarLines(asked.kinds.length > 0 ? asked.kinds : sectionKinds()).join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
