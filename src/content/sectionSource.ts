import { Span } from '../grammar/parser';
import { splitSections } from '../grammar/structure';
import { declaredKey } from './resolve';
import type { ModuleSource } from './universe';

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

export const HEADING_KIND = 'info';

export interface AddressedSection {
  kind: string;
  id: string;
  address: string;
  text: string;
}

export interface WrittenModule {
  module: string;
  sections: AddressedSection[];
}

export function addressedSections(source: ModuleSource): WrittenModule {
  const written = writtenSections(oneNewline(source.text));
  const module = written.find((section) => section.kind === HEADING_KIND)?.id ?? source.name;
  return {
    module,
    sections: written.flatMap((section) =>
      section.id ? [{ kind: section.kind, id: section.id, address: declaredKey(module, section.kind, section.id) ?? section.id, text: section.text }] : [],
    ),
  };
}
