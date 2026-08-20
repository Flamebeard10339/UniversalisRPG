import { HydrateContext } from '../../grammar/section';
import { DslError } from '../../grammar/parser';
import { RawSection, splitSections } from '../../grammar/structure';
import { Visit } from '../refs';
import { MEMBER_KINDS } from '../namespace';
import { Maps, PrintContext, Section } from './define';

import { action } from './action';
import { clusterJewel } from './clusterJewel';
import { dialogue } from './dialogue';
import { droptable } from './droptable';
import { entity } from './entity';
import { event } from './event';
import { faction } from './faction';
import { flag } from './flag';
import { info } from './info';
import { item } from './item';
import { locale } from './locale';
import { location } from './location';
import { passive } from './passive';
import { recipe } from './recipe';
import { remove } from './remove';
import { resource } from './resource';
import { save } from './save';
import { skill } from './skill';
import { slot } from './slot';
import { stat } from './stat';
import { test } from './test';
import { variable } from './variable';

// Every section kind there is, and the order a module prints them in. This list
// is the only place a kind is declared: the parser table, the registry's maps,
// the build, the printer, the reference walk and the locale's text fields are
// all read off it, so adding a kind is this line and the file it names.
// Read on demand and never at import: a kind's file may reach a module that
// reaches this one, and a list assembled while one of its members is still
// loading holds an undefined. Nothing here runs until something asks.
const declared = () => [stat, skill, item, passive, clusterJewel, faction, event, action, entity, location, recipe, resource, droptable, dialogue, flag, slot, variable, locale, save, test, info, remove] as const;

export type AnySection = ReturnType<typeof declared>[number];

let all: readonly AnySection[] | undefined;

export const sections = (): readonly AnySection[] => (all ??= declared());
export type SectionKind = AnySection['kind'];

export const sectionKinds = (): readonly SectionKind[] => sections().map((each) => each.kind);

let byKind: Map<string, Section> | undefined;

const table = (): Map<string, Section> => (byKind ??= new Map(sections().map((each) => [each.kind, each as unknown as Section])));

export const sectionFor = (kind: string): Section | undefined => table().get(kind);

export const isSectionKind = (kind: string): kind is SectionKind => table().has(kind);

function required(kind: string): Section {
  const found = table().get(kind);
  if (!found) throw new DslError(`unknown section kind: ${kind}`);
  return found;
}

// A parsed section, discriminated by its kind. What a parser returns is an
// object either way; what the union buys is that a switch on `kind` narrows.
export type ModuleSection = {
  [K in SectionKind]: { kind: K; value: object };
}[SectionKind];

export const sectionOf = (kind: SectionKind, value: object): ModuleSection => ({ kind, value }) as ModuleSection;

// Every map the registry holds, derived from the kinds that fill them. A map
// cannot go missing and cannot hold the wrong type, because neither is written
// anywhere: both come from the kind's own declaration of where its values land.
type MapsOf<S> = S extends Section<infer _V, infer M> ? { [K in keyof M]: Map<string, M[K]> } : never;
type Intersect<U> = (U extends unknown ? (each: U) => void : never) extends (each: infer I) => void ? I : never;
export type SectionMaps = Intersect<MapsOf<AnySection>>;

export const mapNames = (): readonly string[] => [...new Set(sections().flatMap((each) => Object.keys(each.maps)))];

export const parseSectionOf = (raw: RawSection): ModuleSection => sectionOf(raw.kind as SectionKind, required(raw.kind).parse(raw));

export const mergeSection = (kind: string, into: object | undefined, from: object): object => required(kind).merge(into, from);

export const buildSection = (each: ModuleSection, into: Maps, context: HydrateContext): void => {
  const owner = required(each.kind);
  const lands = Object.entries(owner.maps);
  if (lands.length === 0) throw new DslError(`a # ${each.kind} is not content and cannot be built into the registry`);
  const value = owner.build(each.value, context);
  for (const [name, entries] of lands) for (const [key, held] of entries(value)) into[name]!.set(key, held as never);
};

export const printSectionOf = (each: ModuleSection, context: PrintContext): string =>
  required(each.kind)
    .print(each.value as { id: string }, context)
    .join('\n');

export const visitSection = (each: ModuleSection, where: string, visit: Visit): void => required(each.kind).visit(each.value as { id: string }, where, visit);

const kindsWhere = (holds: (each: Section) => boolean): readonly SectionKind[] => sections().filter((each) => holds(each as unknown as Section)).map((each) => each.kind);

export const ownedSectionKinds = (): readonly SectionKind[] => kindsWhere((each) => each.ids === 'owned');
export const globalSectionKinds = (): readonly SectionKind[] => kindsWhere((each) => each.ids === 'global');
export const actionOwnerKinds = (): readonly SectionKind[] => kindsWhere((each) => each.nestsActions);

export { isActionOwnerKind } from './define';

export const registryMapOf = (kind: string): string | null => sectionFor(kind)?.map ?? null;

// Each kind beside the map that holds what it builds, for a pass that walks
// every built object without knowing which kinds there are.
export const contentSectionMaps = (): readonly (readonly [SectionKind, string])[] => sections().flatMap((each) => (each.map === null ? [] : [[each.kind, each.map] as const]));

// The prose fields each kind authors, in the order a locale lists them.
export const textFieldsOf = (kind: string): readonly string[] | undefined => sectionFor(kind)?.text;

export type { Section, PrintContext, Maps };

export function parseModule(source: string): ModuleSection[] {
  return splitSections(source).map(parseSectionOf);
}

// Which ids a module owns: the kinds whose sections declare one, plus the two
// that hang under an object rather than beside it. Asked here because both
// halves are read off the list, and the module that holds the member kinds is
// one a section file reaches.
export const isNamespacedKind = (kind: string): boolean => ownedSectionKinds().includes(kind as SectionKind) || MEMBER_KINDS.includes(kind);

// Whether a name is one of the fields a kind writes prose into, which is what
// tells a locale key's field segment from an id that happens to look like one.
export const isProseField = (slug: string): boolean => sections().some((each) => each.text.includes(slug));
