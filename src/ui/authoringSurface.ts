import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { GLOBAL_SECTION_KINDS, NAMESPACED_KINDS, qualify } from '../content/namespace';
import type { ModuleSource } from '../content/universe';
import { DslError } from '../grammar/parser';
import { splitSections } from '../grammar/structure';

// One list, three predicates. Every section the loaded modules hold is
// addressable by the line the REPL types at it, and Map, Local and Global are
// that list filtered three ways. There is no editor here and no second route to
// the registry: everything below produces a command line, and the only thing
// that can be done with a command line is hand it to `driver.send`.

export interface Section {
  kind: string;
  // How a `/dsl` line names it, which is how the load path resolves it: the
  // module's own namespace ahead of the authored id, for the kinds that take
  // one. Asked of the content layer's list rather than restated, so a kind that
  // stops being namespaced stops being qualified here on the same day.
  address: string;
  // The section as it is written, heading included: what an author opens.
  text: string;
  module: string;
  // Whether this is the copy staged locally, which is the one an edit replaces.
  staged: boolean;
}

export const SURFACES = ['map', 'local', 'global'] as const;

export type SurfaceId = (typeof SURFACES)[number];

// The kind the map draws, and so the one kind the map surface offers. Named
// once because the drag and the partition must agree about it.
export const MAPPED_KIND = 'location';

// A module's own header is not a section anybody addresses: `/dsl` refuses it,
// because which module a staged edit lands in is the session's to decide.
const HEADER_KIND = 'info';

const normalized = (text: string): string => text.replace(/\r\n?/g, '\n');

const addressOf = (module: string, kind: string, id: string): string =>
  module === LOCAL_CHANGES_MODULE_ID || GLOBAL_SECTION_KINDS.includes(kind) || !NAMESPACED_KINDS.includes(kind) ? id : qualify(module, id);

// Every section one module holds. A module that will not split into sections
// contributes none rather than stopping the survey: the load path has already
// said so in a diagnostic, and a surface that vanished because one module is
// broken would be a surface an author cannot use to fix it.
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
        // The heading restated with the address in it, and every other line as
        // the module wrote it. A section is opened here from outside the module
        // that declared it, and the address is what naming it from outside
        // means: this is exactly the heading a staged copy already carries, so
        // an edit to a shipped section and an edit to a staged one are one text
        // and one line rather than two that have to agree.
        text: [`# ${section.kind} ${address}`, ...written.slice(1)].join('\n'),
        module,
        staged: module === LOCAL_CHANGES_MODULE_ID,
      },
    ];
  });
}

const keyOf = (section: Pick<Section, 'kind' | 'address'>): string => `${section.kind} ${section.address}`;

// The whole list, one entry per thing an author can address. A section staged
// locally shadows the shipped one it replaces rather than standing beside it:
// two rows for one address would be two rows an edit could be typed into, and
// only one of them is what the session is playing.
export function addressable(sources: readonly ModuleSource[]): Section[] {
  const held = new Map<string, Section>();
  for (const source of sources) for (const section of sectionsIn(source)) held.set(keyOf(section), section);
  return [...held.values()];
}

// Where the player is, as the view publishes it. The ids are the engine's own,
// which is what makes "what this location owns" a fact read off the session
// rather than one this layer works out from the content.
export interface Standing {
  location: string;
  entities: readonly string[];
}

export const NOWHERE: Standing = { location: '', entities: [] };

// The same suffix rule a reference resolves by: a module writes `miki` and the
// engine publishes `tutorial-island.miki`, and neither spelling is wrong.
const names = (published: string, address: string): boolean => published === address || published.endsWith(`.${address}`) || address.endsWith(`.${published}`);

// Which of the three offers a section, as a total function. Map takes the kind
// it draws; Local takes what is standing where the player is; Global takes the
// rest, which is what makes the three a partition rather than three lists — a
// kind added to SCHEMAS tomorrow is offered by Global without an edit here.
export function surfaceOf(section: Section, standing: Standing): SurfaceId {
  if (section.kind === MAPPED_KIND) return 'map';
  return standing.entities.some((entity) => names(entity, section.address)) ? 'local' : 'global';
}

export function offeredBy(sections: readonly Section[], standing: Standing, surface: SurfaceId): Section[] {
  return sections.filter((section) => surfaceOf(section, standing) === surface);
}

// Every kind on offer under one surface, so a filter over Global is built from
// what is there rather than from a list of kinds somebody wrote down.
export function kindsOffered(sections: readonly Section[]): string[] {
  return [...new Set(sections.map((section) => section.kind))].sort();
}

// --- the line every control sends -----------------------------------------

export type Staged = { line: string } | { refused: string };

// A newline cannot cross a command line, so `/dsl` takes one and the body
// carries the rest behind a pipe. One leading space on every line but the
// first, because the command's own reader strips exactly one and the first
// one's is eaten by the separator that follows the id: what an author indented
// stays indented, and the one thing that cannot survive is indentation on the
// line straight after the heading, which the grammar has nothing to hang on.
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

export const deleteLine = (section: Pick<Section, 'kind' | 'address'>): string => `/local delete ${section.kind} ${section.address}`;

// What the one control out of the browser does. Named here beside the other
// two so that every line a surface can send is spelled in one file.
export const SHOW_LINE = '/local show';
