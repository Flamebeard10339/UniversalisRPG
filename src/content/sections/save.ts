import { DslError } from "../../grammar/parser";
import { moduleLocalId } from "../../grammar/section";
import { RawSection, sectionParser } from "../../grammar/structure";
import { section } from "./define";

// A recorded state, which carries no id: `saves` keys on the one the section
// was headed with, and the printer reads that key back off its context.
export interface ParsedSave {
  version: number;
  diff: Record<string, unknown>;
}

export interface SaveSection extends ParsedSave {
  id: string;
}

// Exported because a recorded state is read back outside the load path too — a
// migration script and the runtime's own round trip both hand one line of JSON
// to the same reader an author's `# save` goes through.
export const parseSaveSection = sectionParser(
  (raw: RawSection): SaveSection => {
    if (!raw.id) throw new DslError("# save requires an id", raw.span);

    // The body is one line of JSON; the grammar has no multi-line support.
    const written = raw.body.map((line) => line.text).join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(written);
    } catch {
      throw new DslError(
        `# save ${raw.id}: invalid JSON: ${written}`,
        raw.span,
      );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new DslError(`# save ${raw.id}: must be a JSON object`, raw.span);

    const { version, ...diff } = parsed as { version?: unknown } & Record<
      string,
      unknown
    >;
    if (typeof version !== "number")
      throw new DslError(
        `# save ${raw.id}: requires a numeric version`,
        raw.span,
      );

    return { id: raw.id, version, diff };
  },
);

export const save = section<SaveSection>()({
  kind: "save",
  ids: "owned",
  maps: {
    saves: (value): readonly (readonly [string, ParsedSave])[] => [
      [value.id, { version: value.version, diff: value.diff }],
    ],
  },
  parse: parseSaveSection,
  print: (value, { moduleId, id }) => [
    `# save ${moduleLocalId(moduleId, id)}`,
    JSON.stringify({ version: value.version, ...value.diff }),
  ],
});
