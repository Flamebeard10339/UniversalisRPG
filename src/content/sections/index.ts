import { HydrateContext } from '../../grammar/section';
import { DslError, Span } from '../../grammar/parser';
import { RawSection, splitSections } from '../../grammar/structure';
import { prose, type Loose, type Visit } from '../refs';
import { MEMBER_KINDS } from '../namespace';
import { Ids, Maps, NAMES_THE_SECTION, PrintContext, Section } from './define';

import { action, type ActionTextOwner } from './action';
import { clusterJewel } from './clusterJewel';
import { damageType } from './damageType';
import { dialogue } from './dialogue';
import { droptable } from './droptable';
import { entity } from './entity';
import { event } from './event';
import { faction } from './faction';
import { flag } from './flag';
import { group } from './group';
import { guise } from './guise';
import { info } from './info';
import { item } from './item';
import { locale } from './locale';
import { location } from './location';
import { passive } from './passive';
import { quest } from './quest';
import { race } from './race';
import { recipe } from './recipe';
import { region } from './region';
import { remove } from './remove';
import { resource } from './resource';
import { save } from './save';
import { shop } from './shop';
import { skill } from './skill';
import { slot } from './slot';
import { stat } from './stat';
import { station } from './station';
import { test } from './test';
import { tier } from './tier';
import { variable } from './variable';

const declared = () =>
  [damageType, tier, stat, skill, race, passive, clusterJewel, item, shop, faction, group, event, action, entity, guise, location, region, station, recipe, resource, droptable, dialogue, quest, flag, slot, variable, locale, save, test, info, remove] as const;

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

export { NAMES_THE_SECTION };

export const proseFieldsOf = (kind: string): readonly string[] => (sectionFor(kind)?.text ?? []).filter((field) => field !== NAMES_THE_SECTION);

export const visitSection = (each: ModuleSection, where: string, visit: Visit): void => {
  const owner = required(each.kind);
  owner.visit(each.value as { id: string }, where, visit);
  for (const field of proseFieldsOf(each.kind)) prose(each.value as unknown as Loose, field, `${where} ${field}:`, visit);
};

const kindsWhere = (holds: (each: Section) => boolean): readonly SectionKind[] => sections().filter((each) => holds(each as unknown as Section)).map((each) => each.kind);

export const ownedSectionKinds = (): readonly SectionKind[] => kindsWhere((each) => each.ids === 'owned');
export const globalSectionKinds = (): readonly SectionKind[] => kindsWhere((each) => each.ids === 'global');
export const actionOwnerKinds = (): readonly SectionKind[] => kindsWhere((each) => each.nestsActions);

export { isActionOwnerKind, isDebug, listedToPlayer, DEBUG_MARK, EVERY_SECTION } from './define';

export const idScopeOf = (kind: string): Ids => sectionFor(kind)?.ids ?? (MEMBER_KINDS.includes(kind) ? 'owned' : 'none');

export const isOwnedKind = (kind: string): boolean => idScopeOf(kind) === 'owned';

export const isCheckedKind = (kind: string): boolean => sectionFor(kind)?.vocabulary === 'declared' || MEMBER_KINDS.includes(kind);

const OWNED_ADDRESS = 'writes over the section that module declared, which is how a kind whose ids its own module owns is reached from outside the file that declared it';

const GLOBAL_ADDRESS = 'is one name whichever module writes it, so a second body at it carries the short id it was declared with and no module in front';

export const addressedHeading = (): string =>
  `# <kind> <module>.<id>   — ${OWNED_ADDRESS}. A ${globalSectionKinds().map((kind) => `# ${kind}`).join(' or a ')} ${GLOBAL_ADDRESS}`;

export const addressedNote = (kind: string): string | undefined => {
  const scope = idScopeOf(kind);
  if (scope === 'owned') return `\`# ${kind} <module>.<id>\` ${OWNED_ADDRESS}`;
  return scope === 'global' ? `a # ${kind} ${GLOBAL_ADDRESS}` : undefined;
};

export const registryMapOf = (kind: string): string | null => sectionFor(kind)?.map ?? null;

export const contentSectionMaps = (): readonly (readonly [SectionKind, string])[] => sections().flatMap((each) => (each.map === null ? [] : [[each.kind, each.map] as const]));

export const textFieldsOf = (kind: string): readonly string[] | undefined => sectionFor(kind)?.text;

export type { Named, Ids, Vocabulary } from './define';
export type { Section, PrintContext, Maps };

export function parseModule(source: string): ModuleSection[] {
  return splitSections(source).map(parseSectionOf);
}

export function actionSlugProblem(owner: ActionTextOwner, label: string, taken: ReadonlyMap<string, string>, minted: ReadonlyMap<string, string>): string | undefined {
  const slug = owner.field;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return `action ${JSON.stringify(label)} has no address: it keys as ${JSON.stringify(slug)}, so give it a label with a letter or a digit in it`;
  if (textFieldsOf(owner.kind)?.includes(slug)) return `action ${JSON.stringify(label)} keys as ${slug}, which is already a field of the object that owns it`;
  const held = taken.get(slug);
  if (held === undefined) return undefined;
  const from = minted.get(slug);
  if (from !== undefined) return `${from} already offers an action addressed ${slug}, which ${JSON.stringify(held)} keys as too: address one of them elsewhere, or take the ${from} line out`;
  return `action ${JSON.stringify(label)} keys as ${slug}, which another action here already keys as`;
}
