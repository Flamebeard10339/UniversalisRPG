import { actionLines } from '../../grammar/action';
import { DslError } from '../../grammar/parser';
import { RawSection, sectionParser } from '../../grammar/structure';
import { AnySchema, Authored, HydrateContext, PrintContext, SectionSchema, hydrateSection, parseAnySection, printSection } from '../../grammar/section';
import { Pruning, Visit } from '../refs';
import { mergeFields } from '../merge';

export type { PrintContext };

// Who owns the ids a section of this kind declares. `owned` qualifies the id
// with the declaring module's namespace, `global` means the name means the same
// thing in every module that says it, `none` means the section declares nothing
// anyone else can name.
export type Ids = 'owned' | 'global' | 'none';

// The registry as a writer sees it. Readers get `Registry`, whose every map is
// derived from the kinds that fill it.
export type Maps = Record<string, Map<string, never>>;

// Where a kind's values land: one entry per map it fills, from a value to the
// keys it takes in that map. A kind naming only `map:` fills that one under its
// own id, which is every kind but the three that fill two or key on something
// other than the id.
export type Lands<V, M extends Record<string, unknown>> = {
  [K in keyof M]: (value: V) => readonly (readonly [string, M[K]])[];
};

// Everything anyone asks about a section kind, in one shape. Every field is
// filled in — `section()` supplies the schema-driven answer for any the kind
// did not write — so no consumer branches on which kind it is holding.
export interface Section<V extends { id: string } = { id: string }, M extends Record<string, unknown> = Record<string, unknown>> {
  kind: string;
  ids: Ids;
  // The map a printed section is read back out of, and the one a reference to
  // this kind resolves against. A kind that fills none has none.
  map: string | null;
  maps: Lands<V, M>;
  nestsActions: boolean;
  // The fields whose values are prose, in the order a `# locale` lists them.
  text: readonly string[];
  schema?: AnySchema;
  parse(raw: RawSection): object;
  merge(into: object | undefined, from: object): object;
  build(authored: object, context: HydrateContext): V;
  print(value: V, context: PrintContext): readonly string[];
  visit(value: V, where: string, visit: Visit): void;
  // What is left of a value once a reference it makes has gone: `null` drops the
  // section, the same object means untouched, a new object replaces it.
  prune(value: V, at: Pruning, where: string): V | null;
}

interface Common<V extends { id: string }> {
  kind: string;
  ids: Ids;
  nestsActions?: true;
  text?: readonly string[];
  // What is wrong with an assembled value, in the words an author reads. A
  // kind's own invariants live beside its fields rather than in the loader.
  validate?: (value: V) => string | undefined;
  visit?: (value: V, where: string, visit: Visit) => void;
  // How much of this kind a dangling reference costs. Declared only by the kinds
  // that survive one; saying nothing means the section goes with it.
  prune?: (value: V, at: Pruning, where: string) => V | null;
  merge?: (into: object | undefined, from: object) => object;
  print?: (value: V, context: PrintContext) => readonly string[];
}

// A kind the key/value engine reads: it declares its fields and gets its
// parser, its printer and its merge from them.
type Schematic<V extends { id: string }, F extends keyof V, E extends keyof V> = Common<V> & Omit<SectionSchema<V, F, E>, 'kind'>;

// A kind whose grammar is too far from key/value to fit the engine. It brings
// the two halves the engine would have supplied, and nothing else differs.
interface Bespoke<V extends { id: string }> extends Common<V> {
  parse: (raw: RawSection) => V;
  print: (value: V, context: PrintContext) => readonly string[];
}

// Which kinds an action may be written under, asked by the walk that resolves
// `use: <kind>.<id>.<slug>`. Answered from `define.ts` rather than from the
// section list, because a kind asking the list it is a member of is a cycle —
// and the answer is the kind's own `nestsActions`, recorded as it declares it.
const ACTION_OWNERS = new Set<string>();

export const isActionOwnerKind = (kind: string): boolean => ACTION_OWNERS.has(kind);

const notContent = (kind: string): never => {
  throw new DslError(`a # ${kind} is not content and cannot be built into the registry`);
};

// Curried so that the value type is written and the map name is inferred: a
// single call cannot do both, and the map name has to stay the literal it was
// written as or the registry it keys cannot derive its own maps.
export const section =
  <V extends { id: string }, F extends keyof V = never, E extends keyof V = never>() =>
  <const Name extends string = never, Filled extends Record<string, unknown> = Record<Name, V>>(
    spec: (Schematic<V, F, E> | Bespoke<V>) & {
      map?: Name;
      maps?: Lands<V, Filled>;
    },
  ): Section<V, Filled> => {
    const { kind, ids, map, maps, nestsActions = false, text = [], validate, visit, merge, print, prune } = spec;
    const walk = visit ?? ((): void => {});
    const schema = 'fields' in spec ? ({ ...spec, kind } as unknown as AnySchema) : undefined;
    if (nestsActions) ACTION_OWNERS.add(kind);
  // A kind declares its fields or it brings a parser; neither is a kind that
  // cannot read itself. Refused here rather than at the first section, because
  // a half-initialised import is what makes this undefined and the file that
  // did it is the one worth naming.
  if (schema === undefined && typeof (spec as Bespoke<V>).parse !== 'function') throw new Error(`# ${kind} declares neither fields nor a parse`);
    const built = (value: V): V => {
      const problem = validate?.(value);
      if (problem) throw new DslError(`# ${kind} ${value.id}: ${problem}`);
      return value;
    };
    return {
      kind,
      ids,
      map: map ?? (maps === undefined ? null : Object.keys(maps)[0]!),
      maps: (maps ?? (map === undefined ? {} : { [map]: (value: V) => [[value.id, value] as const] })) as Lands<V, Filled>,
      nestsActions,
      text,
      schema,
      parse: sectionParser(schema ? (raw) => parseAnySection(raw, schema) : (spec as Bespoke<V>).parse),
      merge: merge ?? ((into, from) => (schema ? mergeFields((into as Record<string, unknown>) ?? { id: (from as V).id }, from as Record<string, unknown>, schema) : (into ?? from))),
      build: schema ? (authored, context) => built(hydrateSection(authored as Authored<V>, schema as unknown as SectionSchema<V, F, E>, context) as V) : (authored) => built(authored as V),
      print: print ?? (schema ? (value, context) => printSection(value, schema, context, actionLines) : () => notContent(kind)),
      visit: walk,
      prune: prune ?? ((value, at, where) => (at.intact(() => walk(value, where, at.visit)) ? value : null)),
    } as Section<V, Filled>;
  };
