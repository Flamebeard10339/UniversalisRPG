import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic } from '../src/content/registry';
import { registryDiff, type Rewriting } from '../src/content/registryDiff';
import { splitSections } from '../src/grammar/structure';
import { rewritingBetween } from './lib/idForms';
import { blockOf, gap, landing, lineStarts } from './lib/sectionPlacement';
import { corpusOf, readScope, SCOPE, sourceOf, type TextFile } from './rename-module';

export interface MoveReport {
  lines: string[];
  ok: boolean;
  files: TextFile[];
}

export interface Heading {
  kind: string;
  id: string;
}

export const parseHeading = (spec: string): Heading => {
  const at = spec.indexOf(':');
  if (at < 1 || at === spec.length - 1) throw new Error(`a section is named <kind>:<id>, not ${JSON.stringify(spec)}`);
  return { kind: spec.slice(0, at), id: spec.slice(at + 1) };
};

const refused = (lines: string[]): MoveReport => ({ lines: [...lines, '', 'Refused: no file was written.'], ok: false, files: [] });

interface Edit {
  start: number;
  end: number;
  text: string;
}

const applyEdits = (text: string, edits: readonly Edit[]): string =>
  [...edits].sort((one, other) => other.start - one.start).reduce((out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end), text);

export const rewritingOf = (from: string, to: string, headings: readonly Heading[]): Rewriting =>
  rewritingBetween(headings.map((heading) => [{ module: from, ...heading }, { module: to, ...heading }] as const));

export function moveSections(files: readonly TextFile[], from: string, to: string, headings: readonly Heading[]): MoveReport {
  if (from === to) return refused([`${from} and ${to} are the same id, so there is nothing to move.`]);
  if (headings.length === 0) return refused(['No section was named, so there is nothing to move.']);

  const corpus = corpusOf(files);
  const sources = corpus.map(sourceOf);
  const loaded = loadUniverseWithDiagnostics(sources);
  if (loaded.diagnostics.length > 0) {
    return refused(['The corpus does not load, so a move has no registry to be checked against.', ...loaded.diagnostics.map(formatModuleDiagnostic)]);
  }

  const declared = loaded.parsed.filter((module) => module.namespace !== null);
  const names = declared.map((module) => module.namespace).sort().join(', ');
  const fileOf = (id: string): TextFile | undefined => {
    const module = declared.find((each) => each.namespace === id);
    return module === undefined ? undefined : corpus[sources.indexOf(module.source)];
  };
  const held = fileOf(from);
  const into = fileOf(to);
  if (held === undefined) return refused([`No module declares the id ${from}.`, `Declared: ${names}`]);
  if (into === undefined) return refused([`No module declares the id ${to}.`, `Declared: ${names}`]);

  const sections = splitSections(held.text);
  const wanted = headings.map((heading) => ({ heading, found: sections.filter((section) => section.kind === heading.kind && section.id === heading.id) }));
  const absent = wanted.filter((each) => each.found.length !== 1);
  if (absent.length > 0) {
    return refused([
      `${held.path} does not hold exactly one of each section named.`,
      ...absent.map((each) => `  # ${each.heading.kind} ${each.heading.id}: ${each.found.length === 0 ? 'no such section' : `${each.found.length} sections`}`),
    ]);
  }

  const moving = new Set(headings.map((heading) => heading.id));
  const shared = sections.filter((section) => section.id !== undefined && moving.has(section.id) && !headings.some((heading) => heading.kind === section.kind && heading.id === section.id));
  if (shared.length > 0) {
    return refused([
      `${from} keeps a section whose id also moves, and ${from}.<id> is written the same way for both.`,
      ...shared.map((section) => `  # ${section.kind} ${section.id} stays behind`),
    ]);
  }

  const heldLines = lineStarts(held.text);
  const blocks = wanted.map(({ heading, found }) => ({ kind: heading.kind, ...blockOf(held.text, heldLines, found[0].span) }));

  const kinds = [...new Set(blocks.map((block) => block.kind))];
  const cut = applyEdits(held.text, blocks.map((block) => ({ ...block.cut, text: '' })));
  const landed = applyEdits(
    into.text,
    kinds.map((kind) => {
      const at = landing(into.text, kind);
      return { start: at, end: at, text: blocks.filter((block) => block.kind === kind).map((block) => `${gap(into.text)}${block.text}`).join('') };
    }),
  );

  const rewrite = rewritingOf(from, to, headings);
  const edited = new Map<string, string>([
    [held.path, cut],
    [into.path, landed],
  ]);
  const written = new Map<string, TextFile>();
  for (const file of files) {
    const text = rewrite(edited.get(file.path) ?? file.text);
    if (text !== file.text) written.set(file.path, { path: file.path, text });
  }

  const reloaded = loadUniverseWithDiagnostics(corpusOf(files.map((file) => written.get(file.path) ?? file)).map(sourceOf));
  if (reloaded.diagnostics.length > 0) {
    return refused([`The corpus does not load once ${headings.length} section(s) move from ${from} to ${to}.`, ...reloaded.diagnostics.map(formatModuleDiagnostic)]);
  }

  const drift = registryDiff(loaded.registry, reloaded.registry, rewrite);
  if (drift.length > 0) {
    return refused([`Moving ${from}'s sections to ${to} did not leave the registry it should have.`, ...drift.slice(0, 20), ...(drift.length > 20 ? [`… and ${drift.length - 20} more`] : [])]);
  }

  return {
    lines: [
      ...headings.map((heading) => `# ${heading.kind} ${heading.id}: ${from}.${heading.id} → ${to}.${heading.id}`),
      '',
      ...[...written.keys()].sort().map((file) => `  ${file}`),
      '',
      `${headings.length} section(s) moved from ${from} to ${to}, and ${written.size} file(s) rewritten.`,
    ],
    ok: true,
    files: [...written.values()],
  };
}

export const writeMove = (report: MoveReport): void => {
  for (const file of report.files) writeFileSync(file.path, file.text);
};

const usage = [
  'Usage: npm run move-sections -- <from id> <to id> <kind>:<id>...',
  '',
  'Lifts named sections out of one module and lands them in another, and writes',
  'every id they carry under the new module everywhere it is machine-meaningful:',
  'the address written whole in a DSL body, the keys and values inside a `# save`,',
  'and the string literals under src/ and scripts/ that name it. A section travels',
  'with the comment written above it and lands among the sections already of its',
  'kind.',
  '',
  `Only ${SCOPE.join(', ')} are touched. Nothing is written unless the corpus loads`,
  'afterwards and its registry differs from the one before by exactly the moved ids',
  'and nothing else — which registryDiff derives from the section list, so a kind or',
  'a field added next month is covered.',
].join('\n');

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  if (args.length < 3) {
    console.error(`move-sections takes a module to move from, a module to move to, and at least one section\n\n${usage}`);
    process.exit(2);
  }
  const report = moveSections(readScope(), args[0]!, args[1]!, args.slice(2).map(parseHeading));
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
  writeMove(report);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
