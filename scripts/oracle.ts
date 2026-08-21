import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Written } from '../src/grammar/parser';
import { offeringAt, said, saysKind, type Addressed } from '../src/content/completion';
import { gathered, shownIn } from '../src/ui/offerGroups';
import { sectionFor, sectionKinds } from '../src/content/sections';
import { addressable } from '../src/ui/authoringSurface';

const usage = [
  'Usage: npm run oracle -- [<kind>...]',
  '       npm run oracle -- --at <draft.dsl>',
  '',
  '  <kind>    print the grammar tree the editing page offers under that kind;',
  '            with no kind, print every kind',
  '  --at      print what the page would offer at the end of every line of a draft,',
  '            which is what an author sees as they type it',
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

// A block is known by the lines it holds and what they name, so the one the results grammar repeats down every branch is written out once and pointed at thereafter, while two lists of bare ids that name different kinds stay apart.
const signOf = (lines: readonly Written[], sitting: Sitting): string => lines.map((line) => `${line.form} names ${saysKind(sitting.under, sitting.indent, line) ?? 'nothing'}`).join('|');

// Where a block sits in a draft, which is what the engine needs in order to be asked what the lines of it name.
interface Sitting {
  under: string;
  indent: number;
}

export function treeLines(lines: readonly Written[], pad: string, sitting: Sitting, written: Map<string, string>): string[] {
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
    return treeLines(block, deeper, inside, written);
  };
  const out: string[] = [];
  for (const family of gathered(lines.map((line) => ({ ...line, insert: line.form })))) {
    if (family.name !== null) out.push(`${pad}${family.name}`);
    const at = family.name === null ? pad : pad + STEP;
    for (const group of family.groups) {
      const inner = group.head === null ? at : at + STEP;
      const already = group.head === null ? '' : saidOf(held.get(group.head));
      if (group.head !== null) out.push(`${at}${group.head}${already}`);
      for (const offer of group.offers) {
        const spoken = saidOf(held.get(offer.form));
        out.push(`${inner}${shownIn(group, offer)}${spoken === already ? '' : spoken}`, ...under(held.get(offer.form), inner + STEP));
      }
      out.push(...under(held.get(group.head ?? ''), inner, group.offers));
    }
  }
  return out;
}

// What holds of every kind, so no kind's tree has to repeat it: a `keyword:` that takes a list takes it inline or one value to a line under it, and `— # thing` says the ids that line names are of that kind.
const RULES = 'a `keyword: <a>, <b>` may instead hold its values one to a line, indented under `keyword:`';

export function treeOf(kind: string): string[] {
  const owner = sectionFor(kind);
  if (owner === undefined) return [`# ${kind} — no such kind`];
  const sitting = { under: `# ${kind} probe`, indent: 0 };
  // The section's own lines are a block like any other, so a wrapper that holds them again points back at the heading rather than writing them out twice.
  const written = new Map([[signOf(owner.grammar, sitting), `# ${kind}`]]);
  return [`# ${kind} <id>`, `${STEP}(${RULES})`, ...treeLines(owner.grammar, STEP, sitting, written)];
}

export function offeringLines(text: string, known: readonly Addressed[]): string[] {
  const out: string[] = [];
  let at = 0;
  for (const line of text.split('\n')) {
    at += line.length;
    const offering = offeringAt(text, at, known);
    const ids = offering.offers.filter((offer) => offer.kind !== undefined);
    const shapes = offering.offers.filter((offer) => offer.kind === undefined);
    out.push(`${line || '·'}`);
    out.push(`    in ${offering.where.join(' › ')}, reads as ${offering.reads ?? offering.filling?.form ?? '?'}`);
    if (offering.filling !== null) out.push(`    filling <${offering.filling.hole}>${offering.filling.kind === undefined ? '' : ` — # ${offering.filling.kind}`}${offering.filling.like === undefined ? '' : `, like ${offering.filling.like}`}`);
    if (offering.refused !== null) out.push(`    REFUSED: ${offering.refused}`);
    if (offering.undeclared.length > 0) out.push(`    NOT DECLARED ANYWHERE YET: ${offering.undeclared.join(', ')}`);
    for (const family of gathered(shapes)) {
      out.push(`      ${family.name ?? '—'}`);
      for (const group of family.groups) {
        if (group.head !== null) out.push(`        ${group.head}${group.opens === null ? '' : ' — opens a block'}`);
        for (const offer of group.offers) out.push(`        ${group.head === null ? '' : '  '}${shownIn(group, offer)}${offer.note === undefined ? '' : `   — ${offer.note}`}`);
      }
    }
    for (const family of gathered(ids)) out.push(`      ${family.name ?? '—'}: ${family.groups.flatMap((group) => group.offers).slice(0, 8).map((offer) => offer.form).join(', ')}`);
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
