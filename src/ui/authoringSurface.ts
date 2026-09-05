import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { sameSection } from '../content/namespace';
import { patchedInto, refused, travelsWhole } from '../content/patch';
import { addressedSections, oneNewline, type WrittenModule } from '../content/sectionSource';
import { HEADING_KIND } from '../content/sections/info';
import { sectionFor } from '../content/sections';
import { parseUniverse, type ModuleSource } from '../content/universe';
import { refusalOf } from '../content/completion';
import { DslError } from '../grammar/parser';
import { splitSections } from '../grammar/structure';
import { LINE_BREAK } from '../runtime/command';
import { MAPPED_KIND } from '../runtime/mapEdit';

export interface Section {
  kind: string;
  address: string;
  text: string;
  module: string;
  staged: boolean;
}

export const SURFACES = ['map', 'local', 'global'] as const;

export type SurfaceId = (typeof SURFACES)[number];

export const EDITED_SURFACES: readonly SurfaceId[] = ['local', 'global'];

export { MAPPED_KIND };

export function sectionsIn(source: ModuleSource): Section[] {
  let written: WrittenModule;
  try {
    written = addressedSections(source);
  } catch (error) {
    if (error instanceof DslError) return [];
    throw error;
  }
  return written.sections.flatMap((section) =>
    section.kind === HEADING_KIND
      ? []
      : [
          {
            kind: section.kind,
            address: section.address,
            text: [`# ${section.kind} ${section.address}`, ...section.text.split('\n').slice(1)].join('\n'),
            module: written.module,
            staged: written.module === LOCAL_CHANGES_MODULE_ID,
          },
        ],
  );
}

const keyOf = (section: Pick<Section, 'kind' | 'address'>): string => `${section.kind} ${section.address}`;

function inLoadOrder(sources: readonly ModuleSource[]): readonly ModuleSource[] {
  try {
    const ordered = parseUniverse(sources).map((module) => module.source);
    return ordered.length === sources.length ? ordered : sources;
  } catch {
    return sources;
  }
}

function foldedOver(standing: Section, over: Section): Section {
  const schema = sectionFor(over.kind)?.schema;
  if (schema === undefined) return over;
  const patched = patchedInto(standing.text, over.text, schema);
  if (refused(patched) || travelsWhole(patched) || refusalOf(patched.text) !== null) return over;
  return { ...over, text: patched.text };
}

export function addressable(sources: readonly ModuleSource[]): Section[] {
  const held = new Map<string, Section>();
  for (const source of inLoadOrder(sources)) {
    for (const section of sectionsIn(source)) {
      const standing = held.get(keyOf(section));
      held.set(keyOf(section), standing === undefined ? section : foldedOver(standing, section));
    }
  }
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

const standingIn = (section: Section, standing: Standing): boolean =>
  section.kind === MAPPED_KIND ? sameSection(standing.location, section.address) : standing.entities.some((entity) => sameSection(entity, section.address));

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

export interface Search {
  holds(section: Section): boolean;
  broken: boolean;
}

const TERMS = /\S+/g;

const searched = (section: Section): string => `${section.module}\n${section.text}`;

export const STATES: Record<string, (sections: readonly Section[]) => (section: Section) => boolean> = {
  changed: () => (section) => section.staged,
  shadowed: (sections) => {
    const shipped = new Set(sections.filter((each) => !each.staged).map(keyOf));
    return (section) => section.staged && shipped.has(keyOf(section));
  },
  amiss: () => (section) => refusalOf(section.text) !== null,
};

const IS = /^is:(?<state>[a-z-]+)$/;

export const EITHER = '||';

function everyTerm(query: string, sections: readonly Section[]): Search {
  const patterns: RegExp[] = [];
  const held: ((section: Section) => boolean)[] = [];
  for (const term of query.match(TERMS) ?? []) {
    const state = IS.exec(term)?.groups?.state;
    if (state !== undefined) {
      const asked = STATES[state];
      if (asked === undefined) return { holds: () => false, broken: true };
      held.push(asked(sections));
      continue;
    }
    try {
      patterns.push(new RegExp(term, 'i'));
    } catch {
      return { holds: () => false, broken: true };
    }
  }
  return { holds: (section) => held.every((asked) => asked(section)) && patterns.every((pattern) => pattern.test(searched(section))), broken: false };
}

export function searching(query: string, sections: readonly Section[] = []): Search {
  const sides = query.split(EITHER).filter((side) => side.trim() !== '').map((side) => everyTerm(side, sections));
  if (sides.some((side) => side.broken)) return { holds: () => false, broken: true };
  if (sides.length === 0) return { holds: () => true, broken: false };
  return { holds: (section) => sides.some((side) => side.holds(section)), broken: false };
}

export const searchHint = (words: string): string => `${words} ${Object.keys(STATES).map((state) => `is:${state}`).join(` ${EITHER} `)}`;

export type Staged = { line: string } | { refused: string };

const HEADING = /^#[ \t]/;

export function stage(text: string): Staged {
  const lines = oneNewline(text).split('\n');
  const at = lines.findIndex((line) => HEADING.test(line));
  if (at < 0) return { refused: 'an edit starts with the section it is: # <kind> <id>' };
  if (lines.some((line) => line.includes(LINE_BREAK))) {
    return { refused: `${LINE_BREAK} separates the lines of a staged section, so a section cannot hold one` };
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

  const body = lines.slice(at + 1).map((line, after) => (after === 0 ? line : ` ${line}`)).join(LINE_BREAK);
  return { line: `/dsl ${section.kind} ${section.id} ${body}`.trimEnd() };
}

export const emptied = (text: string): boolean => text.trim() === '';

export const openingLine = (kind: string | null): string => (kind === null ? '# ' : `# ${kind} `);

export const deleteLine = (section: Pick<Section, 'kind' | 'address'>): string => `/local delete ${section.kind} ${section.address}`;

export const removeLine = (section: Pick<Section, 'kind' | 'address'>): string => `/dsl remove ${section.kind}.${section.address}`;

export const SHOW_LINE = '/local show';
