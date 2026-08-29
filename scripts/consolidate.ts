import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleLocalId } from '../src/grammar/section';
import { splitSections } from '../src/grammar/structure';
import { gap, landing } from './lib/sectionPlacement';
import { deleteLocalSection, listLocalSections, LOCAL_CHANGES_MODULE_ID, type LocalSection } from '../src/content/localChanges';
import { declaredKey } from '../src/content/resolve';
import { formatModuleDiagnostic } from '../src/content/registry';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { patchedInto, writesEntries } from '../src/content/patch';
import { registryDiff } from '../src/content/registryDiff';
import { sectionFor } from '../src/content/sections';
import { CORPUS_DIR } from '../src/content/shipped';
import type { Removal } from '../src/content/sections/remove';
import type { ModuleSource, ParsedModule } from '../src/content/universe';

export interface Declaration {
  source: string;
  heading: string;
  start: number;
  end: number;
}

export interface Placed {
  heading: string;
  kind: string;
  id: string;
  source: string;
}

export interface Unplaced {
  heading: string;
  reason: string;
}

export interface Consolidation {
  sources: ModuleSource[];
  local: string;
  placed: Placed[];
  unplaced: Unplaced[];
  diagnostics: string[];
  differences: string[];
}

export const writable = (result: Consolidation): boolean =>
  result.diagnostics.length === 0 && result.differences.length === 0 && result.placed.length > 0;

const refusal = (base: readonly ModuleSource[], local: ModuleSource, diagnostics: string[]): Consolidation => ({
  sources: [...base],
  local: local.text,
  placed: [],
  unplaced: [],
  diagnostics,
  differences: [],
});

function headingLine(text: string, start: number): string {
  const stop = text.indexOf('\n', start);
  return (stop === -1 ? text.slice(start) : text.slice(start, stop)).replace(/\r$/, '');
}

const declarationKey = (kind: string, id: string): string => `${kind} ${id}`;

function declarations(sources: readonly ModuleSource[], namespaces: ReadonlyMap<string, string | null>): Map<string, Declaration[]> {
  const found = new Map<string, Declaration[]>();
  for (const source of sources) {
    for (const section of splitSections(source.text)) {
      if (section.kind === 'info' || section.id === undefined) continue;
      const declared = declaredKey(namespaces.get(source.name) ?? null, section.kind, section.id);
      if (declared === null) continue;
      const key = declarationKey(section.kind, declared);
      const at = found.get(key) ?? [];
      at.push({ source: source.name, heading: headingLine(source.text, section.span.start), start: section.span.start, end: section.span.end });
      found.set(key, at);
    }
  }
  return found;
}

interface Target {
  kind: string;
  id: string;
  remove: boolean;
}

const targetOf = (section: ParsedModule['sections'][number]): Target =>
  section.kind === 'remove'
    ? { kind: (section.value as Removal).kind, id: (section.value as Removal).target, remove: true }
    : { kind: section.kind, id: (section.value as { id: string }).id, remove: false };

function staged(local: ModuleSource, parsed: readonly ParsedModule[]): { section: LocalSection; target: Target }[] | null {
  const module = parsed.find((each) => each.source.name === local.name);
  if (!module) return null;
  const sections = listLocalSections(local.text);
  if (sections.length !== module.sections.length) return null;
  return sections.map((section, index) => {
    const settled = module.sections[index];
    if (settled.kind !== section.kind) throw new Error(`${LOCAL_CHANGES_MODULE_ID} section ${index} parsed as ${settled.kind}, not ${section.kind}`);
    return { section, target: targetOf(settled) };
  });
}

interface Edit {
  start: number;
  end: number;
  text: string | null;
}

function deletionEnd(text: string, end: number): number {
  let stop = end;
  while (stop < text.length && text[stop] !== '\n') stop += 1;
  for (;;) {
    if (stop >= text.length) return text.length;
    let scan = stop + 1;
    while (scan < text.length && text[scan] !== '\n') scan += 1;
    if (text.slice(stop + 1, scan).trim() !== '') return stop + 1;
    stop = scan;
  }
}

const matchingEndings = (file: string, text: string): string => (file.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);

function applyEdits(text: string, edits: readonly Edit[]): string {
  let out = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    const end = edit.text === null ? deletionEnd(out, edit.end) : edit.end;
    out = out.slice(0, edit.start) + (edit.text === null ? '' : matchingEndings(text, edit.text)) + out.slice(end);
  }
  return out;
}

const rehead = (heading: string, section: string): string => [heading, ...section.split('\n').slice(1)].join('\n');

// A staged section is a patch over the one that declares the id, however much of it it happens to
// write: the fields it names go home where that file writes them and every other line is left
// standing. Two staged sections cannot travel that way and go home whole instead, as every one of
// them did before — a kind that reads its own body, which has no fields to name, and a section
// holding an entry, which goes home by its label rather than by where it is written.
function foldedHome(base: readonly ModuleSource[], declaration: Declaration, section: LocalSection): { text: string } | { refused: string } {
  const written = rehead(declaration.heading, section.text);
  const schema = sectionFor(section.kind)?.schema;
  if (schema === undefined || writesEntries(written, schema)) return { text: written };
  const source = base.find((each) => each.name === declaration.source);
  if (source === undefined) return { refused: `${declaration.source} is not among the files being consolidated into` };
  return patchedInto(source.text.slice(declaration.start, declaration.end).replace(/\r\n?/g, '\n'), written, schema);
}

export function consolidate(base: readonly ModuleSource[], local: ModuleSource): Consolidation {
  const before = loadUniverseWithDiagnostics([...base, local]);
  if (before.diagnostics.length > 0) return refusal(base, local, before.diagnostics.map(formatModuleDiagnostic));

  const sections = staged(local, before.parsed);
  if (!sections) return refusal(base, local, [`${LOCAL_CHANGES_MODULE_ID} does not parse the same way twice; nothing was consolidated`]);

  const namespaces = new Map(before.parsed.map((module) => [module.source.name, module.namespace]));
  const declared = declarations(base, namespaces);
  const files = new Map(base.flatMap((source) => (namespaces.get(source.name) == null ? [] : [[namespaces.get(source.name)!, source] as const])));

  // Where a section nothing declares yet goes home: the module its id is under, asked of the
  // namespace that settled that id rather than read back out of the words in it.
  const newIn = (target: Target): ModuleSource | undefined => {
    if (target.remove) return undefined;
    const owner = before.registry.namespace.ownerOf(target.kind, target.id);
    return owner == null ? undefined : files.get(owner);
  };

  const resolved: { section: LocalSection; target: Target; declaration: Declaration | null; fresh: ModuleSource | null; refused: string }[] = sections.map(({ section, target }) => {
    const at = declared.get(declarationKey(target.kind, target.id)) ?? [];
    if (at.length > 1) return { section, target, declaration: null, fresh: null, refused: `${at.map((each) => each.source).sort().join(' and ')} both declare ${target.kind} ${target.id}` };
    if (at.length === 1) return { section, target, declaration: at[0], fresh: null, refused: '' };
    const home = newIn(target);
    if (home === undefined) return { section, target, declaration: null, fresh: null, refused: `no file under content/ declares ${target.kind} ${target.id}` };
    return { section, target, declaration: null, fresh: home, refused: '' };
  });

  const span = (declaration: Declaration): string => `${declaration.source}:${declaration.start}`;
  const claims = new Map<string, number>();
  for (const each of resolved) if (each.declaration) claims.set(span(each.declaration), (claims.get(span(each.declaration)) ?? 0) + 1);

  const placed: Placed[] = [];
  const unplaced: Unplaced[] = [];
  const edits = new Map<string, Edit[]>();
  const arriving = new Map<string, string[]>();

  for (const { section, target, declaration, fresh, refused } of resolved) {
    const heading = `# ${section.kind} ${section.id}`;
    if (fresh) {
      const local = moduleLocalId(namespaces.get(fresh.name)!, target.id);
      arriving.set(`${fresh.name}\0${target.kind}`, [...(arriving.get(`${fresh.name}\0${target.kind}`) ?? []), rehead(`# ${target.kind} ${local}`, section.text)]);
      placed.push({ heading, kind: target.kind, id: target.id, source: fresh.name });
      continue;
    }
    if (!declaration) {
      unplaced.push({ heading, reason: refused });
      continue;
    }
    if (claims.get(span(declaration))! > 1) {
      unplaced.push({ heading, reason: `two staged sections go home to ${declaration.source}'s ${declaration.heading}` });
      continue;
    }
    const folded = target.remove ? { text: null } : foldedHome(base, declaration, section);
    if ('refused' in folded) {
      unplaced.push({ heading, reason: folded.refused });
      continue;
    }
    const into = edits.get(declaration.source) ?? [];
    into.push({ start: declaration.start, end: declaration.end, text: folded.text });
    edits.set(declaration.source, into);
    placed.push({ heading, kind: target.kind, id: target.id, source: declaration.source });
  }

  for (const [at, bodies] of arriving) {
    const [name, kind] = at.split('\0');
    const text = base.find((source) => source.name === name)!.text;
    const to = landing(text, kind);
    edits.set(name, [...(edits.get(name) ?? []), { start: to, end: to, text: bodies.map((body) => `${gap(text)}${body}`).join('') }]);
  }

  const sources = base.map((source) => (edits.has(source.name) ? { ...source, text: applyEdits(source.text, edits.get(source.name)!) } : source));

  let text = local.text;
  for (const { section } of sections) {
    if (!placed.some((each) => each.heading === `# ${section.kind} ${section.id}`)) continue;
    text = deleteLocalSection(text, [], section.kind, section.id).text;
  }

  const remaining = listLocalSections(text).length > 0;
  const after = loadUniverseWithDiagnostics(remaining ? [...sources, { ...local, text }] : sources);
  if (after.diagnostics.length > 0) {
    return { sources: [...base], local: local.text, placed, unplaced, diagnostics: after.diagnostics.map(formatModuleDiagnostic), differences: [] };
  }

  const differences = registryDiff(before.registry, after.registry);
  if (differences.length > 0) return { sources: [...base], local: local.text, placed, unplaced, diagnostics: [], differences };
  return { sources, local: text, placed, unplaced, diagnostics: [], differences: [] };
}

const repoRoot = path.join(import.meta.dirname, '..');
const defaultLocal = `${CORPUS_DIR}/${LOCAL_CHANGES_MODULE_ID}.dsl`;
const contentDirectory = CORPUS_DIR;

export interface Args {
  contentFiles: string[] | null;
  localFile: string;
  dryRun: boolean;
}

function usage(): never {
  console.error(
    [
      'Usage: tsx scripts/consolidate.ts [local=<file>] [content=<a.dsl,b.dsl>] [--dry-run]',
      '',
      'Writes every staged section back into the file that declared its id and empties the local module.',
      'A section nothing declares yet goes into the file of the module its id names, among the',
      'sections already of its kind. Refuses as a whole if the result would load into a different universe.',
    ].join('\n'),
  );
  process.exit(1);
}

const splitFiles = (value: string): string[] => value.split(',').map((file) => file.trim()).filter(Boolean);

export function parseArgs(raw: readonly string[]): Args {
  const args: Args = { contentFiles: null, localFile: defaultLocal, dryRun: false };
  for (const arg of raw) {
    if (arg === '--help' || arg === '-h') usage();
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg.startsWith('local=')) {
      args.localFile = arg.slice('local='.length);
      continue;
    }
    if (arg.startsWith('content=')) {
      args.contentFiles = splitFiles(arg.slice('content='.length));
      continue;
    }
    usage();
  }
  return args;
}

const repoPath = (file: string): string => path.resolve(repoRoot, file);

const sourceName = (file: string): string => path.basename(file).replace(/\.[^.]*$/, '');

export function contentFiles(args: Args): string[] {
  if (args.contentFiles) return args.contentFiles;
  const local = repoPath(args.localFile);
  return readdirSync(repoPath(contentDirectory))
    .filter((name) => name.endsWith('.dsl'))
    .map((name) => `${contentDirectory}/${name}`)
    .filter((file) => repoPath(file) !== local);
}

const read = (file: string): ModuleSource => ({ name: sourceName(file), text: readFileSync(repoPath(file), 'utf8') });

function write(file: string, text: string): void {
  const target = repoPath(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, 'utf8');
}

export function run(argv: readonly string[]): void {
  const args = parseArgs(argv);
  if (!existsSync(repoPath(args.localFile))) {
    console.log(`Nothing staged: ${args.localFile} does not exist.`);
    return;
  }

  const files = contentFiles(args);
  const base = files.map(read);
  const local = read(args.localFile);
  if (listLocalSections(local.text).length === 0) {
    console.log(`Nothing staged in ${args.localFile}.`);
    return;
  }

  const result = consolidate(base, local);
  for (const each of result.unplaced) console.error(`Left staged: ${each.heading} — ${each.reason}`);

  if (result.diagnostics.length > 0) {
    console.error('Consolidation did not load, so nothing was written:');
    for (const line of result.diagnostics) console.error(`  ${line}`);
    process.exitCode = 1;
    return;
  }
  if (result.differences.length > 0) {
    console.error('Consolidation would not preserve the universe, so nothing was written:');
    for (const line of result.differences) console.error(line);
    process.exitCode = 1;
    return;
  }
  if (!writable(result)) {
    console.error('Nothing could be placed, so nothing was written.');
    process.exitCode = 1;
    return;
  }

  if (args.dryRun) {
    for (const each of result.placed) console.log(`Would write ${each.heading} into ${each.source}.dsl`);
    return;
  }

  for (const [index, source] of result.sources.entries()) {
    if (source.text !== base[index].text) write(files[index], source.text);
  }
  write(args.localFile, result.local);
  for (const each of result.placed) console.log(`Wrote ${each.heading} into ${each.source}.dsl`);
  console.log(`Consolidated ${result.placed.length} section(s); ${result.unplaced.length} left staged.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2));
}
