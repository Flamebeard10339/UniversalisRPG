import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { keyedUnderOwnerKind, namesSection, spelledSegments } from '../src/content/namespace';
import { formatModuleDiagnostic } from '../src/content/registry';
import { registryDiff, sameValue, type Rewriting } from '../src/content/registryDiff';
import { moduleNamed } from '../src/content/resolve';
import { isSectionKind, ownedSectionKinds, parseSectionOf, sectionFor, sectionKinds, sectionOf, visitSection, type SectionKind } from '../src/content/sections';
import { CORPUS_DIR } from '../src/content/shipped';
import { splitSections } from '../src/grammar/structure';
import { occurrencesOf, rewritingBetween } from './lib/idForms';
import { covers } from './lib/layers';
import { posix, trackedFiles } from './lib/sourceFiles';
import { parseHeading, type Heading } from './move-sections';
import { corpusOf, sourceOf, type TextFile } from './rename-module';

export { parseHeading };

export const OUTSIDE: readonly string[] = ['src', 'scripts', 'package.json'];

export interface SectionRenameReport {
  lines: string[];
  ok: boolean;
  files: TextFile[];
  address: string | null;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Ref {
  kind: string;
  id: string;
}

const refused = (lines: string[], address: string | null = null): SectionRenameReport => ({ lines: [...lines, '', 'Refused: no file was written.'], ok: false, files: [], address });

const cloned = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const applyEdits = (text: string, edits: readonly Edit[]): string =>
  [...edits].sort((one, other) => other.start - one.start).reduce((out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end), text);

const overlaps = (edit: Edit, taken: readonly Edit[]): boolean => taken.some((each) => edit.start < each.end && each.start < edit.end);

const headingTakes = (kind: string, id: string): boolean => {
  try {
    const raw = splitSections(`# ${kind} ${id}`);
    return raw.length === 1 && raw[0]!.kind === kind && raw[0]!.id === id;
  } catch {
    return false;
  }
};

const parsedSection = (text: string): { kind: SectionKind; value: object } | null => {
  try {
    const raw = splitSections(text);
    if (raw.length !== 1 || !isSectionKind(raw[0]!.kind)) return null;
    return parseSectionOf(raw[0]!) as { kind: SectionKind; value: object };
  } catch {
    return null;
  }
};

const refsOf = (kind: SectionKind, value: object): Ref[] => {
  const found: Ref[] = [];
  visitSection(sectionOf(kind, cloned(value)), `# ${kind}`, (each, id) => {
    found.push({ kind: each, id });
    return id;
  });
  return found;
};

const withRefs = (kind: SectionKind, value: object, ids: readonly string[]): object => {
  const next = cloned(value);
  let at = 0;
  visitSection(sectionOf(kind, next), `# ${kind}`, () => ids[at++]!);
  return next;
};

const oneWordApart = (before: string, after: string, from: string, to: string): boolean => {
  for (const match of before.matchAll(occurrencesOf(from))) {
    if (`${before.slice(0, match.index)}${to}${before.slice(match.index + from.length)}` === after) return true;
  }
  return false;
};

const listed = (lines: readonly string[]): string[] => [...lines.slice(0, 20), ...(lines.length > 20 ? [`… and ${lines.length - 20} more`] : [])];

export function renameSection(files: readonly TextFile[], named: Heading, to: string, root: string = CORPUS_DIR): SectionRenameReport {
  if (!isSectionKind(named.kind)) return refused([`${named.kind} is no section kind.`, `Kinds: ${[...sectionKinds()].sort().join(', ')}`]);
  const kind = named.kind as SectionKind;
  if (sectionFor(kind)?.ids !== 'owned') {
    return refused([`# ${kind} ids are not a module's own, so a rename here has no module to be checked under.`, `Renameable kinds: ${[...ownedSectionKinds()].sort().join(', ')}`]);
  }
  if (to.includes('.')) return refused([`${to} names a module, and a section is renamed inside the one it already belongs to: write the new id on its own.`]);
  if (!headingTakes(kind, to)) return refused([`${to} is not an id the language takes: a heading is written \`# ${kind} <id>\`, and an id is lower case, starts with a letter, and holds letters, digits and hyphens.`]);

  const corpus = corpusOf(files, root);
  const sources = corpus.map(sourceOf);
  const loaded = loadUniverseWithDiagnostics(sources);
  if (loaded.diagnostics.length > 0) {
    return refused(['The corpus does not load, so a rename has no registry to be checked against.', ...loaded.diagnostics.map(formatModuleDiagnostic)]);
  }

  const declared = loaded.registry.namespace.declaredKeys(kind);
  const matches = declared.filter((each) => namesSection(each, named.id));
  if (matches.length === 0) return refused([`No # ${kind} is named ${named.id}.`, ...listed([`Declared: ${declared.sort().join(', ') || 'none'}`])]);
  if (matches.length > 1) return refused([`${named.id} is ambiguous between ${matches.sort().join(' and ')}.`, `Write the one you mean whole: ${kind}:${matches.sort()[0]}`]);

  const key = matches[0]!;
  const module = moduleNamed(key);
  if (module === null) return refused([`# ${kind} ${key} names no module, so there is no file it belongs to.`]);
  const id = key.slice(module.length + 1);
  if (id === to) return refused([`${key} is already written as ${to}, so there is nothing to rename.`]);
  const renamed = `${module}.${to}`;
  if (loaded.registry.namespace.has(kind, renamed)) return refused([`# ${kind} ${renamed} is already declared, and two sections of one kind may not share an id.`]);

  const rewrite: Rewriting = rewritingBetween([[{ module, kind, id }, { module, kind, id: to }]]);

  const underTarget = (refKind: string, resolved: string): boolean => {
    const under = keyedUnderOwnerKind(refKind) ? resolved.slice(resolved.indexOf('.') + 1) : resolved;
    return under === key || under.startsWith(`${key}.`);
  };

  const namesTarget = (refKind: string, raw: string, self: string): boolean => {
    const segments = spelledSegments(refKind, raw, self);
    const parts = keyedUnderOwnerKind(refKind) ? segments.slice(1) : segments;
    if (refKind === kind && namesSection(key, parts.join('.'))) return true;
    for (let take = parts.length - 1; take >= 1; take -= 1) if (namesSection(key, parts.slice(0, take).join('.'))) return true;
    return false;
  };

  const reaching = new Set<string>([module]);
  for (const parsed of loaded.parsed) {
    const namespace = parsed.namespace;
    if (namespace === null || reaching.has(namespace)) continue;
    for (const section of parsed.sections) {
      if (!isSectionKind(section.kind)) continue;
      try {
        if (!refsOf(section.kind as SectionKind, section.value).some((ref) => underTarget(ref.kind, ref.id))) continue;
      } catch {
        continue;
      }
      reaching.add(namespace);
      break;
    }
  }

  const moduleOf = new Map<string, string>();
  for (const parsed of loaded.parsed) {
    const held = corpus[sources.indexOf(parsed.source)];
    if (held !== undefined && parsed.namespace !== null) moduleOf.set(held.path, parsed.namespace);
  }

  const rewrites = (before: { kind: SectionKind; value: object }, text: string, self: string): boolean => {
    const after = parsedSection(text);
    if (after === null || after.kind !== before.kind) return false;
    let one: Ref[];
    let other: Ref[];
    try {
      one = refsOf(before.kind, before.value);
      other = refsOf(after.kind, after.value);
    } catch {
      return false;
    }
    if (one.length !== other.length) return false;
    let moved = 0;
    for (let at = 0; at < one.length; at += 1) {
      if (one[at]!.kind !== other[at]!.kind) return false;
      if (one[at]!.id === other[at]!.id) continue;
      moved += 1;
      if (!namesTarget(one[at]!.kind, one[at]!.id, self)) return false;
      if (!oneWordApart(one[at]!.id, other[at]!.id, id, to)) return false;
    }
    if (moved === 0) return false;
    try {
      return sameValue(before.value, withRefs(after.kind, after.value, one.map((ref) => ref.id)));
    } catch {
      return false;
    }
  };

  const local = occurrencesOf(id);
  const qualified = [occurrencesOf(`${module}.${id}`), occurrencesOf(`${module}.${kind}.${id}`), new RegExp(`"${module}","${id}"`, 'g')];
  const written = new Map<string, TextFile>();
  const counts = new Map<string, number>();

  for (const file of corpus) {
    const text = file.text;
    const self = moduleOf.get(file.path);
    const taken: Edit[] = [...qualified].flatMap((pattern) => [...text.matchAll(pattern)].map((match) => ({ start: match.index, end: match.index + match[0].length, text: match[0] })));
    const edits: Edit[] = [];

    for (const section of splitSections(text)) {
      const stop = text.indexOf('\n', section.span.start);
      const heading = text.slice(section.span.start, stop < 0 ? text.length : stop);
      const before = /^#[ \t]+[a-z][a-z0-9-]*[ \t]+/.exec(heading);
      if (section.kind === kind && section.id === id && self === module && before !== null) {
        edits.push({ start: section.span.start + before[0].length, end: section.span.start + before[0].length + id.length, text: to });
        continue;
      }
      if (self === undefined || !reaching.has(self)) continue;
      const body = text.slice(section.span.start, section.span.end);
      const parsed = parsedSection(body);
      if (parsed === null) continue;
      for (const match of body.matchAll(local)) {
        const edit = { start: section.span.start + match.index, end: section.span.start + match.index + id.length, text: to };
        if (overlaps(edit, taken) || overlaps(edit, edits)) continue;
        if (rewrites(parsed, `${body.slice(0, match.index)}${to}${body.slice(match.index + id.length)}`, self)) edits.push(edit);
      }
    }

    const next = rewrite(applyEdits(text, edits));
    if (next === text) continue;
    const found = edits.length + [...qualified].reduce((sum, pattern) => sum + (text.match(pattern)?.length ?? 0), 0);
    counts.set(file.path, found);
    written.set(file.path, { path: file.path, text: next });
  }

  const reloaded = loadUniverseWithDiagnostics(corpusOf(files.map((file) => written.get(file.path) ?? file), root).map(sourceOf));
  if (reloaded.diagnostics.length > 0) {
    return refused([`The corpus does not load once # ${kind} ${key} is written as ${renamed}.`, ...reloaded.diagnostics.map(formatModuleDiagnostic)]);
  }

  const held = new Set(reloaded.registry.namespace.snapshot());
  const wanted = loaded.registry.namespace.snapshot().map(rewrite);
  const gone = new Set(wanted);
  const drift = [
    ...registryDiff(loaded.registry, reloaded.registry, rewrite),
    ...wanted.filter((line) => !held.has(line)).map((line) => `  namespace: missing ${line}`),
    ...[...held].filter((line) => !gone.has(line)).map((line) => `  namespace: added ${line}`),
  ];
  if (drift.length > 0) return refused([`Writing # ${kind} ${key} as ${renamed} did not leave the registry it should have.`, ...listed(drift)], key);

  const total = [...counts.values()].reduce((sum, each) => sum + each, 0);
  return {
    lines: [
      `# ${kind} ${id} → # ${kind} ${to}, so ${key} → ${renamed}`,
      '',
      ...[...counts].sort(([one], [other]) => one.localeCompare(other)).map(([file, found]) => `  ${file}: ${found}`),
      '',
      `${total} occurrence(s) written in ${counts.size} file(s).`,
    ],
    ok: true,
    files: [...written.values()],
    address: key,
  };
}

export const writeRename = (report: SectionRenameReport): void => {
  for (const file of report.files) writeFileSync(file.path, file.text);
};

const dslUnder = (root: string): string[] => {
  const found: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const here = path.join(at, entry.name);
      if (entry.isDirectory()) walk(here);
      else if (entry.name.endsWith('.dsl')) found.push(posix(here));
    }
  };
  walk(root);
  return found.sort();
};

export const readCorpus = (root: string): TextFile[] => dslUnder(root).map((file) => ({ path: file, text: readFileSync(file, 'utf8') }));

export function mentionsOutside(root: string, address: string): string[] {
  return trackedFiles()
    .map(posix)
    .filter((file) => OUTSIDE.some((each) => covers(each, file)) && !covers(root, file))
    .filter((file) => occurrencesOf(address).test(readFileSync(file, 'utf8')))
    .sort();
}

const usage = [
  'Usage: npm run rename-section -- <kind>:<old id> <new id> [--at <dir>] [--dry-run]',
  '',
  'Writes one section under a new id everywhere the world reads it: its own heading, every',
  'reference to it — bare inside its module, qualified from another, and the flags, dialogue',
  'nodes and actions minted beneath it — and every key and value inside a `# save`. Which lines',
  'hold a reference is read off each kind\'s own walk, so a field added next month is covered.',
  '',
  'The old id is written whole where two modules declare one of a kind, as location:tulsa.shore;',
  'the new id is written on its own, since a section is renamed inside the module it belongs to.',
  '',
  `--at <dir> is the world to read, and defaults to ${CORPUS_DIR}. --dry-run says what it would`,
  'write and writes nothing.',
  '',
  `Nothing under ${OUTSIDE.join(', ')} is written: a section id is a word, and one there is more`,
  'likely a fixture that happens to spell it. Every tracked file outside the world that names this',
  'section is reported instead, to be read by hand. A comment is left as it was written.',
  '',
  'Nothing is written unless the world loads afterwards and its registry and its namespace differ',
  'from the ones before by exactly this id and nothing else.',
].join('\n');

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  const dry = args.includes('--dry-run');
  const at = args.indexOf('--at');
  const root = at < 0 ? CORPUS_DIR : posix(args[at + 1] ?? '');
  const loose = args.filter((each, index) => !each.startsWith('--') && (at < 0 || index !== at + 1));
  if (loose.length !== 2 || root === '') {
    console.error(`rename-section takes a section and a new id\n\n${usage}`);
    process.exit(2);
  }
  const report = renameSection(readCorpus(root), parseHeading(loose[0]!), loose[1]!, root);
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);

  const outside = mentionsOutside(root, report.address!);
  if (outside.length > 0) {
    console.log(['', `READ BY HAND: ${outside.length} tracked file(s) outside ${root} name this section and were NOT written:`, ...outside.map((file) => `  ${file}`)].join('\n'));
  }
  if (dry) {
    console.log(['', `--dry-run: ${report.files.length} file(s) left as they were.`].join('\n'));
    return;
  }
  writeRename(report);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
