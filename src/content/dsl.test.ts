import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectionFailures, reachableCodecs } from "../grammar/codec";
import { indentLines, splitSections } from "../grammar/structure";
import { formatModuleDiagnostic } from "./registry";
import { loadUniverseWithDiagnostics } from "./load";
import { SECTIONS, sectionFor } from "./sections";
import { canSerialize, roundTripUniverse } from "./serialize";

const CORPUS = readdirSync("content")
  .filter((name) => name.endsWith(".dsl"))
  .map((name) => ({ name, text: readFileSync(`content/${name}`, "utf8") }));

const problems = (result: {
  diagnostics: { sourceName: string }[];
}): string[] =>
  result.diagnostics.map((each) => formatModuleDiagnostic(each as never));

// Every claim here picks its own subjects — from the shipped corpus, from the
// section list, or from what a field's own parser says it accepts. A kind or a
// field added next month is covered by the same test with no edit, which is why
// these five stand in for the per-kind suites they replaced.
describe("the shipped corpus", () => {
  it("loads with no diagnostics", () => {
    expect(problems(loadUniverseWithDiagnostics(CORPUS))).toEqual([]);
  });

  // The strongest statement the load path can make about itself: print every
  // module back out, load the printed text instead of the source, and diff the
  // two registries. A field the printer forgets, or prints in a form the parser
  // will not take, is a difference here.
  it("prints back to a universe that loads to the same registry", () => {
    const loaded = loadUniverseWithDiagnostics(CORPUS);
    expect(problems(loaded)).toEqual([]);
    const trip = roundTripUniverse(
      loaded.registry,
      loaded.parsed.filter(canSerialize),
      (sources) => loadUniverseWithDiagnostics(sources),
    );
    expect(problems(trip)).toEqual([]);
    expect(trip.differences).toEqual([]);
  });

  // A parser that walks past an indented block drops what an author wrote and
  // says nothing — the failure five readers in this tree walked into. Asked of
  // every section the corpus contains, so the subjects are the kinds in use.
  it.each(CORPUS.map((source) => source.name))(
    "%s refuses an indented block nobody reads",
    (name) => {
      const { text } = CORPUS.find((each) => each.name === name)!;
      for (const section of splitSections(text)) {
        const owner = sectionFor(section.kind);
        if (owner === undefined) continue;
        const written = text
          .slice(section.span.start, section.span.end)
          .replace(/\s+$/, "");
        const intruded = [
          written,
          "nonsense-nobody-declares:",
          ...indentLines(["nonsense-nobody-reads"]),
        ].join("\n");
        expect(
          () => owner.parse(splitSections(intruded)[0]!),
          `# ${section.kind} ${section.id ?? ""}`,
        ).toThrow();
      }
    },
  );
});

describe("every section kind", () => {
  it.each(SECTIONS.map((each) => each.kind))(
    "%s declares a coherent section",
    (kind) => {
      const owner = sectionFor(kind)!;
      expect(SECTIONS.filter((each) => each.kind === kind)).toHaveLength(1);
      // A kind that names no object of its own builds nothing and fills no map;
      // every other kind fills at least the map its sections are read back from.
      expect(Object.keys(owner.maps).length > 0).toBe(owner.ids !== "none");
      for (const field of owner.text)
        expect(Object.keys(owner.schema?.fields ?? {})).toContain(field);
      for (const positional of [owner.schema?.clauses, owner.schema?.bare]) {
        if (positional !== undefined)
          expect(Object.keys(owner.schema!.fields)).toContain(positional);
      }
    },
  );

  // Every value parser any kind reaches, holding its own examples to the law
  // that printing what it parsed gives the words back. A parser that grows a
  // form covers itself by writing one down.
  it("is read by parsers that print back what they parsed", () => {
    const codecs = reachableCodecs(
      SECTIONS.flatMap((section) =>
        Object.entries(section.schema?.fields ?? {}).map(
          ([field, spec]) => [`${section.kind}.${field}`, spec.parser] as const,
        ),
      ),
    );
    expect(codecs.size).toBeGreaterThan(20);
    expect(collectionFailures(codecs)).toEqual([]);
  });
});
