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

// Everything a tool that rewrites `# save` bodies in place has to be able to do, and the same answer
// for every one of them: find the bodies, judge the bytes it means to write against the real
// registry, and refuse as a whole rather than in part. Two tools rewrite them — `migrate-saves`,
// which restamps a shape change, and `repair-saves`, which puts a renamed id back — and a second
// copy of any of this is a second thing to keep in step with the first.

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

// One `# save` as it stands in the file: the saved game itself, and the span of the single body line
// a rewrite replaces. A mark the section wears and the saves it is written over are none of it and
// stay where they are written.
export interface Written {
  fixture: Fixture;
  over?: string[];
  body: SaveBody;
  span: Span | null;
  // Why there is no span to rewrite, where a body is not one line.
  spread: number;
}

export interface Edit {
  span: Span;
  text: string;
}

// A body a tool means to write, judged as the bytes it will be rather than as the object they came
// from: what lands on disk is what the game will read back.
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
  // What kept the content from loading, already worded for a reader. A tool with any of these has no
  // registry to judge a rewrite against and has nothing to do but refuse.
  diagnostics: readonly string[];
  namespaceOf: (source: ModuleSource) => string | null;
}

// `beside` is a world the files stand in without being part of: the engine's own modules, so a
// prune says what it has to say in words rather than in locale keys. Nothing in it is ever rewritten.
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

// Every `# save` the files declare, in the order they are written, keyed by the id the registry knows
// it under. Reading the sections rather than the registry is what gives a rewrite the span to land
// on: the registry holds what a body says and not where it was written.
export function savesIn(files: readonly ContentFile[], loaded: LoadedContent): Written[] {
  const found: Written[] = [];
  for (const [index, file] of files.entries()) {
    const namespace = loaded.namespaceOf(loaded.sources[index]!);
    for (const section of splitSections(file.text)) {
      if (section.kind !== 'save') continue;
      const written = section.body.filter((line) => line.text !== DEBUG_MARK && !isOverLine(line.text));
      const saved = parseSaveSection({ ...section, body: section.body.filter((line) => line.text !== DEBUG_MARK) });
      const id = qualify(namespace, saved.id);
      // What a save is written over is taken from the registry rather than off the line, because an
      // author writes as little of an address as says which save and the loader wants the whole of it.
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

// Which fixtures a `# test` replays and which it records. A migration or a repair makes a recording
// loadable; only running the route again makes it true, so the two are never reported as one thing.
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

// What is wrong with the bytes a tool means to write: a body the field table will not take, or one
// that loads only because the loader pruned an id out of it. Nothing is written while this says
// anything, which is the whole of what makes either tool safe to run.
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

// The files a run of edits makes, and no others: a file nothing landed in is not rewritten, so its
// bytes are never so much as read back out.
export function edited(files: readonly ContentFile[], edits: ReadonlyMap<string, readonly Edit[]>): ContentFile[] {
  return files.filter((file) => (edits.get(file.path)?.length ?? 0) > 0).map((file) => ({ path: file.path, text: splice(file.text, edits.get(file.path)!) }));
}
