import { Span } from '../grammar/parser';
import { splitSections } from '../grammar/structure';

// A section as its author wrote it rather than as the printer would write it back: a canonical
// re-print drops the comments standing above a section, and an author handed one back to edit would
// lose them on every pass.
export interface WrittenSection {
  kind: string;
  id: string | undefined;
  text: string;
  span: Span;
}

export const oneNewline = (source: string): string => source.replace(/\r\n?/g, '\n');

export function writtenSections(source: string): WrittenSection[] {
  return splitSections(source).map((section) => ({
    kind: section.kind,
    id: section.id,
    text: source.slice(section.span.start, section.span.end).trimEnd(),
    span: section.span,
  }));
}
