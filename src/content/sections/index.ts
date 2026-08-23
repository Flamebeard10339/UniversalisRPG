import { HydrateContext } from '../../grammar/section';
import { DslError, Span } from '../../grammar/parser';
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
import { modal } from './modal';
import { passive } from './passive';
import { quest } from './quest';
import { recipe } from './recipe';
import { remove } from './remove';
import { resource } from './resource';
import { save } from './save';
import { shop } from './shop';
import { skill } from './skill';
import { slot } from './slot';
import { stat } from './stat';
import { test } from './test';
import { variable } from './variable';

// A thunk, not a const: a kind's file may reach this module, and a list built while one member is still loading holds an undefined.
const declared = () => [stat, skill, item, shop, passive, clusterJewel, faction, event, action, entity, location, recipe, resource, droptable, dialogue, quest, flag, slot, variable, locale, modal, save, test, info, remove] as const;

export type AnySection = ReturnType<typeof declared>[number];

let all: readonly AnySection[] | undefined;

export const sections = (): readonly AnySection[] => (all ??= declared());
export type SectionKind = AnySection['kind'];

export const sectionKinds = (): readonly SectionKind[] => sections().map((each) => each.kind);

let byKind: Map<string, Section> | undefined;

const table = (): Map<string, Section> => (byKind ??= new Map(sections().map((each) => [each.kind, each as unknown as Section])));

export const sectionFor = (kind: string): Section | undefined => table().get(kind);

export const isSectionKind = (kind: string): kind is SectionKind => table().has(kind);

function required(kind: string, span?: Span): Section {
  const found = table().get(kind);
  if (!found) throw new DslError(`unknown section kind: ${kind}`, span);
  return found;
}

export type ModuleSection = {
  [K in SectionKind]: { kind: K; value: object };
}[SectionKind];

export const sectionOf = (kind: SectionKind, value: object): ModuleSection => ({ kind, value }) as ModuleSection;

type MapsOf<S> = S extends Section<infer _V, infer M> ? { [K in keyof M]: Map<string, M[K]> } : never;
type Intersect<U> = (U extends unknown ? (each: U) => void : never) extends (each: infer I) => void ? I : never;
export type SectionMaps = Intersect<MapsOf<AnySection>>;

export const mapNames = (): readonly string[] => [...new Set(sections().flatMap((each) => Object.keys(each.maps)))];

export const parseSectionOf = (raw: RawSection): ModuleSection => sectionOf(raw.kind as SectionKind, required(raw.kind, raw.span).parse(raw));

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

export const contentSectionMaps = (): readonly (readonly [SectionKind, string])[] => sections().flatMap((each) => (each.map === null ? [] : [[each.kind, each.map] as const]));

export const textFieldsOf = (kind: string): readonly string[] | undefined => sectionFor(kind)?.text;

export type { Named } from './define';
export type { Section, PrintContext, Maps };

export function parseModule(source: string): ModuleSection[] {
  return splitSections(source).map(parseSectionOf);
}

export const isNamespacedKind = (kind: string): boolean => ownedSectionKinds().includes(kind as SectionKind) || MEMBER_KINDS.includes(kind);

export const isProseField = (slug: string): boolean => sections().some((each) => each.text.includes(slug));

export function actionSlugProblem(slug: string, label: string, taken: ReadonlySet<string>): string | undefined {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return `action ${JSON.stringify(label)} has no address: it keys as ${JSON.stringify(slug)}, so give it a label with a letter or a digit in it`;
  if (isProseField(slug)) return `action ${JSON.stringify(label)} keys as ${slug}, which is already a field of the object that owns it`;
  if (taken.has(slug)) return `action ${JSON.stringify(label)} keys as ${slug}, which another action here already keys as`;
  return undefined;
}
