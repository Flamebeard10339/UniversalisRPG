import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { qualify } from '../content/namespace';
import { isNamespacedKind } from '../content/sections';
import type { ModuleSource } from '../content/universe';
import { DslError } from '../grammar/parser';
import { splitSections } from '../grammar/structure';

export interface Section {
  kind: string;
  address: string;
  text: string;
  module: string;
  staged: boolean;
}

export const SURFACES = ['map', 'local', 'global'] as const;

export type SurfaceId = (typeof SURFACES)[number];

export const MAPPED_KIND = 'location';

const HEADER_KIND = 'info';

const normalized = (text: string): string => text.replace(/\r\n?/g, '\n');

const addressOf = (module: string, kind: string, id: string): string =>
  module === LOCAL_CHANGES_MODULE_ID || !isNamespacedKind(kind) ? id : qualify(module, id);

export function sectionsIn(source: ModuleSource): Section[] {
  const text = normalized(source.text);
  let split;
  try {
    split = splitSections(text);
  } catch (error) {
    if (error instanceof DslError) return [];
    throw error;
  }
  const module = split.find((section) => section.kind === HEADER_KIND)?.id ?? source.name;
  return split.flatMap((section) => {
    if (section.kind === HEADER_KIND || !section.id) return [];
    const address = addressOf(module, section.kind, section.id);
    const written = text.slice(section.span.start, section.span.end).trimEnd().split('\n');
    return [
      {
        kind: section.kind,
        address,
        text: [`# ${section.kind} ${address}`, ...written.slice(1)].join('\n'),
        module,
        staged: module === LOCAL_CHANGES_MODULE_ID,
      },
    ];
  });
}

const keyOf = (section: Pick<Section, 'kind' | 'address'>): string => `${section.kind} ${section.address}`;

export function addressable(sources: readonly ModuleSource[]): Section[] {
  const held = new Map<string, Section>();
  for (const source of sources) for (const section of sectionsIn(source)) held.set(keyOf(section), section);
  return [...held.values()];
}

export interface Shadowed {
  kind: string;
  address: string;
  modules: string[];
}

export function shadowed(sources: readonly ModuleSource[]): Shadowed[] {
  const shipped = new Map<string, string[]>();
  const staged: Section[] = [];
  for (const source of sources) {
    for (const section of sectionsIn(source)) {
      if (section.staged) staged.push(section);
      else shipped.set(keyOf(section), [...(shipped.get(keyOf(section)) ?? []), section.module]);
    }
  }
  return staged.flatMap((section) => {
    const modules = shipped.get(keyOf(section));
    return modules ? [{ kind: section.kind, address: section.address, modules }] : [];
  });
}

export interface Standing {
  location: string;
  entities: readonly string[];
}

export const NOWHERE: Standing = { location: '', entities: [] };

const names = (published: string, address: string): boolean => published === address || published.endsWith(`.${address}`) || address.endsWith(`.${published}`);

const standingIn = (section: Section, standing: Standing): boolean =>
  section.kind === MAPPED_KIND ? names(standing.location, section.address) : standing.entities.some((entity) => names(entity, section.address));

export function surfaceOf(section: Section, standing: Standing): SurfaceId {
  if (standingIn(section, standing)) return 'local';
  return section.kind === MAPPED_KIND ? 'map' : 'global';
}

export function offeredBy(sections: readonly Section[], standing: Standing, surface: SurfaceId): Section[] {
  return sections.filter((section) => surfaceOf(section, standing) === surface);
}

export function kindsOffered(sections: readonly Section[]): string[] {
  return [...new Set(sections.map((section) => section.kind))].sort();
}

export type Staged = { line: string } | { refused: string };

export const BODY_SEPARATOR = '|';

const HEADING = /^#[ \t]/;

export function stage(text: string): Staged {
  const lines = normalized(text).split('\n');
  const at = lines.findIndex((line) => HEADING.test(line));
  if (at < 0) return { refused: 'an edit starts with the section it is: # <kind> <id>' };
  if (lines.some((line) => line.includes(BODY_SEPARATOR))) {
    return { refused: `${BODY_SEPARATOR} separates the lines of a staged section, so a section cannot hold one` };
  }

  let split;
  try {
    split = splitSections(lines.slice(at).join('\n'));
  } catch (error) {
    if (error instanceof DslError) return { refused: error.message };
    throw error;
  }
  if (split.length !== 1) return { refused: `one section at a time, not ${split.length}` };
  const [section] = split;
  if (!section.id) return { refused: `# ${section.kind} requires an id` };

  const body = lines.slice(at + 1).map((line, after) => (after === 0 ? line : ` ${line}`)).join(BODY_SEPARATOR);
  return { line: `/dsl ${section.kind} ${section.id} ${body}`.trimEnd() };
}

export const emptied = (text: string): boolean => text.trim() === '';

export const openingLine = (kind: string | null): string => (kind === null ? '# ' : `# ${kind} `);

export const deleteLine = (section: Pick<Section, 'kind' | 'address'>): string => `/local delete ${section.kind} ${section.address}`;

export const removeLine = (section: Pick<Section, 'kind' | 'address'>): string => `/dsl remove ${section.kind}.${section.address}`;

export const SHOW_LINE = '/local show';
