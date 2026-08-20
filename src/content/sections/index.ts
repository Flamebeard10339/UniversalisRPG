import { HydrateContext } from "../../grammar/section";
import { DslError } from "../../grammar/parser";
import { RawSection, splitSections } from "../../grammar/structure";
import { Visit } from "../refs";
import { Maps, PrintContext, Section } from "./define";

import { action } from "./action";
import { clusterJewel } from "./clusterJewel";
import { dialogue } from "./dialogue";
import { droptable } from "./droptable";
import { entity } from "./entity";
import { event } from "./event";
import { faction } from "./faction";
import { flag } from "./flag";
import { info } from "./info";
import { item } from "./item";
import { locale } from "./locale";
import { location } from "./location";
import { passive } from "./passive";
import { recipe } from "./recipe";
import { remove } from "./remove";
import { resource } from "./resource";
import { save } from "./save";
import { skill } from "./skill";
import { slot } from "./slot";
import { stat } from "./stat";
import { test } from "./test";
import { variable } from "./variable";

// Every section kind there is, and the order a module prints them in. This list
// is the only place a kind is declared: the parser table, the registry's maps,
// the build, the printer, the reference walk and the locale's text fields are
// all read off it, so adding a kind is this line and the file it names.
export const SECTIONS = [
  stat,
  skill,
  item,
  passive,
  clusterJewel,
  faction,
  event,
  action,
  entity,
  location,
  recipe,
  resource,
  droptable,
  dialogue,
  flag,
  slot,
  variable,
  locale,
  save,
  test,
  info,
  remove,
] as const;

export type AnySection = (typeof SECTIONS)[number];
export type SectionKind = AnySection["kind"];

export const SECTION_KINDS: readonly SectionKind[] = SECTIONS.map(
  (each) => each.kind,
);

const BY_KIND = new Map<string, Section>(
  SECTIONS.map((each) => [each.kind, each as unknown as Section]),
);

export const sectionFor = (kind: string): Section | undefined =>
  BY_KIND.get(kind);

export const isSectionKind = (kind: string): kind is SectionKind =>
  BY_KIND.has(kind);

function required(kind: string): Section {
  const found = BY_KIND.get(kind);
  if (!found) throw new DslError(`unknown section kind: ${kind}`);
  return found;
}

// A parsed section, discriminated by its kind. What a parser returns is an
// object either way; what the union buys is that a switch on `kind` narrows.
export type ModuleSection = {
  [K in SectionKind]: { kind: K; value: object };
}[SectionKind];

export const sectionOf = (kind: SectionKind, value: object): ModuleSection =>
  ({ kind, value }) as ModuleSection;

// Every map the registry holds, derived from the kinds that fill them. A map
// cannot go missing and cannot hold the wrong type, because neither is written
// anywhere: both come from the kind's own declaration of where its values land.
type MapsOf<S> =
  S extends Section<infer _V, infer M>
    ? { [K in keyof M]: Map<string, M[K]> }
    : never;
type Intersect<U> = (U extends unknown ? (each: U) => void : never) extends (
  each: infer I,
) => void
  ? I
  : never;
export type SectionMaps = Intersect<MapsOf<AnySection>>;

export const MAP_NAMES: readonly string[] = [
  ...new Set(SECTIONS.flatMap((each) => Object.keys(each.maps))),
];

export const parseSectionOf = (raw: RawSection): ModuleSection =>
  sectionOf(raw.kind as SectionKind, required(raw.kind).parse(raw));

export const mergeSection = (
  kind: string,
  into: object | undefined,
  from: object,
): object => required(kind).merge(into, from);

export const buildSection = (
  each: ModuleSection,
  into: Maps,
  context: HydrateContext,
): void => {
  const owner = required(each.kind);
  const lands = Object.entries(owner.maps);
  if (lands.length === 0)
    throw new DslError(
      `a # ${each.kind} is not content and cannot be built into the registry`,
    );
  const value = owner.build(each.value, context);
  for (const [name, entries] of lands)
    for (const [key, held] of entries(value))
      into[name]!.set(key, held as never);
};

export const printSectionOf = (
  each: ModuleSection,
  context: PrintContext,
): string =>
  required(each.kind)
    .print(each.value as { id: string }, context)
    .join("\n");

export const visitSection = (
  each: ModuleSection,
  where: string,
  visit: Visit,
): void =>
  required(each.kind).visit(each.value as { id: string }, where, visit);

const kindsWhere = (
  holds: (each: Section) => boolean,
): readonly SectionKind[] =>
  SECTIONS.filter((each) => holds(each as unknown as Section)).map(
    (each) => each.kind,
  );

export const OWNED_SECTION_KINDS = kindsWhere((each) => each.ids === "owned");
export const GLOBAL_SECTION_KINDS = kindsWhere((each) => each.ids === "global");
export const ACTION_OWNER_KINDS = kindsWhere((each) => each.nestsActions);

export { isActionOwnerKind } from "./define";

export const registryMapOf = (kind: string): string | null =>
  sectionFor(kind)?.map ?? null;

// Each kind beside the map that holds what it builds, for a pass that walks
// every built object without knowing which kinds there are.
export const CONTENT_SECTION_MAPS: readonly (readonly [SectionKind, string])[] =
  SECTIONS.flatMap((each) =>
    each.map === null ? [] : [[each.kind, each.map] as const],
  );

// The prose fields each kind authors, in the order a locale lists them.
export const textFieldsOf = (kind: string): readonly string[] | undefined =>
  sectionFor(kind)?.text;

export type { Section, PrintContext, Maps };

export function parseModule(source: string): ModuleSection[] {
  return splitSections(source).map(parseSectionOf);
}
