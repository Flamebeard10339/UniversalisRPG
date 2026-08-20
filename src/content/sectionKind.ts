// One row per section kind, holding every question anybody asks about a kind.
// The point is the shape rather than the contents: a table total over
// `SectionKind` stops compiling until a kind added here has an answer to each
// of these, where a list beside it is one nobody has to join. The measured cost
// of the lists this replaces is on the record — `# passive` parsed for a day and
// a half while the printer silently discarded it, because adding a kind meant
// nine edits and none of them failed when it was skipped.
//
// This file imports nothing, and that is load-bearing rather than tidy.
// `namespace.ts` reads the row and `module.ts` is checked against it, and both
// sit inside the content layer's import graph; a row that reached up for
// `Registry` or for the parser table would close the cycle `acyclic.ts`
// forbids. So the row declares the set and the parser table answers for it —
// `PARSERS satisfies Record<SectionKind, …>` is what makes a kind named here
// and given no parser fail to compile, and a parser written for a kind that is
// not here fail too.
export interface SectionKindRow {
  // Who owns the ids a section of this kind declares. `owned` means the module
  // that wrote it does, and the id is qualified with its namespace; `global`
  // means nobody does, so `oven` and `min-damage` mean the same thing in every
  // module that says them; `none` means the section declares no object anyone
  // else can name.
  ids: 'owned' | 'global' | 'none';
  // The registry map a built section of this kind lands in, and the one the
  // serializer reads it back out of. `null` is a section that builds no object:
  // `# info` is the module's own header, `# remove` is an instruction that is
  // spent at merge, and `# locale` is words rather than content. Spelled as a
  // string here and read as a `keyof Registry` by `CONTENT_SECTION_MAPS`, which
  // is where a name no map answers to fails to compile.
  map: string | null;
  // Whether the generic key/value engine parses this kind against a schema. The
  // rest bring their own parser, and `module.ts` is total over both halves.
  schema: boolean;
  // Whether an action may be written nested inside a section of this kind. An
  // action is a kind of its own — `# action` stands alone — and it also hangs
  // under the three kinds a player is offered one from, which is what a `use:`
  // leads with.
  nestsActions: boolean;
}

// Row order is print order: the serializer walks this to decide what a module
// prints and in what order, so that a kind added here is printed by the walk
// rather than by a loop somebody remembered to add.
export const SECTION_KIND = {
  stat: { ids: 'owned', map: 'stats', schema: true, nestsActions: false },
  skill: { ids: 'owned', map: 'skills', schema: true, nestsActions: false },
  item: { ids: 'owned', map: 'items', schema: true, nestsActions: true },
  passive: { ids: 'owned', map: 'passives', schema: true, nestsActions: false },
  'cluster-jewel': { ids: 'owned', map: 'clusterJewels', schema: true, nestsActions: false },
  faction: { ids: 'owned', map: 'factions', schema: true, nestsActions: false },
  event: { ids: 'owned', map: 'events', schema: true, nestsActions: false },
  action: { ids: 'owned', map: 'actions', schema: false, nestsActions: false },
  entity: { ids: 'owned', map: 'entities', schema: true, nestsActions: true },
  location: { ids: 'owned', map: 'locations', schema: true, nestsActions: true },
  recipe: { ids: 'owned', map: 'recipes', schema: true, nestsActions: false },
  resource: { ids: 'owned', map: 'resources', schema: true, nestsActions: false },
  droptable: { ids: 'owned', map: 'dropTables', schema: false, nestsActions: false },
  dialogue: { ids: 'owned', map: 'dialogues', schema: false, nestsActions: false },
  flag: { ids: 'owned', map: 'flags', schema: true, nestsActions: false },
  slot: { ids: 'global', map: 'slots', schema: true, nestsActions: false },
  variable: { ids: 'global', map: 'variables', schema: true, nestsActions: false },
  locale: { ids: 'none', map: null, schema: false, nestsActions: false },
  save: { ids: 'owned', map: 'saves', schema: false, nestsActions: false },
  test: { ids: 'owned', map: 'tests', schema: false, nestsActions: false },
  info: { ids: 'none', map: null, schema: true, nestsActions: false },
  remove: { ids: 'none', map: null, schema: false, nestsActions: false },
} as const satisfies Record<string, SectionKindRow>;

export type SectionKind = keyof typeof SECTION_KIND;

// The kinds a field of the row picks out, as a type. A row answered `true`
// gives a member and a row answered `false` gives none, so a list of kinds and
// the union over it cannot disagree — there is only the row.
type Where<Field extends keyof SectionKindRow> = { [K in SectionKind]: (typeof SECTION_KIND)[K][Field] extends true ? K : never }[SectionKind];

export type SchemaKind = Where<'schema'>;

// The kinds that own an action table, which are the kinds a player is offered
// an action from.
export type ActionOwnerKind = Where<'nestsActions'>;

// The one list of section kinds there is, in the order the row declares them.
export const SECTION_KINDS: readonly SectionKind[] = Object.keys(SECTION_KIND) as SectionKind[];

const kindsWhere = <K extends SectionKind>(holds: (row: SectionKindRow) => boolean): readonly K[] => SECTION_KINDS.filter((kind) => holds(SECTION_KIND[kind])) as K[];

// The kinds whose ids belong to nobody, which is the same list read from the
// other end: a module declares one but owns none, so serialize's own-module
// filter cannot find it and the caller says which it declared.
export const GLOBAL_SECTION_KINDS: readonly SectionKind[] = kindsWhere((row) => row.ids === 'global');

// The kinds whose ids the declaring module owns. Not every namespaced kind is a
// section — a dialogue node and an action slug hang under objects — which is
// why `namespace.ts` and not this file answers the whole question.
export const OWNED_SECTION_KINDS: readonly SectionKind[] = kindsWhere((row) => row.ids === 'owned');

export const ACTION_OWNER_KINDS: readonly ActionOwnerKind[] = kindsWhere<ActionOwnerKind>((row) => row.nestsActions);

export const isActionOwnerKind = (kind: string): kind is ActionOwnerKind => (ACTION_OWNER_KINDS as readonly string[]).includes(kind);

export const isSectionKind = (kind: string): kind is SectionKind => (SECTION_KINDS as readonly string[]).includes(kind);
