import { actionLines } from '../../grammar/action';
import { filledBy } from '../../grammar/codec';
import { paired } from '../../grammar/form';
import { ActionResult } from '../../grammar/actionResult';
import { DslError, Parser, Written } from '../../grammar/parser';
import { ListParser } from '../../grammar/list';
import { RawSection, sectionParser } from '../../grammar/structure';
import { AnyField, AnySchema, Authored, HydrateContext, PrintContext, SectionSchema, hydrateSection, isListField, isPositionalField, parseAnySection, printSection } from '../../grammar/section';
import { Loose, Pruning, Visit, put, strings } from '../refs';
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
  names: readonly Named[];
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
  // What the field says its placeholders hold stands over what the parser says, since one parser writes the values of fields that name different kinds.
  const filled = { ...filledBy(parser), ...filledBy(spec) };
  // A family says what a line is for. Whether it was declared as a field, as a positional one or as a keyword is how the engine holds it, not what an author is choosing between, so a schema line joins no family unless its kind says which one it is in.
  const said = { ...(spec.family === undefined ? {} : { family: spec.family }), ...(spec.note === undefined ? {} : { note: spec.note }), ...(needs === undefined ? {} : { needs }), ...filled };
  const shapes = paired(parser.forms, parser.examples).flatMap((example, at) => (example === undefined ? [] : [{ form: written(parser.forms[at]!), example: written(example), ...said }]));
  if (shapes.length === 0) return [];
  // A block's lines are a grammar of their own and already say what they hold; only what the field says over its parser is laid on them.
  const held = block === undefined ? undefined : (): readonly Written[] => block().map((line) => ({ ...line, ...filledBy(spec) }));
  return [...shapes, ...(held === undefined ? [] : [{ form: `${keyword}:`, example: `${keyword}:`, ...said, block: held }])];
};

const schemaGrammar = (schema: AnySchema): readonly Written[] => [
  ...Object.entries(schema.fields).flatMap(([name, spec]) => fieldLines(schema, name, spec)),
  ...(schema.keywords ?? []).map((word) => ({ form: word, example: word, ...(schema.needs?.[word] === undefined ? {} : { needs: schema.needs![word]! }) })),
  ...(schema.entries?.body.grammar ?? []),
];

// A shape that is one placeholder and nothing else, which is what a field written as a bare name has.
const ALONE = /^<(?<hole>[a-z][a-z0-9 -]*)>(?:, …)?$/;

// The kind a field's values name, where a value of it is a name and nothing else. Its shapes say so, so the engine walks them under that kind rather than each kind's file writing the same word into a `visit` of its own.
function nameKind(spec: AnyField): string | undefined {
  const parser = spec.parser as Parser<unknown>;
  const holes = parser.forms.map((form) => ALONE.exec(form)?.groups?.hole);
  if (holes.length === 0 || holes.some((hole) => hole === undefined)) return undefined;
  const held = parser.holds?.() ?? {};
  const said = { ...parser.names, ...spec.names };
  // A placeholder that holds a grammar holds more than a name, and a shape that names nothing leaves the field's word to the shapes that do.
  const kinds = new Set(
    holes
      .filter((hole) => held[hole!] === undefined)
      .map((hole) => said[hole!])
      .filter((kind): kind is string => typeof kind === 'string'),
  );
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

// A field whose values are names of one kind, which is what the engine walks and prunes without its kind's file saying so again.
export interface Named {
  field: string;
  kind: string;
  site: string;
  list: boolean;
  standsWithout: boolean;
}

const namedFields = (schema: AnySchema): readonly Named[] =>
  Object.entries(schema.fields).flatMap(([field, spec]) => {
    const kind = nameKind(spec);
    return kind === undefined ? [] : [{ field, kind, site: `${spec.keyword ?? field}:`, list: isListField(schema, field), standsWithout: spec.standsWithout === true }];
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
    const names = schema === undefined ? [] : namedFields(schema);
    const visited = (value: V, where: string, visit: Visit): void => {
      for (const each of names) {
        const at = `${where} ${each.site}`;
        if (each.list) strings(value as unknown as Loose, each.field, each.kind, at, visit);
        else put(value as unknown as Loose, each.field, each.kind, at, visit);
      }
      walk(value, where, visit);
    };
    // What is left of a section once the names it holds that nothing declares any more are taken out of it. A list loses those members; a name held on its own takes the section with it, unless its field says the section stands without it.
    const without = (value: V, at: Pruning, where: string): V | null => {
      let held: Loose | undefined;
      for (const each of names) {
        const current = (value as unknown as Loose)[each.field];
        const site = `${where} ${each.site}`;
        if (each.list) {
          if (!Array.isArray(current)) continue;
          const kept = current.filter((one) => typeof one !== 'string' || !at.gone(each.kind, one, site));
          if (kept.length !== current.length) (held ??= { ...(value as unknown as Loose) })[each.field] = kept;
          continue;
        }
        if (typeof current !== 'string' || !at.gone(each.kind, current, site)) continue;
        if (!each.standsWithout) return null;
        (held ??= { ...(value as unknown as Loose) })[each.field] = undefined;
      }
      return (held ?? value) as V;
    };
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
      names,
      grammar: schema ? schemaGrammar(schema) : (spec as Bespoke<V>).grammar,
      says,
      text,
      schema,
      parse: sectionParser(schema ? (raw) => parseAnySection(raw, schema) : (spec as Bespoke<V>).parse),
      merge: merge ?? ((into, from) => (schema ? mergeFields((into as Record<string, unknown>) ?? { id: (from as V).id }, from as Record<string, unknown>, schema) : (into ?? from))),
      build: schema ? (authored, context) => built(hydrateSection(authored as Authored<V>, schema as unknown as SectionSchema<V, F, E>, context) as V) : (authored) => built(authored as V),
      print: print ?? (schema ? (value, context) => printSection(value, schema, context, actionLines) : () => notContent(kind)),
      visit: visited,
      prune: (value, at, where) => {
        const kept = without(value, at, where);
        if (kept === null) return null;
        return prune === undefined ? (at.intact(() => visited(kept, where, at.visit)) ? kept : null) : prune(kept, at, where);
      },
    } as Section<V, Filled>;
  };
