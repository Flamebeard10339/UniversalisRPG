import { DslError, Span } from './parser';

export const indentLines = (lines: readonly string[], spaces = 2): string[] => lines.map((line) => `${' '.repeat(spaces)}${line}`);

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

export const COMMENT_MARK = '//';

export const isCommentLine = (line: string): boolean => line.trim().startsWith(COMMENT_MARK);

export const hasBlock = (line: RawLine): boolean => line.children.length > 0;

const TAKEN = new WeakSet<RawLine>();

export function takeBlock(line: RawLine): RawLine[] {
  TAKEN.add(line);
  return line.children;
}

export function requireNoBlock(line: RawLine): void {
  if (!hasBlock(line)) return;
  throw new DslError(`${JSON.stringify(line.text)} takes no indented block`, line.span);
}

export function requireBlocksRead(lines: readonly RawLine[]): void {
  for (const line of lines) {
    if (!TAKEN.has(line)) requireNoBlock(line);
    requireBlocksRead(line.children);
  }
}

export function sectionParser<S extends RawSection, T>(parse: (section: S) => T): (section: S) => T {
  const answering = (section: S): T => {
    const value = parse(section);
    requireBlocksRead(section.body);
    return value;
  };
  ANSWERING.add(answering);
  return answering;
}

const ANSWERING = new WeakSet<(section: never) => unknown>();

export const answersForItsBlocks = (parse: (section: never) => unknown): boolean => ANSWERING.has(parse);

let sourceRead = 0;

export const dslRead = (): number => sourceRead;

export function splitSections(source: string): RawSection[] {
  sourceRead += source.length;
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
    if (textLine.trim() === '' || isCommentLine(textLine)) continue;
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

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length > 0 ? stack[stack.length - 1].line.children : current.body).push(line);
    stack.push({ indent, line });
    current.span.end = line.span.end;
  }
  return sections;
}
