import { actionLines } from '../../grammar/action';
import { ActionResult } from '../../grammar/actionResult';
import { DslError, Parser } from '../../grammar/parser';
import { RawSection, sectionParser } from '../../grammar/structure';
import { AnyField, AnySchema, Authored, Grammar, HydrateContext, Lines, PrintContext, SectionSchema, bothLines, hydrateSection, isPositionalField, noLines, parseAnySection, printSection } from '../../grammar/section';
import { Pruning, Visit } from '../refs';
import { mergeFields } from '../merge';

export type { PrintContext };

// `owned` qualifies the id with its module's namespace, `global` means one name across every module, `none` declares nothing anyone can name.
export type Ids = 'owned' | 'global' | 'none';

export type Maps = Record<string, Map<string, never>>;

export type Lands<V, M extends Record<string, unknown>> = {
  [K in keyof M]: (value: V) => readonly (readonly [string, M[K]])[];
};

export interface Section<V extends { id: string } = { id: string }, M extends Record<string, unknown> = Record<string, unknown>> {
  kind: string;
  ids: Ids;
  map: string | null;
  maps: Lands<V, M>;
  nestsActions: boolean;
  flags: readonly string[];
  grammar: Grammar;
  says?: (value: V) => ActionResult[][];
  text: readonly string[];
  schema?: AnySchema;
  parse(raw: RawSection): object;
  merge(into: object | undefined, from: object): object;
  build(authored: object, context: HydrateContext): V;
  print(value: V, context: PrintContext): readonly string[];
  visit(value: V, where: string, visit: Visit): void;
  prune(value: V, at: Pruning, where: string): V | null;
}

interface Common<V extends { id: string }> {
  kind: string;
  ids: Ids;
  nestsActions?: true;
  // Flags every section of this kind owns without an author writing them.
  flags?: readonly string[];
  // The result lists an author wrote here, whose spoken lines key under this id.
  says?: (value: V) => ActionResult[][];
  text?: readonly string[];
  validate?: (value: V) => string | undefined;
  visit?: (value: V, where: string, visit: Visit) => void;
  prune?: (value: V, at: Pruning, where: string) => V | null;
  merge?: (into: object | undefined, from: object) => object;
  print?: (value: V, context: PrintContext) => readonly string[];
}

type Schematic<V extends { id: string }, F extends keyof V, E extends keyof V> = Common<V> & Omit<SectionSchema<V, F, E>, 'kind'>;

interface Bespoke<V extends { id: string }> extends Common<V> {
  parse: (raw: RawSection) => V;
  print: (value: V, context: PrintContext) => readonly string[];
  grammar: Grammar;
}

const fieldLine = (schema: AnySchema, name: string, spec: AnyField): Lines => {
  const parser = spec.parser as Parser<unknown>;
  const [form] = parser.forms;
  const [example] = parser.examples;
  if (form === undefined || example === undefined) return noLines;
  const written = (value: string): string => (isPositionalField(schema, name) ? value : `${spec.keyword ?? name}: ${value}`);
  return { forms: [written(form)], examples: [written(example)] };
};

const schemaGrammar = (schema: AnySchema): Grammar => ({
  lines: bothLines([
    ...Object.entries(schema.fields).map(([name, spec]) => fieldLine(schema, name, spec)),
    { forms: schema.keywords ?? [], examples: schema.keywords ?? [] },
    schema.entries?.body.grammar.opens ?? noLines,
  ]),
  block: schema.entries?.body.grammar,
});

const ACTION_OWNERS = new Set<string>();

export const isActionOwnerKind = (kind: string): boolean => ACTION_OWNERS.has(kind);

const notContent = (kind: string): never => {
  throw new DslError(`a # ${kind} is not content and cannot be built into the registry`);
};

export const section =
  <V extends { id: string }, F extends keyof V = never, E extends keyof V = never>() =>
  <const Name extends string = never, Filled extends Record<string, unknown> = Record<Name, V>>(
    spec: (Schematic<V, F, E> | Bespoke<V>) & {
      map?: Name;
      maps?: Lands<V, Filled>;
    },
  ): Section<V, Filled> => {
    const { kind, ids, map, maps, nestsActions = false, flags = [], says, text = [], validate, visit, merge, print, prune } = spec;
    const walk = visit ?? ((): void => {});
    const schema = 'fields' in spec ? ({ ...spec, kind } as unknown as AnySchema) : undefined;
    if (nestsActions) ACTION_OWNERS.add(kind);
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
      flags,
      grammar: schema ? schemaGrammar(schema) : (spec as Bespoke<V>).grammar,
      says,
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
