import { formatDependency } from '../grammar/dependency';
import { DslError } from '../grammar/parser';
import { splitSections } from '../grammar/structure';
import { SECTION_KINDS } from './module';

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
    return { kind: section.kind, id: section.id, text: sectionText(text, section.span.start, section.span.end) };
  });
}

function bodySections(source: string): LocalSection[] {
  return readSections(source).filter((section) => section.kind !== MANAGED_INFO);
}

function dependencyLines(dependencies: readonly string[]): string[] {
  const unique = [...new Set(dependencies)].filter((id) => id !== LOCAL_CHANGES_MODULE_ID).sort();
  if (unique.length === 0) return [];
  return ['dependencies:', ...unique.map((module) => `  ${formatDependency({ prefix: 'required', module })}`)];
}

export function renderLocalChangesModule(dependencies: readonly string[], sections: readonly string[] = []): string {
  const header = [`# info ${LOCAL_CHANGES_MODULE_ID}`, 'version: 0.0.0', 'pack: local', ...dependencyLines(dependencies)];
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
  if (!SECTION_KINDS.includes(section.kind)) throw new DslError(`unknown section kind: ${section.kind}`);
  return section;
}

// An edit rewrites the whole file, so the header is carried across rather than
// rebuilt: a version, a pack and a dependency the caller's list does not have
// are lines somebody else wrote, and rendering a fresh header over them deletes
// them without saying so. `dependencies` is what a source with no `# info` of
// its own is given, which is a file nobody has written yet.
function withBody(source: string, dependencies: readonly string[], sections: readonly LocalSection[]): string {
  const info = readSections(source).find((section) => section.kind === MANAGED_INFO);
  const header = info ? info.text : renderLocalChangesModule(dependencies).trimEnd();
  const body = sections.map((section) => section.text.trim()).filter(Boolean);
  return [header, '', ...body].join('\n').trimEnd() + '\n';
}

export function upsertLocalSection(source: string, dependencies: readonly string[], sectionSource: string): LocalSectionEdit {
  const section = parseLocalSection(sectionSource);
  const sections = bodySections(source);
  const found = sections.findIndex((existing) => existing.kind === section.kind && existing.id === section.id);
  const next = found === -1 ? [...sections, section] : sections.map((existing, index) => (index === found ? section : existing));
  return { text: withBody(source, dependencies, next), section, replaced: found !== -1 };
}

export function deleteLocalSection(source: string, dependencies: readonly string[], kind: string, id: string): LocalSectionDelete {
  const sections = bodySections(source);
  const kept = sections.filter((section) => section.kind !== kind || section.id !== id);
  return { text: withBody(source, dependencies, kept), deleted: kept.length !== sections.length };
}

export function clearLocalSections(dependencies: readonly string[]): string {
  return renderLocalChangesModule(dependencies);
}
