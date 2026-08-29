import { readFileSync } from 'node:fs';
import path from 'node:path';
import { align, type Hole } from '../src/grammar/form';
import { amissIn, fillingWords, offeringAt, type Addressed, type Amiss } from '../src/content/completion';
import { grammarLines } from '../src/content/grammarTree';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type ModuleDiagnostic } from '../src/content/registry';
import { shippedSources } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { declaredBy } from '../src/content/references';
import { splitSections, type RawLine, type RawSection } from '../src/grammar/structure';
import { gathered, shownIn } from '../src/content/offerGroups';
import { sectionKinds } from '../src/content/sections';

const usage = [
  'Usage: npm run oracle -- [<kind>...]',
  '       npm run oracle -- --at <draft.dsl> [--walk [<line>]]',
  '',
  '  <kind>    print every line that may be written under that kind, at the',
  '            indentation it is written at; with no kind, print every kind',
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
  'An answer given once is pointed back at rather than written out again.',
].join('\n');

const corpus = (): ModuleSource[] => [...shippedSources()];

// One reading of the draft beside the world, which both the per-line pass and the whole-file verdict are about. A draft stands in the world it declares as well as in the one already loaded, so an id it declares on one line is declared for every other line that names it; a draft the engine will not take is not in that world at all, and then nothing it declares is known. A draft that is a version of a module already loaded takes that module's place in the world rather than standing beside it, since both answers an author wants are about the world their edit would make.
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

// A module the engine will not name, which is still a module the draft has declared: nothing that ships is called this, so such a draft stands beside the world rather than in place of anything in it, and the loader says what is wrong with it.
const UNNAMED = '';

// Which module a text is a version of, or null where it is none. A module is which module it is by the id its own `# info` names and not by where its file sits, so a draft declaring `# info tulsa` is a new tulsa whether it is `content/tulsa.dsl`, a copy under another name, or a scratch file no path comparison would ever match. The heading is read with the grammar's own splitter, so a draft broken further down still says which module it is.
function moduleDeclaredIn(text: string): string | null {
  try {
    const info = splitSections(text).find((section) => section.kind === 'info');
    return info === undefined ? null : (info.id ?? UNNAMED);
  } catch {
    return DECLARES_A_MODULE.test(text) ? UNNAMED : null;
  }
}

const slug = (file: string): string => path.basename(file).replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'draft';

// Ids are kept apart by the module that owns them, so the engine will not take a file that declares none. A draft that has not said which module it is is read as one of its own, standing on everything already loaded.
export function draftModule(file: string, text: string, world: readonly ModuleSource[]): { source: ModuleSource; supplied: boolean } {
  const id = slug(file);
  if (moduleDeclaredIn(text) !== null) return { source: { name: id, text }, supplied: false };
  const loaded = loadUniverseWithDiagnostics(world).loadedModules;
  const head = [`# info ${id}`, 'version: 0.0.1', ...(loaded.length === 0 ? [] : ['dependencies:', ...loaded.map((each) => `  ${each}`)]), ''];
  return { source: { name: id, text: [...head, text].join('\n') }, supplied: true };
}

// What the engine says when it is handed the whole file beside everything already loaded. The lines above are each read on their own, and a rule that is about two sections at once — one starting location, one player, a table that rolls itself — has no line to be laid on and is only reachable by taking the file.
export function takenLines({ said, read, stood }: Reading): string[] {
  if (stood) return [`the engine takes this file into the world, ${read}`, ''];
  return [`the engine will not take this file into the world, ${read}.`, 'It stops at the first thing it cannot take, so fixing this may uncover another:', ...said.map((each) => `  ${formatModuleDiagnostic(each)}`), ''];
}

const NAMED = 24;

// The page names a kind where the cursor stands and lists what an author has begun to type of it; a file has typed the whole of it already, so the oracle lists everything of that kind the world declares.
const namesAt = (text: string, cursor: number, known: readonly Addressed[], already: Set<string>): string | undefined => {
  const offering = offeringAt(text, cursor, known);
  if (offering.filling === null) return undefined;
  // A hole that holds a whole line of its own — a `<result>` — names nothing itself, but the line in it does, and that is what an author standing there is choosing.
  const kind = offering.filling.kind ?? [...new Set(offering.offers.flatMap((offer) => (offer.kind === undefined ? [] : [offer.kind])))][0];
  const ids = (of: string): string => {
    const named = known.filter((each) => each.kind === of).map((each) => each.address).sort();
    return named.length === 0 ? 'none anywhere' : `${named.slice(0, NAMED).join(', ')}${named.length > NAMED ? `, … and ${named.length - NAMED} more, ${named.length} in all` : ''}`;
  };
  // A hole with a grammar of its own is broken into the words it is written with and the things it may name; a hole that only names something is that one list.
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
  // What a hole holds is the same answer wherever it is asked for, and a draft asks on every line. It is written out where it is first met and pointed back at after.
  const key = [kind, ...(holds?.words ?? []), ...(holds?.names ?? []).map((each) => each.hole)].join('|');
  if (under.length === 0) return words;
  if (already.has(key)) return `${words}, as above`;
  already.add(key);
  return [words, ...under].join('\n');
};

// A page moves its cursor and the offering follows it; a file does not, so the oracle walks the cursor to each placeholder in turn and reports what stands there.
const holesOf = (offering: { reads: string | null; filling: { form: string } | null }, line: string): readonly Hole[] => {
  const form = offering.reads ?? offering.filling?.form;
  // Read against the line as written but for its indentation: a line that stops in the middle of a hole stops there, and trimming its end would close the hole an author is standing in.
  return form === undefined ? [] : (align(form, line.trimStart())?.holes ?? []);
};

const wrongIn = (each: Amiss): string[] => [
  `  line ${each.line}: ${each.written.trim() === '' ? '(blank)' : each.written.trim()}`,
  ...(each.refused === null ? [] : [`    the engine will not read this line: ${each.refused}`]),
  ...(each.undeclared.length === 0 ? [] : [`    nothing declares ${each.undeclared.map((one) => `${one.id} as a # ${one.kind}${one.meant === undefined ? '' : `, one letter from ${one.meant}`}`).join(', ')}`]),
];

// What stands between the draft and the engine taking it, said first and all at once, so an author works down a list rather than reading every line looking for the one that is wrong.
//
// A draft the engine would not take is not in the world, so nothing it declares is known and every id it names itself reads as undeclared — hundreds of lines of noise around the one refusal that caused it. In that state only the refusals are reported, and the whole-file verdict below names what kept the draft out.
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

// Which lines of a draft the engine actually reads, taken from the splitter's own account of what it kept — so nothing here has to know what a comment looks like, and a comment written where no one would guess one is legal is still read as one. Null where the splitter will not split the file at all, and then every line is answered for, as it was before there was anything to skip.
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
  // A blank line before the next heading is the end of a section, not a place an author is about to write, and the whole grammar of the kind above it is nothing they asked for.
  const writing = (after: number): boolean => draft.slice(after + 1).find((line) => line.trim() !== '')?.startsWith('#') !== true;
  // A line the engine drops is not a place an author writes either, so it is passed over the same way. A blank line is kept: what may be written on it is the one thing an author standing there is asking.
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
    if (line.trim() === '' && writing(index)) {
      for (const family of gathered(offering.offers.filter((offer) => offer.kind === undefined))) {
        out.push(`      ${family.name ?? '—'}`);
        for (const group of family.groups) {
          if (group.head !== null) out.push(`        ${group.head}${group.opens === null ? '' : ' — opens a block'}`);
          for (const offer of group.offers) out.push(`        ${group.head === null ? '' : '  '}${shownIn(group, offer)}${offer.note === undefined ? '' : `   — ${offer.note}`}`);
        }
      }
    }
  }
  return out;
}

export interface Asked {
  at: string | null;
  walk: boolean;
  // The one line the walk was asked about, where it was asked about one. A module is thousands of lines walked and an author who is stuck is stuck on one of them.
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
      // A kind is a word and a line is a number, so the one that follows --walk says on its own which it is.
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

// Where the walk is left unasked for, the answer says it is there. It is the rest of the same question, and an author stuck on one line has no other way to hear of it.
const WALK = 'For any one line — where it sits, what it is read as, and what may stand there — run this again with --walk <line>, or --walk alone for the whole file.';

export function atLines(file: string, written: string, world: readonly ModuleSource[], walk: boolean, line: number | null = null): string[] {
  const read = reading(file, written, world);
  const short = [...amissLines(written, read.known, read.stood), ...takenLines(read)];
  return walk ? [...short, ...offeringLines(written, read.known, line)] : [...short, WALK];
}

function main(): void {
  const argv = process.argv.slice(2);
  // Asked for before anything is read as anything else, so a flag mistyped after it still gets the page that says what the flags are.
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
    const written = readFileSync(asked.at, 'utf8').replace(/\r\n?/g, '\n');
    console.log(atLines(asked.at, written, corpus(), asked.walk, asked.line).join('\n'));
    return;
  }
  console.log(grammarLines(asked.kinds.length > 0 ? asked.kinds : sectionKinds()).join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
