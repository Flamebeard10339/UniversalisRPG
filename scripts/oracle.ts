import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Written } from '../src/grammar/parser';
import { align, type Hole } from '../src/grammar/form';
import { offeringAt, said, saysKind, type Addressed } from '../src/content/completion';
import { gathered, shownIn } from '../src/ui/offerGroups';
import { sectionFor, sectionKinds } from '../src/content/sections';
import { addressable } from '../src/ui/authoringSurface';

const usage = [
  'Usage: npm run oracle -- [<kind>...]',
  '       npm run oracle -- --at <draft.dsl>',
  '',
  '  <kind>    print every line that may be written under that kind, at the',
  '            indentation it is written at; with no kind, print every kind',
  '  --at      read a draft: for every line, where it sits, what the engine reads',
  '            it as, what it refuses, and — walking the cursor to each',
  '            placeholder in turn — what may stand there and what is declared',
  '',
  'Ids come from the shipped corpus, so what this prints is what the page shows.',
].join('\n');

const shipped = (): Addressed[] =>
  addressable(
    readdirSync('content')
      .filter((name) => name.endsWith('.dsl'))
      .map((name) => ({ name, text: readFileSync(path.join('content', name), 'utf8') })),
  ).map(({ kind, address }) => ({ kind, address }));

const STEP = '  ';
// No line of the language begins with this, so what is written out here can be told from what an author writes.
const PART = '· ';

// A block is known by the lines it holds and what they name, so the one the results grammar repeats down every branch is written out once and pointed at thereafter, while two lists of bare ids that name different kinds stay apart.
const signOf = (lines: readonly Written[], sitting: Sitting): string => lines.map((line) => `${line.form} names ${saysKind(sitting.under, sitting.indent, line) ?? 'nothing'}`).join('|');

// Where a block sits in a draft, which is what the engine needs in order to be asked what the lines of it name.
interface Sitting {
  under: string;
  indent: number;
}

export function treeLines(lines: readonly Written[], pad: string, sitting: Sitting, written: Map<string, string>, label: string): string[] {
  const held = new Map(lines.map((line) => [line.form, line]));
  const saidOf = (line: Written | undefined): string => {
    const spoken = line === undefined ? undefined : said(line.needs === undefined ? undefined : `only once ${line.needs}: is set`, line.note, saysKind(sitting.under, sitting.indent, line));
    return spoken === undefined ? '' : `   — ${spoken}`;
  };
  // A block whose lines are the values the keyword already takes inline says nothing new: it is the same list, one to a line.
  const listed = (block: readonly Written[], beside: readonly { form: string }[]): boolean => block.every((line) => beside.some((offer) => offer.form.endsWith(`${line.form}, …`)));
  const under = (line: Written | undefined, deeper: string, beside: readonly { form: string }[] = []): string[] => {
    const block = line?.block?.();
    if (block === undefined) return [];
    if (listed(block, beside)) return [];
    const inside: Sitting = { under: [sitting.under, `${' '.repeat(sitting.indent)}${line!.example}`].join('\n'), indent: sitting.indent + 2 };
    const sign = signOf(block, inside);
    const already = written.get(sign);
    if (already !== undefined) return [`${deeper}…indented under it, what \`${already}\` holds`];
    written.set(sign, line!.form);
    return treeLines(block, deeper, inside, written, line!.form);
  };
  const out: string[] = [];
  for (const family of gathered(lines.map((line) => ({ ...line, insert: line.form })))) {
    const own = family.groups.flatMap((group) => [...(group.opens === null ? [] : [group.opens]), ...group.offers]).flatMap((offer) => held.get(offer.form) ?? []);
    const sign = `${family.name} of ${signOf(own, sitting)}`;
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
      for (const [note, shapes] of apart) out.push(`${pad}${group.head === null ? shapes.join(' | ') : `${group.head} ${shapes.join(' | ')}`.trimEnd()}${note}`);
      for (const offer of group.offers) out.push(...under(held.get(offer.form), pad + STEP));
      out.push(...under(held.get(group.head ?? ''), pad + STEP, group.offers));
    }
  }
  return out;
}

// What holds of every kind, so no kind's tree has to repeat it. The tree is written at the indentation an author writes, and everything that is not a line of the language is marked.
const RULES: readonly string[] = [
  `${PART}a line marked like this names a part of the kind and is not written`,
  `${PART}a \`keyword: <a>, <b>\` may instead hold its values one to a line, indented under \`keyword:\``,
];

export function treeOf(kind: string): string[] {
  const owner = sectionFor(kind);
  if (owner === undefined) return [`# ${kind} — no such kind`];
  const sitting = { under: `# ${kind} probe`, indent: 0 };
  // The section's own lines are a block like any other, so a wrapper that holds them again points back at the heading rather than writing them out twice.
  const written = new Map([[signOf(owner.grammar, sitting), `# ${kind}`]]);
  return [`# ${kind} <id>`, ...RULES, ...treeLines(owner.grammar, '', sitting, written, `# ${kind}`)];
}

const NAMED = 14;

// The page names a kind where the cursor stands and lists what an author has begun to type of it; a file has typed the whole of it already, so the oracle lists everything of that kind the world declares.
const namesAt = (text: string, cursor: number, known: readonly Addressed[]): string | undefined => {
  const filling = offeringAt(text, cursor, known).filling;
  if (filling === null) return undefined;
  if (filling.kind === undefined) return `    <${filling.hole}>${filling.like === undefined ? '' : `, like ${filling.like}`}`;
  const named = known.filter((each) => each.kind === filling.kind).map((each) => each.address).sort();
  const listed = named.length === 0 ? 'nothing declares one yet' : `${named.slice(0, NAMED).join(', ')}${named.length > NAMED ? `, … ${named.length - NAMED} more` : ''}`;
  return `    <${filling.hole}> names a # ${filling.kind}: ${listed}`;
};

// A page moves its cursor and the offering follows it; a file does not, so the oracle walks the cursor to each placeholder in turn and reports what stands there.
const holesOf = (offering: { reads: string | null; filling: { form: string } | null }, line: string): readonly Hole[] => {
  const form = offering.reads ?? offering.filling?.form;
  return form === undefined ? [] : (align(form, line.trim())?.holes ?? []);
};

export function offeringLines(text: string, known: readonly Addressed[]): string[] {
  const out: string[] = [];
  let at = 0;
  for (const line of text.split('\n')) {
    at += line.length;
    const offering = offeringAt(text, at, known);
    const reads = offering.reads ?? offering.filling?.form;
    const note = offering.offers.find((offer) => offer.form === reads)?.note;
    const opening = at - line.trimStart().length;
    out.push(`${line || '·'}`);
    out.push(`    in ${offering.where.join(' › ')}, reads as ${reads ?? '?'}${note === undefined ? '' : `   — ${note}`}`);
    if (offering.refused !== null) out.push(`    REFUSED: ${offering.refused}`);
    if (offering.undeclared.length > 0) out.push(`    NOT DECLARED ANYWHERE YET: ${offering.undeclared.join(', ')}`);
    const seen = new Set<string>();
    for (const hole of holesOf(offering, line)) {
      const said = namesAt(text, opening + hole.end, known);
      if (said !== undefined && !seen.has(said)) out.push(said);
      if (said !== undefined) seen.add(said);
    }
    if (line.trim() === '') {
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
    console.log(offeringLines(readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'), shipped()).join('\n'));
    return;
  }
  const kinds = args.length > 0 ? args : sectionKinds();
  console.log(kinds.flatMap((kind) => [...treeOf(kind), '']).join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
