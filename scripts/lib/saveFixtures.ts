import { globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { qualify } from '../../src/content/namespace';
import { formatModuleDiagnostic, type Registry } from '../../src/content/registry';
import { loadUniverseWithDiagnostics } from '../../src/content/load';
import { isOverLine, parseSaveSection } from '../../src/content/sections/save';
import { DEBUG_MARK } from '../../src/content/sections';
import type { ModuleSource } from '../../src/content/universe';
import { splitSections } from '../../src/grammar/structure';
import type { Span } from '../../src/grammar/parser';
import { createGameState } from '../../src/runtime/runtime';
import { loadSave } from '../../src/runtime/save';

export interface ContentFile {
  path: string;
  text: string;
}

export type SaveBody = Record<string, unknown>;

export interface Fixture {
  id: string;
  file: string;
  version: number;
}

export interface Written {
  fixture: Fixture;
  over?: string[];
  body: SaveBody;
  span: Span | null;
  spread: number;
}

export interface Edit {
  span: Span;
  text: string;
}

export interface Judged {
  id: string;
  over?: readonly string[];
  text: string;
}

export type Classification = 'recording' | 'input' | 'unreferenced';

export const moduleSourceOf = (file: ContentFile): ModuleSource => ({ name: path.basename(file.path).replace(/\.[^.]*$/, ''), text: file.text });

export function readContent(directory: string): ContentFile[] {
  return globSync('**/*.dsl', { cwd: directory })
    .map((relative) => path.join(directory, relative).replace(/\\/g, '/'))
    .sort()
    .map((file) => ({ path: file, text: readFileSync(file, 'utf8') }));
}

export function writeFiles(files: readonly ContentFile[]): void {
  for (const file of files) writeFileSync(file.path, file.text);
}

export interface LoadedContent {
  sources: readonly ModuleSource[];
  registry: Registry;
  diagnostics: readonly string[];
  namespaceOf: (source: ModuleSource) => string | null;
}

export function loadContent(files: readonly ContentFile[], beside: readonly ModuleSource[] = []): LoadedContent {
  const sources = files.map(moduleSourceOf);
  const loaded = loadUniverseWithDiagnostics([...sources, ...beside]);
  const namespaces = new Map(loaded.parsed.map((module) => [module.source, module.namespace]));
  return {
    sources,
    registry: loaded.registry,
    diagnostics: loaded.diagnostics.map(formatModuleDiagnostic),
    namespaceOf: (source) => namespaces.get(source) ?? null,
  };
}

export function savesIn(files: readonly ContentFile[], loaded: LoadedContent): Written[] {
  const found: Written[] = [];
  for (const [index, file] of files.entries()) {
    const namespace = loaded.namespaceOf(loaded.sources[index]!);
    for (const section of splitSections(file.text)) {
      if (section.kind !== 'save') continue;
      const written = section.body.filter((line) => line.text !== DEBUG_MARK && !isOverLine(line.text));
      const saved = parseSaveSection({ ...section, body: section.body.filter((line) => line.text !== DEBUG_MARK) });
      const id = qualify(namespace, saved.id);
      const over = loaded.registry.saves.get(id)?.over ?? saved.over;
      found.push({
        fixture: { id, file: file.path, version: saved.version },
        ...(over ? { over: [...over] } : {}),
        body: saved.diff,
        span: written.length === 1 ? written[0]!.span : null,
        spread: written.length,
      });
    }
  }
  return found;
}

export function classifier(registry: Registry, fixtures: readonly Fixture[]): (id: string) => Classification {
  const found = new Map<string, Classification>();
  for (const fixture of fixtures) found.set(fixture.id, 'unreferenced');
  for (const test of registry.tests.values()) {
    for (const directive of test.directives) {
      if (directive.kind === 'load' && found.get(directive.save) === 'unreferenced') found.set(directive.save, 'input');
      if (directive.kind === 'expect' || directive.kind === 'expect-only') found.set(directive.save, 'recording');
    }
  }
  return (id) => found.get(id) ?? 'unreferenced';
}

export function loadProblems(judged: readonly Judged[], registry: Registry): string[] {
  const problems: string[] = [];
  for (const each of judged) {
    try {
      const { version, ...diff } = JSON.parse(each.text) as { version: number } & SaveBody;
      for (const warning of loadSave(createGameState(), { version, over: each.over ? [...each.over] : undefined, diff }, registry)) {
        problems.push(`${each.id}: ${warning.path} — ${warning.message}`);
      }
    } catch (error) {
      problems.push(`${each.id}: ${(error as Error).message}`);
    }
  }
  return problems;
}

export function splice(text: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((a, b) => a.span.start - b.span.start);
  let out = '';
  let at = 0;
  for (const edit of ordered) {
    out += text.slice(at, edit.span.start) + edit.text;
    at = edit.span.end;
  }
  return out + text.slice(at);
}

export function edited(files: readonly ContentFile[], edits: ReadonlyMap<string, readonly Edit[]>): ContentFile[] {
  return files.filter((file) => (edits.get(file.path)?.length ?? 0) > 0).map((file) => ({ path: file.path, text: splice(file.text, edits.get(file.path)!) }));
}
