import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Written } from '../src/grammar/parser';
import { align, type Hole } from '../src/grammar/form';
import { NOTE_MARK } from '../src/grammar/note';
import { amissIn, fillingWords, namesKind, offeringAt, said, type Addressed, type Amiss } from '../src/content/completion';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';
import { declaredBy } from '../src/content/references';
import { gathered, shownIn } from '../src/ui/offerGroups';
import { sectionFor, sectionKinds } from '../src/content/sections';

const usage = [
  'Usage: npm run oracle -- [<kind>...]',
  '       npm run oracle -- --at <draft.dsl>',
  '',
  '  <kind>    print every line that may be written under that kind, at the',
  '            indentation it is written at; with no kind, print every kind',
  '  --at      read a draft: every line the engine has something to say about,',
  '            then what it says when handed the whole file beside the world as',
  '            it stands, then — walking the cursor to each placeholder in turn —',
  '            where each line sits, what it is read as, and what may stand there',
  '',
  'Ids come from the shipped corpus, so what this prints is what the page shows.',
  'An answer given once is pointed back at rather than written out again.',
].join('\n');

const corpus = (): ModuleSource[] =>
  readdirSync('content')
    .filter((name) => name.endsWith('.dsl'))
    .map((name) => ({ name, text: readFileSync(path.join('content', name), 'utf8') }));

const shipped = (world: readonly ModuleSource[]): Addressed[] => declaredBy(loadUniverseWithDiagnostics(world).registry);

const DECLARES_A_MODULE = /^#[ \t]+info\b/m;

const slug = (file: string): string => path.basename(file).replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'draft';

// Ids are kept apart by the module that owns them, so the engine will not take a file that declares none. A draft that has not said which module it is is read as one of its own, standing on everything already loaded.
export function draftModule(file: string, text: string, world: readonly ModuleSource[]): { source: ModuleSource; supplied: boolean } {
  const id = slug(file);
  if (DECLARES_A_MODULE.test(text)) return { source: { name: id, text }, supplied: false };
  const loaded = loadUniverseWithDiagnostics(world).loadedModules;
  const head = [`# info ${id}`, 'version: 0.0.1', ...(loaded.length === 0 ? [] : ['dependencies:', ...loaded.map((each) => `  ${each}`)]), ''];
  return { source: { name: id, text: [...head, text].join('\n') }, supplied: true };
}

// What the engine says when it is handed the whole file beside everything already loaded. The lines above are each read on their own, and a rule that is about two sections at once — one starting location, one player, a table that rolls itself — has no line to be laid on and is only reachable by taking the file.
export function takenLines(file: string, text: string, world: readonly ModuleSource[]): string[] {
  const { source, supplied } = draftModule(file, text, world);
  const said = loadUniverseWithDiagnostics([...world, source]).diagnostics;
  const read = supplied ? `read as # info ${source.name} standing on everything already loaded, since the file declares no module of its own` : 'read as the module it declares';
  if (said.length === 0) return [`the engine takes this file into the world, ${read}`, ''];
  return [`the engine will not take this file into the world, ${read}.`, 'It stops at the first thing it cannot take, so fixing this may uncover another:', ...said.map((each) => `  ${formatModuleDiagnostic(each)}`), ''];
}

const STEP = '  ';
// No line of the language begins with this, so what is written out here can be told from what an author writes.
const PART = '· ';

// A block is known by the lines it holds and what they name, so the one the results grammar repeats down every branch is written out once and pointed at thereafter, while two lists of bare ids that name different kinds stay apart.
const signOf = (lines: readonly Written[]): string => lines.map((line) => `${line.form} names ${namesKind(line) ?? 'nothing'}`).join('|');

// Where a block sits in a draft, which is what the engine needs in order to write out one line of it at the indentation an author writes.
interface Sitting {
  under: string;
  indent: number;
}

export function treeLines(lines: readonly Written[], pad: string, sitting: Sitting, written: Map<string, string>, label: string): string[] {
  const held = new Map(lines.map((line) => [line.form, line]));
  const saidOf = (line: Written | undefined): string => {
    const spoken = line === undefined ? undefined : said(line.needs === undefined ? undefined : `only once ${line.needs}: is set`, line.note, namesKind(line));
    return spoken === undefined ? '' : `   — ${spoken}`;
  };
  // A block whose lines are the values the keyword already takes inline says nothing new: it is the same list, one to a line.
  const listed = (block: readonly Written[], beside: readonly { form: string }[]): boolean => block.every((line) => beside.some((offer) => offer.form.endsWith(`${line.form}, …`)));
  const under = (line: Written | undefined, deeper: string, beside: readonly { form: string }[] = []): string[] => {
    const block = line?.block?.();
    if (block === undefined) return [];
    if (listed(block, beside)) return [];
    const inside: Sitting = { under: [sitting.under, `${' '.repeat(sitting.indent)}${line!.example}`].join('\n'), indent: sitting.indent + 2 };
    const sign = signOf(block);
    const already = written.get(sign);
    if (already !== undefined) return [`${deeper}…indented under it, what \`${already}\` holds`];
    written.set(sign, line!.form);
    return treeLines(block, deeper, inside, written, line!.form);
  };
  const out: string[] = [];
  for (const family of gathered(lines.map((line) => ({ ...line, insert: line.form })))) {
    const own = family.groups.flatMap((group) => [...(group.opens === null ? [] : [group.opens]), ...group.offers]).flatMap((offer) => held.get(offer.form) ?? []);
    const sign = `${family.name} of ${signOf(own)}`;
    const already = family.name === null ? undefined : written.get(sign);
    // A part is named beside the lines that belong to it rather than above and outside them, so what is indented here is what an author indents.
    if (family.name !== null) out.push(`${pad}${PART}${family.name}${already === undefined ? '' : `, as under \`${already}\``}`);
    if (already !== undefined) continue;
    if (family.name !== null) written.set(sign, label);
    // The shapes a keyword takes stand on its own line, one or another of them; only a block it opens is indented, because only a block is indented in a file.
    for (const group of family.groups) {
      const spoken = (form: string | null): string => (form === null ? '' : saidOf(held.get(form)));
      const apart = new Map<string, string[]>();
      for (const offer of group.offers) {
        const note = spoken(offer.form) || spoken(group.head);
        apart.set(note, [...(apart.get(note) ?? []), shownIn(group, offer)]);
      }
      // A shape says what may be written and a line says what it looks like written; neither on its own tells an author where the spaces go.
      const like = (shapes: readonly string[]): string => {
        const shown = group.offers.filter((offer) => shapes.includes(shownIn(group, offer))).map((offer) => held.get(offer.form)?.example);
        const example = shown.find((each) => each !== undefined && /[<[]/.test(group.head === null ? shapes[0]! : `${group.head} ${shapes[0]!}`));
        return example === undefined ? '' : `   e.g. ${example}`;
      };
      for (const [note, shapes] of apart) out.push(`${pad}${group.head === null ? shapes.join(' | ') : `${group.head} ${shapes.join(' | ')}`.trimEnd()}${like(shapes)}${note}`);
      for (const offer of group.offers) out.push(...under(held.get(offer.form), pad + STEP));
      out.push(...under(held.get(group.head ?? ''), pad + STEP, group.offers));
    }
  }
  return out;
}

// What holds of every kind, so no kind's tree has to repeat it. The tree is written at the indentation an author writes, and everything that is not a line of the language is marked.
const RULES: readonly string[] = [
  `${PART}a line marked like this names a part of the kind and is not written`,
  `${PART}a keyword whose shape trails off in \`, …\` takes a list, and may instead hold it one value to a line, indented under the bare \`keyword:\``,
  `${PART}an \`e.g.\` shows one line of that shape written out; the ids in it stand for ids and are not ids anything declares`,
  `${PART}an id may be written whole, as \`tutorial-island.bread\`, or by the name its own module gave it, as \`bread\``,
  `${PART}in a line the game says to a player, a \`${NOTE_MARK}\` and everything after it is a note the engine drops: write what you can say now, then \`${NOTE_MARK}\` alone to mark it rough, or \`${NOTE_MARK} <what you wanted>\` where the engine cannot do what was asked. \`npm run notes\` lists them`,
];

export function treeOf(kind: string): string[] {
  const owner = sectionFor(kind);
  if (owner === undefined) return [`# ${kind} — no such kind`];
  const sitting = { under: `# ${kind} probe`, indent: 0 };
  // The section's own lines are a block like any other, so a wrapper that holds them again points back at the heading rather than writing them out twice.
  const written = new Map([[signOf(owner.grammar), `# ${kind}`]]);
  return [`# ${kind} <id>`, ...RULES, ...treeLines(owner.grammar, '', sitting, written, `# ${kind}`)];
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
export function amissLines(text: string, known: readonly Addressed[]): string[] {
  const amiss = amissIn(text, known);
  if (amiss.length === 0) return ['nothing here is refused and every id it names is declared', ''];
  return [`${amiss.length} line(s) the engine has something to say about:`, ...amiss.flatMap(wrongIn), ''];
}

export function offeringLines(text: string, known: readonly Addressed[]): string[] {
  const out: string[] = [];
  const already = new Set<string>();
  const draft = text.split('\n');
  // A blank line before the next heading is the end of a section, not a place an author is about to write, and the whole grammar of the kind above it is nothing they asked for.
  const writing = (after: number): boolean => draft.slice(after + 1).find((line) => line.trim() !== '')?.startsWith('#') !== true;
  let at = 0;
  for (const [index, line] of draft.entries()) {
    at += line.length;
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
    at += 1;
  }
  return out;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(usage);
    return;
  }
  const draft = args.indexOf('--at');
  if (draft >= 0) {
    const file = args[draft + 1];
    if (file === undefined) {
      console.error(usage);
      process.exit(2);
    }
    const written = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    const world = corpus();
    const known = shipped(world);
    console.log([...amissLines(written, known), ...takenLines(file, written, world), ...offeringLines(written, known)].join('\n'));
    return;
  }
  const kinds = args.length > 0 ? args : sectionKinds();
  console.log(kinds.flatMap((kind) => [...treeOf(kind), '']).join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
