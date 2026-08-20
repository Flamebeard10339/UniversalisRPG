import { actionLines } from '../../grammar/action';
import { DslError } from '../../grammar/parser';
import { RawSection, sectionParser } from '../../grammar/structure';
import { AnySchema, Authored, HydrateContext, PrintContext, SectionSchema, hydrateSection, parseAnySection, printSection } from '../../grammar/section';
import { Visit } from '../refs';
import { mergeFields } from '../merge';

export type { PrintContext };

// Who owns the ids a section of this kind declares. `owned` qualifies the id
// with the declaring module's namespace, `global` means the name means the same
// thing in every module that says it, `none` means the section declares nothing
// anyone else can name.
export type Ids = 'owned' | 'global' | 'none';

// The registry as a writer sees it. Readers get `Registry`, where each map's
// value type is the one its kind declares.
export type Maps = Record<string, Map<string, never>>;

// Everything anyone asks about a section kind, in one shape. Every field is
// filled in — `section()` supplies the schema-driven answer for any the kind
// did not write — so no consumer branches on which kind it is holding.
export interface Section<V extends { id: string } = { id: string }, M extends string | null = string | null> {
  kind: string;
  ids: Ids;
  map: M;
  nestsActions: boolean;
  // The fields whose values are prose, in the order a `# locale` lists them.
  text: readonly string[];
  schema?: AnySchema;
  parse(raw: RawSection): object;
  merge(into: object | undefined, from: object): object;
  build(authored: object, context: HydrateContext): V;
  store(value: V, into: Maps): void;
  print(value: V, context: PrintContext): readonly string[];
  visit(value: V, where: string, visit: Visit): void;
}

interface Common<V extends { id: string }> {
  kind: string;
  ids: Ids;
  nestsActions?: true;
  text?: readonly string[];
  // What is wrong with an assembled value, in the words an author reads. A
  // kind's own invariants live beside its fields rather than in the loader.
  validate?: (value: V) => string | undefined;
  // Where the value lands, for a kind that fills more than its own map.
  store?: (value: V, into: Maps) => void;
  visit?: (value: V, where: string, visit: Visit) => void;
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

const notContent = (kind: string): never => {
  throw new DslError(`a # ${kind} is not content and cannot be built into the registry`);
};

// Curried so that the value type is written and the map name is inferred: a
// single call cannot do both, and the map name has to stay the literal it was
// written as or the registry it keys cannot derive its own maps.
export const section =
  <V extends { id: string }, F extends keyof V = never, E extends keyof V = never>() =>
  <const M extends string | undefined = undefined>(spec: (Schematic<V, F, E> | Bespoke<V>) & { map?: M }): Section<V, M extends string ? M : null> => {
  const { kind, ids, map, nestsActions = false, text = [], validate, store, visit, merge, print } = spec;
  const schema = 'fields' in spec ? ({ ...spec, kind } as unknown as AnySchema) : undefined;
  const built = (value: V): V => {
    const problem = validate?.(value);
    if (problem) throw new DslError(`# ${kind} ${value.id}: ${problem}`);
    return value;
  };
  return {
    kind,
    ids,
    map: map ?? null,
    nestsActions,
    text,
    schema,
    parse: sectionParser(schema ? (raw) => parseAnySection(raw, schema) : (spec as Bespoke<V>).parse),
    merge: merge ?? ((into, from) => (schema ? mergeFields((into as Record<string, unknown>) ?? { id: (from as V).id }, from as Record<string, unknown>, schema) : (into ?? from))),
    build: schema ? (authored, context) => built(hydrateSection(authored as Authored<V>, schema as unknown as SectionSchema<V, F, E>, context) as V) : (authored) => built(authored as V),
    store: store ?? (map === undefined ? () => notContent(kind) : (value, into) => into[map]!.set(value.id, value as never)),
    print: print ?? (schema ? (value, context) => printSection(value, schema, context, actionLines) : () => notContent(kind)),
    visit: visit ?? (() => {}),
  } as Section<V, M extends string ? M : null>;
};
