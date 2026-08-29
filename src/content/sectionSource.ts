import { Span } from '../grammar/parser';
import { splitSections } from '../grammar/structure';
import { declaredKey } from './resolve';
import type { ModuleSource } from './universe';

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

// The section a module is headed by, which is where its own name is written.
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

// Everything one module wrote, at the address the loader files it under. A module is which module
// its own heading names, and an id inside it is written module-local, so the loader's own answer for
// what that id is addressed as is asked for rather than spelt out again. Reading a section out,
// listing a kind, refusing an id and drawing the editing page all come off this one walk, so what
// can be handed back and what it can be called are the same set and cannot say different things.
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
