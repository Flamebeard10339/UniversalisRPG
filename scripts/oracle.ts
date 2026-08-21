import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Written } from '../src/grammar/parser';
import { offeringAt, type Addressed } from '../src/content/completion';
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

export function treeLines(lines: readonly Written[], deep = 0, seen: ReadonlySet<string> = new Set()): string[] {
  return lines.flatMap((line) => {
    const needs = line.needs === undefined ? '' : `   (only with ${line.needs}:)`;
    const head = `${'  '.repeat(deep + 1)}${line.form}${needs}${line.family === undefined ? '' : `   [${line.family}]`}`;
    if (line.block === undefined || seen.has(line.form)) return [head + (line.block === undefined ? '' : '   …as above')];
    return [head, ...treeLines(line.block(), deep + 1, new Set([...seen, line.form]))];
  });
}

export function treeOf(kind: string): string[] {
  const owner = sectionFor(kind);
  if (owner === undefined) return [`# ${kind} — no such kind`];
  return [`# ${kind}`, ...treeLines(owner.grammar)];
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
    out.push(`    in ${offering.where.join(' › ')}, reads as ${offering.reads ?? '?'}`);
    out.push(`    ${shapes.length} shapes, ${ids.length} ids`);
    let family: string | undefined;
    for (const offer of shapes) {
      if (offer.family !== family) out.push(`      ${offer.family ?? '—'}`);
      family = offer.family;
      out.push(`        ${offer.form}`);
    }
    if (ids.length > 0) out.push(`      ids: ${ids.slice(0, 6).map((offer) => offer.form).join(', ')}${ids.length > 6 ? `, … ${ids.length - 6} more` : ''}`);
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
