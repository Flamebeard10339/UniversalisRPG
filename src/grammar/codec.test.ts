import { describe, expect, it } from "vitest";
import {
  collectionFailures,
  exportedCodecs,
  isCodec,
  reachableCodecs,
  roundTripFailures,
} from "./codec";
import { Cursor, Parser } from "./parser";

// The grammar layer's own modules, read from the directory rather than listed.
// A parser added to this layer next month is a subject with no edit here, which
// is the difference between grading the sentence and grading a list.
const MODULES = import.meta.glob(["./*.ts", "!./*.test.ts"], {
  eager: true,
}) as Record<string, object>;

describe("the collected grammar", () => {
  const codecs = exportedCodecs(MODULES);

  // The walk finding nothing would satisfy every assertion below, so the size
  // is asserted before the law is. The floor is the parser count at the codec
  // conversion; it moves up as parsers are added and never down silently.
  it("reaches every codec this layer exports, and is not empty", () => {
    expect(Object.keys(MODULES).length).toBeGreaterThan(10);
    expect(codecs.size).toBeGreaterThanOrEqual(17);
  });

  it("finds every one of them carrying examples that survive parse-then-print unchanged", () => {
    expect(collectionFailures(codecs)).toEqual([]);
  });
});

describe("the law itself", () => {
  const brittle: Parser<number> = {
    parse: (cursor) => Number(cursor.take(/[0-9]+/) ?? "0"),
    // Loses the leading zero the author wrote, which is the whole class of
    // defect `examples` exists to catch and the reason it is not optional.
    print: (value) => String(value),
    examples: ["007"],
  };

  it("reports a parser whose print does not return what was parsed", () => {
    expect(roundTripFailures("brittle", brittle)).toEqual([
      'brittle: "007" printed back as "7"',
    ]);
  });

  it("reports a parser carrying no examples rather than passing it", () => {
    expect(roundTripFailures("empty", { ...brittle, examples: [] })).toEqual([
      "empty carries no examples",
    ]);
  });

  it("reports a parser that refuses its own example", () => {
    const refusing: Parser<number> = { ...brittle, examples: ["nope"] };
    expect(roundTripFailures("refusing", refusing)[0]).toContain(
      "unexpected content",
    );
  });

  it("is not satisfied by a value that only parses", () => {
    expect(isCodec({ parse: (cursor: Cursor) => cursor.rest() })).toBe(false);
    expect(isCodec({ parse: () => 1, print: () => "", examples: [] })).toBe(
      true,
    );
  });

  it("follows a list parser to its element, so a wrapper cannot hide one", () => {
    const element: Parser<number> = { ...brittle, examples: ["1"] };
    const wrapper = { parse: () => [], print: () => "", examples: [], element };
    expect([...reachableCodecs([["wrapper", wrapper]]).values()]).toEqual([
      "wrapper",
      "wrapper.element",
    ]);
  });
});
