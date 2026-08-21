import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectionFailures, formFailures, reachableCodecs, shapeFailures } from '../grammar/codec';
import { amissIn, kindNamed, offeringAt, refusalOf } from './completion';
import { CAPABILITY } from './refs';
import { declaredBy } from './references';
import { align, holeNames, holesIn, standingIn, valueIn } from '../grammar/form';
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

// A line may say one hole names whatever another one holds, written as that other hole.
const POINTS = /^<[a-z][a-z0-9 -]*>$/;

// Every line of every kind, under the lines and at the indentation an author writes it at. A block reached twice holds the same lines, so it is walked once.
const GRAMMAR: { kind: string; line: Written; under: string; indent: number }[] = [];

{
  const seen = new Set<string>();
  const walk = (kind: string, lines: readonly Written[], under: string, indent: number): void => {
    const sign = `${kind}::${lines.map((each) => each.form).join('|')}`;
    if (lines.length === 0 || seen.has(sign)) return;
    seen.add(sign);
    for (const line of lines) {
      GRAMMAR.push({ kind, line, under, indent });
      walk(kind, line.block?.() ?? [], [under, ...indentLines([line.example], indent)].join('\n'), indent + 2);
    }
  };
  for (const owner of sections()) walk(owner.kind, owner.grammar, `# ${owner.kind} probe`, 0);
}

// Every placeholder of every one of those lines, with the line written out around it.
const HOLES = GRAMMAR.flatMap((at) =>
  (holesIn(at.line.form, at.line.example) ?? []).map((hole) => ({
    ...at,
    hole,
    // A line that opens a block and is handed over without one is refused for holding nothing, so the block's own first line goes under it.
    opens: at.line.block?.()[0]?.example,
    where: `# ${at.kind}${at.under.includes('\n') ? ` under ${at.under.split('\n').pop()!.trim()}` : ''}: ${at.line.form} <${hole.name}>`,
  })),
);

// The line with one value stood in the hole, sitting where an author writes it, which is the only form the engine can be asked about.
const written = (at: (typeof HOLES)[number], value: string): string =>
  [at.under, ...indentLines([standingIn(at.line.example, at.hole, value)], at.indent), ...(at.opens === undefined ? [] : indentLines([at.opens], at.indent + 2))].join('\n');

// What one hole of a line puts in another, which is how a line that says one hole names whatever another one holds is read.
const beside = (at: (typeof HOLES)[number]) => (hole: string) => {
  const other = (holesIn(at.line.form, at.line.example) ?? []).find((each) => each.name === hole);
  return other === undefined ? undefined : valueIn(at.line.example, other);
};

const kindAt = (at: (typeof HOLES)[number]): string | undefined => kindNamed(at.line, at.hole.name, beside(at));

describe('a hole of every line of every kind', () => {
  it('is asked about at all, over every kind there is', () => {
    expect(new Set(GRAMMAR.map((at) => at.kind)).size).toBe(sections().filter((each) => each.grammar.length > 0).length);
    expect(HOLES.filter((at) => kindAt(at) !== undefined).length).toBeGreaterThan(100);
  });

  it('says what it names outright, rather than a kind nothing declares', () => {
    const held = new Set(sections().map((each) => each.kind));
    expect(
      GRAMMAR.flatMap(({ kind, line }) =>
        Object.entries(line.names ?? {}).flatMap(([hole, said]) => {
          if (said === null || (POINTS.test(said) && holeNames(line.form).includes(said.slice(1, -1)))) return [];
          return held.has(said) || said === CAPABILITY ? [] : [`# ${kind} ${line.form} says <${hole}> names a # ${said}`];
        }),
      ),
    ).toEqual([]);
  });

  // The kind file is the one authority on what a line names. This asks the engine the question the panel used to ask it — an id stood in the hole, the section handed over, and whichever reference kind comes back — and holds the line's own word to it.
  it('names what the engine reads where it stands', () => {
    const PROBE = 'zzprobezz';
    const engine = (at: (typeof HOLES)[number]): string[] => {
      const raw = splitSections(written(at, PROBE))[0];
      const owner = raw === undefined ? undefined : sectionFor(raw.kind);
      if (owner === undefined) return [];
      const found: string[] = [];
      try {
        const authored = owner.parse(raw!) as { id: string };
        owner.visit(authored, '', (kind, id) => {
          if (id === PROBE || id.endsWith(`.${PROBE}`)) found.push(kind);
          return id;
        });
      } catch {
        return [];
      }
      return found;
    };
    expect(
      HOLES.flatMap((at) => {
        // A kind the section list does not declare has no ids to offer and nothing the panel could say about it.
        const read = [...new Set(engine(at))].filter((kind) => sectionFor(kind) !== undefined);
        const said = kindAt(at);
        return read.length === 1 && read[0] !== said ? [`${at.where} names ${said === undefined ? 'nothing' : `a # ${said}`}, where the engine reads a # ${read[0]}`] : [];
      }),
    ).toEqual([]);
  });
});

describe('what the page offers where the cursor stands in a hole', () => {
  const NAMED = 'a-module.a-name';
  // One line written under one other line is the same question wherever it is reached from, and the results grammar is reached from every kind there is.
  const asking = new Map(HOLES.filter((at) => kindAt(at) !== undefined).map((at) => [`${at.under.split('\n').pop()!}|${at.line.form}|${at.hole.name}`, at]));
  const naming = [...asking.values()];

  it('offers each id that hole may name once, wherever the author has got to in typing it', () => {
    const complaints: string[] = [];
    let asked = 0;
    for (const at of naming) {
      const known = [{ kind: kindAt(at)!, address: NAMED }];
      for (const typed of [0, Math.floor(NAMED.length / 2), NAMED.length]) {
        const draft = written(at, NAMED.slice(0, typed)).slice(0, at.under.length + 1 + at.indent + at.hole.start + typed);
        const offering = offeringAt(draft, draft.length, known);
        const said = offering.offers.filter((each) => each.form.includes(NAMED));
        // Half a line may still be several shapes, and the page names the one it settled on; the claim is about the hole it says the cursor is in.
        const here = offering.filling?.form === at.line.form && offering.filling.hole === at.hole.name;
        if (here) asked += 1;
        if (here ? said.length !== 1 : said.length > 1) complaints.push(`${at.where} with ${JSON.stringify(NAMED.slice(0, typed))} typed offers ${said.length === 0 ? 'nothing' : said.map((each) => each.form).join(', ')}`);
      }
    }
    expect(complaints).toEqual([]);
    expect(asked).toBeGreaterThan(naming.length);
  });

  it('breaks a hole filled with an id into no grammar of its own, since the ids are the whole of it', () => {
    expect(
      naming
        .filter((at) => at.line.holds?.()[at.hole.name] === undefined)
        .flatMap((at) => {
          const draft = written(at, '').slice(0, at.under.length + 1 + at.indent + at.hole.start);
          return offeringAt(draft, draft.length, []).filling?.holds === undefined ? [] : [at.where];
        }),
    ).toEqual([]);
  });
});

describe('a line that only makes sense once another is written', () => {
  // The keyword an author types for a field, which is what the grammar writes and so what an offer begins with.
  const keywordOf = (schema: { fields: Record<string, { keyword?: string }> }, name: string): string => schema.fields[name]?.keyword ?? name;

  const begins = (form: string, keyword: string): boolean => form === keyword || form.startsWith(`${keyword}:`);

  const offeredOn = (draft: string): string[] => offeringAt(draft, draft.length, []).offers.map((each) => each.form);

  for (const owner of sections()) {
    const schema = owner.schema as { fields: Record<string, { keyword?: string }>; needs?: Record<string, string> } | undefined;
    if (schema?.needs === undefined) continue;
    for (const [name, needed] of Object.entries(schema.needs)) {
      const keyword = keywordOf(schema, name);
      const stands = keywordOf(schema, needed);
      const writes = owner.grammar.find((line) => begins(line.form, stands) && line.example.length > stands.length);

      it(`# ${owner.kind} offers ${keyword} only once ${stands} is written`, () => {
        expect(writes, `nothing in the grammar of # ${owner.kind} writes ${stands}`).toBeDefined();
        expect(offeredOn(`# ${owner.kind} probe\n`).filter((form) => begins(form, keyword))).toEqual([]);
        const written = `# ${owner.kind} probe\n${writes!.example}\n`;
        expect(offeredOn(written).filter((form) => begins(form, keyword)).length).toBeGreaterThan(0);
      });

      it(`# ${owner.kind} keeps ${keyword} back where a line it cannot read stands beside it`, () => {
        const draft = `# ${owner.kind} probe\nnothing-here-is-a-field: 3\n`;
        expect(offeredOn(draft).filter((form) => begins(form, keyword))).toEqual([]);
      });
    }
  }
});

describe('the shipped corpus', () => {
  it('loads with no diagnostics', () => {
    expect(problems(loadUniverseWithDiagnostics(CORPUS))).toEqual([]);
  });

  it('has nothing the editing page would call amiss, by either question it asks, and names no id the engine cannot place', () => {
    const loaded = loadUniverseWithDiagnostics(CORPUS);
    expect(problems(loaded)).toEqual([]);
    const known = declaredBy(loaded.registry);
    for (const source of CORPUS) {
      for (const section of splitSections(source.text)) {
        if (sectionFor(section.kind) === undefined) continue;
        const written = source.text.slice(section.span.start, section.span.end).replace(/\s+$/, '');
        const where = `${source.name} # ${section.kind} ${section.id ?? ''}`;
        const said = refusalOf(written);
        const amiss = amissIn(written, known);
        expect(said, where).toBeNull();
        expect(amiss.some((each) => each.refused !== null), where).toBe(said !== null);
        expect(amiss.flatMap((each) => each.undeclared.map((one) => `line ${each.line}: ${one.id} as a # ${one.kind}`)), where).toEqual([]);
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
