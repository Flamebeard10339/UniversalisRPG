import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectionFailures, reachableCodecs } from '../grammar/codec';
import { text } from '../grammar/values';
import { TITLE_FIELD } from './sections/info';
import { indentLines, splitSections } from '../grammar/structure';
import { formatModuleDiagnostic } from './registry';
import { loadUniverseWithDiagnostics } from './load';
import { sections, sectionFor } from './sections';
import { canSerialize, roundTripUniverse } from './serialize';

const CORPUS = readdirSync('content')
  .filter((name) => name.endsWith('.dsl'))
  .map((name) => ({ name, text: readFileSync(`content/${name}`, 'utf8') }));

const problems = (result: { diagnostics: { sourceName: string }[] }): string[] => result.diagnostics.map((each) => formatModuleDiagnostic(each as never));

describe('the shipped corpus', () => {
  it('loads with no diagnostics', () => {
    expect(problems(loadUniverseWithDiagnostics(CORPUS))).toEqual([]);
  });

  it('prints back to a universe that loads to the same registry', () => {
    const loaded = loadUniverseWithDiagnostics(CORPUS);
    expect(problems(loaded)).toEqual([]);
    const trip = roundTripUniverse(loaded.registry, loaded.parsed.filter(canSerialize), (sources) => loadUniverseWithDiagnostics(sources));
    expect(problems(trip)).toEqual([]);
    expect(trip.differences).toEqual([]);
  });

  it.each(CORPUS.map((source) => source.name))('%s refuses an indented block nobody reads', (name) => {
    const { text } = CORPUS.find((each) => each.name === name)!;
    for (const section of splitSections(text)) {
      const owner = sectionFor(section.kind);
      if (owner === undefined) continue;
      const written = text.slice(section.span.start, section.span.end).replace(/\s+$/, '');
      const intruded = [written, 'nonsense-nobody-declares:', ...indentLines(['nonsense-nobody-reads'])].join('\n');
      expect(() => owner.parse(splitSections(intruded)[0]!), `# ${section.kind} ${section.id ?? ''}`).toThrow();
    }
  });
});

describe('every section kind', () => {
  it.each(sections().map((each) => each.kind))('%s declares a coherent section', (kind) => {
    const owner = sectionFor(kind)!;
    expect(sections().filter((each) => each.kind === kind)).toHaveLength(1);
    expect(Object.keys(owner.maps).length > 0).toBe(owner.ids !== 'none');
    const fields = Object.entries(owner.schema?.fields ?? {});
    expect(
      fields
        .filter(([, spec]) => spec === TITLE_FIELD)
        .map(([field]) => field)
        .filter((field) => !owner.text.includes(field)),
    ).toEqual([]);
    for (const field of owner.text) {
      const spec = owner.schema?.fields[field];
      if (spec !== undefined) expect(spec.parser).toBe(text);
    }
    for (const positional of [owner.schema?.clauses, owner.schema?.bare]) {
      if (positional !== undefined) expect(Object.keys(owner.schema!.fields)).toContain(positional);
    }
  });

  it.each(sections().map((each) => each.kind))('%s offers example lines that parse where they are offered', (kind) => {
    const owner = sectionFor(kind)!;
    const parses = (lines: readonly string[]): void => {
      const written = [`# ${kind} probe`, ...lines].join('\n');
      expect(() => owner.parse(splitSections(written)[0]!), written).not.toThrow();
    };
    for (const line of owner.examples.lines) parses([line]);
    const block = owner.examples.block;
    if (block === undefined) return;
    expect(block.opens.length).toBeGreaterThan(0);
    for (const opens of block.opens) parses([opens]);
    for (const line of block.lines) parses([block.opens[0]!, ...indentLines([line])]);
  });

  it('is read by parsers that print back what they parsed', () => {
    const codecs = reachableCodecs(sections().flatMap((section) => Object.entries(section.schema?.fields ?? {}).map(([field, spec]) => [`${section.kind}.${field}`, spec.parser] as const)));
    expect(codecs.size).toBeGreaterThan(20);
    expect(collectionFailures(codecs)).toEqual([]);
  });
});
