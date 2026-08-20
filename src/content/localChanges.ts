import { formatDependency, type Dependency } from '../grammar/dependency';
import { DslError } from '../grammar/parser';
import { splitSections } from '../grammar/structure';
import { isSectionKind } from './sections';
import { parseModuleSource } from './universe';

export const LOCAL_CHANGES_MODULE_ID = 'local-changes';

export interface LocalSection {
  kind: string;
  id: string;
  text: string;
}

export interface LocalSectionEdit {
  text: string;
  section: LocalSection;
  replaced: boolean;
}

export interface LocalSectionDelete {
  text: string;
  deleted: boolean;
}

const MANAGED_INFO = 'info';

function normalized(source: string): string {
  return source.replace(/\r\n?/g, '\n');
}

function sectionText(source: string, start: number, end: number): string {
  return source.slice(start, end).trimEnd();
}

function readSections(source: string): LocalSection[] {
  const text = normalized(source);
  return splitSections(text).map((section) => {
    if (!section.id) throw new DslError(`# ${section.kind} requires an id`, section.span);
    return {
      kind: section.kind,
      id: section.id,
      text: sectionText(text, section.span.start, section.span.end),
    };
  });
}

function bodySections(source: string): LocalSection[] {
  return readSections(source).filter((section) => section.kind !== MANAGED_INFO);
}

function required(modules: readonly string[]): Dependency[] {
  return [...new Set(modules)]
    .filter((id) => id !== LOCAL_CHANGES_MODULE_ID)
    .sort()
    .map((module) => ({ prefix: 'required' as const, module }));
}

function dependencyLines(dependencies: readonly Dependency[]): string[] {
  if (dependencies.length === 0) return [];
  return ['dependencies:', ...dependencies.map((each) => `  ${formatDependency(each)}`)];
}

export function renderLocalChangesModule(dependencies: readonly string[], sections: readonly string[] = []): string {
  const header = [`# info ${LOCAL_CHANGES_MODULE_ID}`, 'version: 0.0.0', 'pack: local', ...dependencyLines(required(dependencies))];
  const body = sections.map((section) => section.trim()).filter(Boolean);
  return [...header, '', ...body].join('\n').trimEnd() + '\n';
}

export function initialLocalChangesModule(dependencies: readonly string[]): string {
  return renderLocalChangesModule(dependencies);
}

export function listLocalSections(source: string): LocalSection[] {
  return bodySections(source);
}

export function localSectionHeadings(source: string): string[] {
  return bodySections(source).map((section) => `# ${section.kind} ${section.id}`);
}

function parseLocalSection(sectionSource: string): LocalSection {
  const text = normalized(sectionSource).trim();
  const sections = readSections(text);
  if (sections.length !== 1) throw new DslError(`expected exactly one DSL section, got ${sections.length}`);
  const section = sections[0];
  if (section.kind === MANAGED_INFO) throw new DslError(`# info is managed by the local-changes file`);
  if (!isSectionKind(section.kind)) throw new DslError(`unknown section kind: ${section.kind}`);
  return section;
}

// Where a `dependencies:` declaration sits in a header and how far it runs: the
// keyword line, plus the indented lines under it when it was written as a
// block. Everything else in the header is somebody's text and is not this
// module's to read, reorder or drop.
function withoutDependencies(lines: readonly string[]): {
  kept: string[];
  at: number;
} {
  const start = lines.findIndex((line) => /^dependencies[ \t]*:/.test(line));
  if (start === -1) return { kept: [...lines], at: lines.length };
  let end = start + 1;
  while (end < lines.length && /^[ \t]/.test(lines[end])) end += 1;
  return { kept: [...lines.slice(0, start), ...lines.slice(end)], at: start };
}

// The header of the file this edit is rewriting. Three owners, and which line
// belongs to which is the whole of it. The id is the runtime's: this file is
// the local-changes module by construction, and a header naming another one
// would have every staged section land under a name the report does not use.
// The dependencies are shared, so they are the union — a module the file
// declares keeps the file's own spelling, because `? extra` and `extra >= 1.2`
// are statements a caller holding only a list of loaded ids cannot make, and a
// module only the caller knows about is added plainly. Every other line is the
// file's alone and survives where it stands.
//
// Both halves were learned by getting them wrong: rebuilding the header dropped
// what the file declared, and carrying it across whole made a header the
// session could not stage against and a module id the session lied about.
function headerFor(source: string, modules: readonly string[]): string[] {
  const info = readSections(source).find((section) => section.kind === MANAGED_INFO);
  if (!info) return [`# info ${LOCAL_CHANGES_MODULE_ID}`, 'version: 0.0.0', 'pack: local', ...dependencyLines(required(modules))];

  const declared = parseModuleSource({
    name: LOCAL_CHANGES_MODULE_ID,
    text: `${info.text}\n`,
  }).info.dependencies;
  const named = new Set(declared.map((each) => each.module));
  const merged = [...declared, ...required(modules).filter((each) => !named.has(each.module))];

  const { kept, at } = withoutDependencies(info.text.split('\n'));
  return [`# info ${LOCAL_CHANGES_MODULE_ID}`, ...kept.slice(1, at), ...dependencyLines(merged), ...kept.slice(at)];
}

function withBody(source: string, modules: readonly string[], sections: readonly LocalSection[]): string {
  const body = sections.map((section) => section.text.trim()).filter(Boolean);
  return [...headerFor(source, modules), '', ...body].join('\n').trimEnd() + '\n';
}

export function upsertLocalSection(source: string, dependencies: readonly string[], sectionSource: string): LocalSectionEdit {
  const section = parseLocalSection(sectionSource);
  const sections = bodySections(source);
  const found = sections.findIndex((existing) => existing.kind === section.kind && existing.id === section.id);
  const next = found === -1 ? [...sections, section] : sections.map((existing, index) => (index === found ? section : existing));
  return {
    text: withBody(source, dependencies, next),
    section,
    replaced: found !== -1,
  };
}

export function deleteLocalSection(source: string, dependencies: readonly string[], kind: string, id: string): LocalSectionDelete {
  const sections = bodySections(source);
  const kept = sections.filter((section) => section.kind !== kind || section.id !== id);
  return {
    text: withBody(source, dependencies, kept),
    deleted: kept.length !== sections.length,
  };
}
