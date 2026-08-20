import { DslError, Span } from "./parser";

// One level of the block structure this module reads, written. Here because
// indentation is what a block IS in this language, and every printer that
// nests one asks the same module that took it apart.
export const indentLines = (lines: readonly string[], spaces = 2): string[] =>
  lines.map((line) => `${" ".repeat(spaces)}${line}`);

export interface RawLine {
  text: string;
  span: Span;
  children: RawLine[];
}

export interface RawSection {
  kind: string;
  id?: string;
  body: RawLine[];
  span: Span;
}

const HEADING =
  /^#[ \t]+(?<kind>[a-z][a-z0-9-]*)(?:[ \t]+(?<id>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*))?[ \t]*$/;

// Whether a line has an indented block. The question, asked without answering
// it: a reader deciding what to do is not a reader that consumed one.
export const hasBlock = (line: RawLine): boolean => line.children.length > 0;

// Lines whose block a reader took. Weak because it is a fact about a parse in
// flight and nothing outside one may ask it.
const TAKEN = new WeakSet<RawLine>();

// The block itself, taken rather than looked at. Calling this is what records
// that a reader consumed it, which is the only thing that tells that apart from
// a reader that walked past — five readers in this tree walked past, and no
// rule they each had to remember would have caught the sixth. Reading
// `children` directly stays the inspection, so a consumer that forgets this
// call has its line refused rather than its author's words dropped.
export function takeBlock(line: RawLine): RawLine[] {
  TAKEN.add(line);
  return line.children;
}

// The block half of the demand `requireEnd` makes of a line's text. A reader
// that has no use for a line's indented block and says nothing about it has
// dropped what an author wrote, which is the outcome a parse is not allowed to
// have.
export function requireNoBlock(line: RawLine): void {
  if (!hasBlock(line)) return;
  throw new DslError(
    `${JSON.stringify(line.text)} takes no indented block`,
    line.span,
  );
}

// The same demand made of a whole section once its parser has run, over every
// line whose block nobody took.
export function requireBlocksRead(lines: readonly RawLine[]): void {
  for (const line of lines) {
    if (!TAKEN.has(line)) requireNoBlock(line);
    requireBlocksRead(line.children);
  }
}

// A section parser: a function from a `RawSection` to a value that answers for
// every line it was handed. It returns its value, and then this asks whether
// any line kept a block nobody took. Applied where each parser is defined
// rather than where they are tabulated, so there is no unwrapped one for a
// caller to reach past the table for — a migration script reading `# save`
// fixtures did exactly that.
export function sectionParser<S extends RawSection, T>(
  parse: (section: S) => T,
): (section: S) => T {
  const answering = (section: S): T => {
    const value = parse(section);
    requireBlocksRead(section.body);
    return value;
  };
  ANSWERING.add(answering);
  return answering;
}

const ANSWERING = new WeakSet<(section: never) => unknown>();

// Whether a function is a section parser in the sense above. Asked of every
// kind the loader can parse, so that "each parser carries the demand" is
// derived from the table rather than from eight people remembering to wrap
// theirs — which is the failure this repository names first.
export const answersForItsBlocks = (
  parse: (section: never) => unknown,
): boolean => ANSWERING.has(parse);

export function splitSections(source: string): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection | null = null;
  let stack: { indent: number; line: RawLine }[] = [];
  let offset = 0;

  for (const raw of source.split("\n")) {
    const lineStart = offset;
    offset += raw.length + 1;
    const withoutCarriageReturn = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const bom =
      lineStart === 0 && withoutCarriageReturn.startsWith("\uFEFF") ? 1 : 0;
    const textLine =
      bom === 0 ? withoutCarriageReturn : withoutCarriageReturn.slice(bom);
    const textLineStart = lineStart + bom;

    const heading = HEADING.exec(textLine)?.groups;
    if (heading) {
      current = {
        kind: heading.kind,
        id: heading.id,
        body: [],
        span: { start: textLineStart, end: textLineStart + textLine.length },
      };
      sections.push(current);
      stack = [];
      continue;
    }
    if (textLine.trim() === "" || textLine.trim().startsWith("//")) continue;
    if (!current)
      throw new DslError(`content before first section: ${textLine}`, {
        start: textLineStart,
        end: textLineStart + textLine.length,
      });

    const indent = textLine.length - textLine.trimStart().length;
    const text = textLine.trim();
    const start = textLineStart + indent;
    const line: RawLine = {
      text,
      span: { start, end: start + text.length },
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent)
      stack.pop();
    (stack.length > 0
      ? stack[stack.length - 1].line.children
      : current.body
    ).push(line);
    stack.push({ indent, line });
    current.span.end = line.span.end;
  }
  return sections;
}
