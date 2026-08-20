import { describe, expect, it } from "vitest";
import { list } from "./list";
import { DslError } from "./parser";
import { RawLine } from "./structure";
import { id } from "./values";

const ids = list(id);

const block = (...texts: string[]): RawLine[] => {
  let offset = 0;
  return texts.map((text) => {
    const span = { start: offset, end: offset + text.length };
    offset = span.end + 1;
    return { text, span, children: [] };
  });
};

describe("a list block line", () => {
  it("reads a line the element parser consumes whole", () => {
    expect(ids.parseBlock(block("beach", "cove, reef"))).toEqual([
      "beach",
      "cove",
      "reef",
    ]);
  });

  it("refuses what the element parser left behind, naming it", () => {
    expect(() => ids.parseBlock(block("beach whille unlocked"))).toThrow(
      /unexpected content after a list item: "whille unlocked"/,
    );
  });

  it("points the refusal at the leftover, in the whole source rather than the line", () => {
    const lines = block("cove", "beach oven");
    const error = (() => {
      try {
        ids.parseBlock(lines);
      } catch (thrown) {
        return thrown as DslError;
      }
    })();
    expect(error?.span).toEqual({
      start: lines[1].span.start + 6,
      end: lines[1].span.start + 10,
    });
  });

  it("refuses on the line that carries the leftover, not on the first one", () => {
    expect(() => ids.parseBlock(block("cove", "beach oven", "reef"))).toThrow(
      /"oven"/,
    );
  });
});
