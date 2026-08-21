import { actionLines } from '../../grammar/action';
import { exampleOf } from '../../grammar/form';
import { ActionResult } from '../../grammar/actionResult';
import { DslError, Parser, Written } from '../../grammar/parser';
import { ListParser } from '../../grammar/list';
import { RawSection, sectionParser } from '../../grammar/structure';
import { AnyField, AnySchema, Authored, HydrateContext, PrintContext, SectionSchema, hydrateSection, isPositionalField, parseAnySection, printSection } from '../../grammar/section';
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
  grammar: readonly Written[];
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
  grammar: readonly Written[];
}

const blockOf = (parser: Parser<unknown>): (() => readonly Written[]) | undefined => ('element' in parser ? () => (parser as ListParser<unknown>).lines() : undefined);

const fieldLines = (schema: AnySchema, name: string, spec: AnyField): Written[] => {
  const parser = spec.parser as Parser<unknown>;
  const keyword = spec.keyword ?? name;
  const positional = isPositionalField(schema, name);
  const written = (value: string): string => (positional ? value : `${keyword}: ${value}`);
  const needs = schema.needs?.[name];
  const block = positional ? undefined : blockOf(parser);
  const said = { family: positional ? 'written bare' : 'its own fields', ...(spec.note === undefined ? {} : { note: spec.note }), ...(needs === undefined ? {} : { needs }) };
  const shapes = parser.forms.flatMap((form) => {
    const example = exampleOf(form, parser.examples);
    return example === undefined ? [] : [{ form: written(form), example: written(example), ...said }];
  });
  if (shapes.length === 0) return [];
  return [...shapes, ...(block === undefined ? [] : [{ form: `${keyword}:`, example: `${keyword}:`, ...said, block }])];
};

const schemaGrammar = (schema: AnySchema): readonly Written[] => [
  ...Object.entries(schema.fields).flatMap(([name, spec]) => fieldLines(schema, name, spec)),
  ...(schema.keywords ?? []).map((word) => ({ form: word, example: word, family: 'a flag it carries', ...(schema.needs?.[word] === undefined ? {} : { needs: schema.needs![word]! }) })),
  ...(schema.entries?.body.grammar ?? []),
];

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
