import { DslError, Span } from './parser';

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

const HEADING = /^#[ \t]+(?<kind>[a-z][a-z0-9-]*)(?:[ \t]+(?<id>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*))?[ \t]*$/;

// Whether the line has an indented block, and the block itself, kept apart on
// purpose: reading `children` is what records that somebody took the block, so
// a reader merely deciding what to do asks this instead. Everything downstream
// of `blocksWereRead` turns on that difference.
export const hasBlock = (line: RawLine): boolean => blockOf(line).length > 0;

const BLOCK = Symbol('block');
const READ = Symbol('read');

interface TrackedLine extends RawLine {
  [BLOCK]: RawLine[];
  [READ]: boolean;
}

const blockOf = (line: RawLine): RawLine[] => (line as TrackedLine)[BLOCK] ?? line.children;

// A line whose block is behind an accessor. Nothing else can tell a block a
// reader consumed from one it walked past, and the load path has forgotten to
// refuse the second in five separate readers — so the record is kept by the act
// of reading rather than by each reader remembering to say so.
function trackedLine(text: string, span: Span): RawLine {
  const block: RawLine[] = [];
  const line = { text, span } as TrackedLine;
  Object.defineProperty(line, BLOCK, { value: block });
  Object.defineProperty(line, READ, { value: false, writable: true });
  Object.defineProperty(line, 'children', {
    enumerable: true,
    get() {
      line[READ] = true;
      return block;
    },
  });
  return line;
}

// The block half of the demand `requireEnd` makes of a line's text. A reader
// that has no use for a line's indented block and says nothing about it has
// dropped what an author wrote, which is the outcome a parse is not allowed to
// have.
export function requireNoBlock(line: RawLine): void {
  if (!hasBlock(line)) return;
  throw new DslError(`${JSON.stringify(line.text)} takes no indented block`, line.span);
}

// The same demand made of a whole section once its parser has run, for every
// line whose reader never asked for the block under it. Walked through the
// tracked array rather than through `children`, because asking the question
// must not answer it.
export function requireBlocksRead(lines: readonly RawLine[]): void {
  for (const line of lines) {
    if (!(line as TrackedLine)[READ]) requireNoBlock(line);
    requireBlocksRead(blockOf(line));
  }
}

export function splitSections(source: string): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection | null = null;
  let stack: { indent: number; line: RawLine }[] = [];
  let offset = 0;

  for (const raw of source.split('\n')) {
    const lineStart = offset;
    offset += raw.length + 1;
    const withoutCarriageReturn = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const bom = lineStart === 0 && withoutCarriageReturn.startsWith('\uFEFF') ? 1 : 0;
    const textLine = bom === 0 ? withoutCarriageReturn : withoutCarriageReturn.slice(bom);
    const textLineStart = lineStart + bom;

    const heading = HEADING.exec(textLine)?.groups;
    if (heading) {
      current = { kind: heading.kind, id: heading.id, body: [], span: { start: textLineStart, end: textLineStart + textLine.length } };
      sections.push(current);
      stack = [];
      continue;
    }
    if (textLine.trim() === '' || textLine.trim().startsWith('//')) continue;
    if (!current) throw new DslError(`content before first section: ${textLine}`, { start: textLineStart, end: textLineStart + textLine.length });

    const indent = textLine.length - textLine.trimStart().length;
    const text = textLine.trim();
    const start = textLineStart + indent;
    const line = trackedLine(text, { start, end: start + text.length });

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length > 0 ? blockOf(stack[stack.length - 1].line) : current.body).push(line);
    stack.push({ indent, line });
    current.span.end = line.span.end;
  }
  return sections;
}
