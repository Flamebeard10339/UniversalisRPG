import { DslError, Span } from './codec';

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

const HEADING = /^#[ \t]+(?<kind>[a-z][a-z0-9-]*)(?:[ \t]+(?<id>[a-z][a-z0-9-]*))?[ \t]*$/;

export function splitSections(source: string): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection | null = null;
  let stack: { indent: number; line: RawLine }[] = [];
  let offset = 0;

  for (const raw of source.split('\n')) {
    const lineStart = offset;
    offset += raw.length + 1;

    const heading = HEADING.exec(raw)?.groups;
    if (heading) {
      current = { kind: heading.kind, id: heading.id, body: [], span: { start: lineStart, end: lineStart + raw.length } };
      sections.push(current);
      stack = [];
      continue;
    }
    if (raw.trim() === '') continue;
    if (!current) throw new DslError(`content before first section: ${raw}`, { start: lineStart, end: lineStart + raw.length });

    const indent = raw.length - raw.trimStart().length;
    const text = raw.trim();
    const start = lineStart + indent;
    const line: RawLine = { text, span: { start, end: start + text.length }, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length > 0 ? stack[stack.length - 1].line.children : current.body).push(line);
    stack.push({ indent, line });
    current.span.end = line.span.end;
  }
  return sections;
}
