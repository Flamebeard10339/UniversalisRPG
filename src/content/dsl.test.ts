import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectionFailures, formFailures, reachableCodecs, shapeFailures } from '../grammar/codec';
import { amissIn, refusalOf } from './completion';
import { align } from '../grammar/form';
import type { Written } from '../grammar/parser';
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

  it('is refused by neither question the editing page asks of a section, which never disagree', () => {
    for (const source of CORPUS) {
      for (const section of splitSections(source.text)) {
        if (sectionFor(section.kind) === undefined) continue;
        const written = source.text.slice(section.span.start, section.span.end).replace(/\s+$/, '');
        const where = `${source.name} # ${section.kind} ${section.id ?? ''}`;
        const said = refusalOf(written);
        expect(said, where).toBeNull();
        expect(amissIn(written, []).some((each) => each.refused !== null), where).toBe(said !== null);
      }
    }
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

  it.each(sections().map((each) => each.kind))('%s writes out example lines that parse where they sit in its grammar', (kind) => {
    const owner = sectionFor(kind)!;
    const seen = new Set<string>();
    let checked = 0;
    const walk = (lines: readonly Written[], under: readonly string[]): void => {
      const key = lines.map((each) => each.form).join('\n');
      if (lines.length === 0 || seen.has(key)) return;
      seen.add(key);
      expect(formFailures(`# ${kind} under ${under.join(' / ') || 'itself'}`, lines.map((each) => each.form), lines.map((each) => each.example))).toEqual([]);
      for (const line of lines) {
        if (line.names !== undefined) expect(sections().map((each) => each.kind), `# ${kind} ${line.form} names`).toContain(line.names);
        const held = line.block?.();
        const opened = held === undefined ? [] : indentLines([held[0]!.example], 2 * (under.length + 1));
        const written = [`# ${kind} probe`, ...under.map((each, deep) => indentLines([each], 2 * deep)[0]!), ...indentLines([line.example], 2 * under.length), ...opened].join('\n');
        expect(() => owner.parse(splitSections(written)[0]!), written).not.toThrow();
        // The shape shown and the line shown are the same claim written twice, and a reader who cannot read one off the other has been told nothing.
        expect(align(line.form, line.example)?.complete, `# ${kind}: ${JSON.stringify(line.form)} does not read ${JSON.stringify(line.example)}`).toBe(true);
        checked += 1;
        if (held !== undefined) walk(held, [...under, line.example]);
      }
    };
    walk(owner.grammar, []);
    expect(checked).toBeGreaterThanOrEqual(owner.grammar.length);
  });

  it('is read by parsers that print back what they parsed', () => {
    const codecs = reachableCodecs(sections().flatMap((section) => Object.entries(section.schema?.fields ?? {}).map(([field, spec]) => [`${section.kind}.${field}`, spec.parser] as const)));
    expect(codecs.size).toBeGreaterThan(20);
    expect(collectionFailures(codecs)).toEqual([]);
    expect(shapeFailures(codecs)).toEqual([]);
  });
});
