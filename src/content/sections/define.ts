import { Action, actionBody, actionLines } from '../../grammar/action';
import { filledBy } from '../../grammar/codec';
import { paired } from '../../grammar/form';
import { ActionResult } from '../../grammar/actionResult';
import { blockCalled, calledBlock, DslError, Holds, Parser, Written } from '../../grammar/parser';
import { ListParser } from '../../grammar/list';
import { RawLine, RawSection, requireNoBlock, sectionParser } from '../../grammar/structure';
import { AnyField, AnySchema, Authored, DEFAULT_CONTEXT, HydrateContext, PrintContext, SectionSchema, hydrateSection, isListField, isPositionalField, parseAnySection, printSection, unmetNeed, writtenAs } from '../../grammar/section';
import { Loose, Pruning, Visit, condition as visitCondition, put, strings } from '../refs';
import { Condition, condition } from '../../grammar/condition';
import { BY_NAME, mergeFields, overwrittenField } from '../merge';
import { A_LITERAL_BRACE, parseSegments } from '../../grammar/segment';

export type { PrintContext };

export type Ids = 'owned' | 'global' | 'none';

export type Vocabulary = 'declared' | 'open';

export type Maps = Record<string, Map<string, never>>;

export const DEBUG_MARK = 'DEBUG';

const WRITTEN_AGAIN = 'writing over a body already there';

export const EVERY_SECTION: readonly Written[] = [
  {
    form: DEBUG_MARK,
    example: DEBUG_MARK,
    note: 'the section becomes unreachable to a player. Used for internal validation.',
  },
  {
    form: '+<line>',
    example: '+flags: watching',
    family: WRITTEN_AGAIN,
    note: 'adds whatever that line writes to what the body already there holds, rather than replacing it',
  },
  {
    form: '-<line>',
    example: '-stage snubbed',
    family: WRITTEN_AGAIN,
    note: 'takes back out of that body whatever the line writes, and takes nothing out for what it has not got',
  },
];

export const NAMES_THE_SECTION = 'title';

export const TOUCHED = 'touched';

const isMark = (line: RawLine): boolean => line.text === DEBUG_MARK;

export const isDebug = (value: object | undefined): boolean => (value as { debug?: unknown } | undefined)?.debug === true;

export const listedToPlayer = <V extends object>(declared: Iterable<V>): V[] => [...declared].filter((value) => !isDebug(value));

const asDebug = <V extends object>(value: V): V => Object.defineProperty(value, 'debug', { enumerable: true, configurable: true, value: true });

export interface MintedAction {
  action: Action;
  from: string;
}

export interface MemberName {
  kind: string;
  name: string;
}

export type Lands<V, M extends Record<string, unknown>> = {
  [K in keyof M]: (value: V) => readonly (readonly [string, M[K]])[];
};

export interface Section<V extends { id: string } = { id: string }, M extends Record<string, unknown> = Record<string, unknown>> {
  kind: string;
  ids: Ids;
  vocabulary: Vocabulary;
  map: string | null;
  maps: Lands<V, M>;
  nestsActions: boolean;
  mintedActions?: (value: V) => readonly MintedAction[];
  flags: readonly string[];
  names: readonly Named[];
  grammar: readonly Written[];
  bodyOver: BodyOver;
  says?: (value: V) => ActionResult[][];
  members?: (value: V) => readonly MemberName[];
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
  vocabulary: Vocabulary;
  nestsActions?: string;
  mintedActions?: (value: V) => readonly MintedAction[];
  flags?: readonly string[];
  says?: (value: V) => ActionResult[][];
  members?: (value: V) => readonly MemberName[];
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

const LISTED = ', …';

const blockOf = (parser: Parser<unknown>): (() => readonly Written[]) | undefined => ('lines' in parser ? () => (parser as { lines(): readonly Written[] }).lines() : undefined);

const valueOf = (parser: Parser<unknown>): Parser<unknown> => ('element' in parser ? (parser as ListParser<unknown>).element : parser);

const spelled = (parser: Parser<unknown>, written: (value: string) => string, said: object, shown?: string): Written[] =>
  paired(parser.forms, parser.examples).flatMap((example, at) => (example === undefined ? [] : [{ form: written(parser.forms[at]!), example: written(shown ?? example), ...said }]));

function pointedAt(parser: Parser<unknown>, written: (value: string) => string, said: object): Written | undefined {
  const called = parser.called;
  if (called === undefined) return undefined;
  const shown = spelled(parser, written, said)[0];
  if (shown === undefined) return undefined;
  const held = (said as { holds?: Holds }).holds?.() ?? {};
  const list = parser.forms.every((form) => form.endsWith(LISTED));
  return { ...shown, form: written(`<${called}>${list ? LISTED : ''}`), holds: () => ({ ...held, [called]: valueOf(parser) }) };
}

function insteadOf(schema: AnySchema, name: string): string | undefined {
  const groups = schema.exclusive ?? [];
  const mine = groups.find((group) => group.includes(name));
  if (mine === undefined) return undefined;
  const others = groups.filter((group) => group !== mine).flatMap((group) => group.map((each) => writtenAs(schema, each)));
  if (others.length === 0) return undefined;
  return `stands in place of ${others.join(', ')}, which cannot be written in the same body, and which a second body writing this one clears`;
}

function leftOut(spec: AnyField): string | undefined {
  if (spec.printed !== 'unless-default' || spec.default === undefined) return undefined;
  try {
    return `left out, it reads ${(spec.parser as Parser<unknown>).print(spec.default(undefined as never, DEFAULT_CONTEXT))}`;
  } catch {
    return undefined;
  }
}

const fieldLines = (schema: AnySchema, name: string, spec: AnyField): Written[] => {
  const parser = spec.parser as Parser<unknown>;
  const keyword = spec.keyword ?? name;
  const positional = isPositionalField(schema, name);
  const written = (value: string): string => (positional ? value : `${keyword}: ${value}`);
  const needs = schema.needs?.[name];
  const block = positional ? undefined : blockOf(parser);
  const filled = { ...filledBy(parser), ...filledBy(spec) };
  const unwritten = leftOut(spec);
  const displaces = insteadOf(schema, name);
  const note = [spec.note, displaces, unwritten].filter((each) => each !== undefined).join(' — ');
  const said = { ...(spec.family === undefined ? {} : { family: spec.family }), ...(note === '' ? {} : { note }), ...(needs === undefined ? {} : { needs }), ...filled };
  const named = pointedAt(parser, written, said);
  const shapes = named === undefined ? spelled(parser, written, said, spec.example) : [named];
  if (shapes.length === 0) return [];
  const laid = valueOf(parser) === parser ? {} : filledBy(spec);
  const held = block === undefined ? undefined : (): readonly Written[] => block().map((line) => ({ ...line, ...laid }));
  return [...shapes, ...(held === undefined ? [] : [{ form: `${keyword}:`, example: `${keyword}:`, ...said, block: held }])];
};

export const schemaGrammar = (schema: AnySchema): readonly Written[] => [
  ...Object.entries(schema.fields).flatMap(([name, spec]) => fieldLines(schema, name, spec).map((line) => ({ ...line, over: overwrittenField(schema, name) }))),
  ...(schema.keywords ?? []).map((word) => ({ form: word, example: word, over: overwrittenField(schema, word), ...(schema.needs?.[word] === undefined ? {} : { needs: schema.needs![word]! }) })),
  ...(schema.entries === undefined ? [] : schema.entries.body.grammar.map((line) => ({ ...line, over: overwrittenField(schema, schema.entries!.into) }))),
];

const ALONE = /^<(?<hole>[a-z][a-z0-9 -]*)>(?:, …)?$/;

function nameKind(spec: AnyField): string | undefined {
  const parser = spec.parser as Parser<unknown>;
  const holes = parser.forms.map((form) => ALONE.exec(form)?.groups?.hole);
  if (holes.length === 0 || holes.some((hole) => hole === undefined)) return undefined;
  const held = parser.holds?.() ?? {};
  const said = { ...parser.names, ...spec.names };
  const kinds = new Set(
    holes
      .filter((hole) => held[hole!] === undefined)
      .map((hole) => said[hole!])
      .filter((kind): kind is string => typeof kind === 'string'),
  );
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

export interface Named {
  field: string;
  kind: string;
  site: string;
  list: boolean;
  standsWithout: boolean;
}

export const hiddenIf = (note: string) => ({ parser: condition, keyword: 'hidden if', note }) as const;

const conditionFields = (schema: AnySchema): readonly { field: string; site: string }[] =>
  Object.entries(schema.fields).flatMap(([field, spec]) => (spec.parser === condition ? [{ field, site: `${spec.keyword ?? field}:` }] : []));

const namedFields = (schema: AnySchema): readonly Named[] =>
  Object.entries(schema.fields).flatMap(([field, spec]) => {
    const kind = nameKind(spec);
    return kind === undefined ? [] : [{ field, kind, site: `${spec.keyword ?? field}:`, list: isListField(schema, field), standsWithout: spec.standsWithout === true }];
  });

function nestedActionLines(kind: string, offered: string, lines: readonly Written[]): readonly Written[] {
  const own = new Set(actionBody.grammar.map((line) => line.form));
  const note = `addressed as \`${kind}.<${kind}>.<action>\`, which is how a # test names one, and offered ${offered}`;
  return lines.map((line) => (own.has(line.form) ? { ...line, note } : line));
}

const ACTION_OWNERS = new Set<string>();

export const isActionOwnerKind = (kind: string): boolean => ACTION_OWNERS.has(kind);

const notContent = (kind: string): never => {
  throw new DslError(`a # ${kind} is not content and cannot be built into the registry`);
};

export const writtenWhole = (_into: object | undefined, from: object): object => from;

export type BodyOver = 'lines' | 'whole';

const marked = (line: Written): Written => (line.over !== 'by name' ? line : { ...line, note: line.note === undefined ? BY_NAME : `${line.note} — ${BY_NAME}` });

const markedLines = (lines: readonly Written[]): readonly Written[] => {
  if (!lines.some((line) => line.over === 'by name')) return lines;
  const out = lines.map(marked);
  const called = blockCalled(lines);
  return called === undefined ? out : calledBlock(called, out);
};

export const section =
  <V extends { id: string }, F extends keyof V = never, E extends keyof V = never>() =>
  <const Name extends string = never, Filled extends Record<string, unknown> = Record<Name, V>>(
    spec: (Schematic<V, F, E> | Bespoke<V>) & {
      map?: Name;
      maps?: Lands<V, Filled>;
    },
  ): Section<V, Filled> => {
    const { kind, ids, vocabulary, map, maps, nestsActions, mintedActions, flags = [], says, members, text = [], validate, visit, merge, print, prune } = spec;
    const walk = visit ?? ((): void => {});
    const schema = 'fields' in spec ? ({ ...spec, kind } as unknown as AnySchema) : undefined;
    if (nestsActions !== undefined) ACTION_OWNERS.add(kind);
  if (schema === undefined && typeof (spec as Bespoke<V>).parse !== 'function') throw new Error(`# ${kind} declares neither fields nor a parse`);
    if (schema === undefined && merge === undefined && (map !== undefined || maps !== undefined)) {
      throw new Error(`# ${kind} reads its own body and lands in a map, so it must declare a merge: what a second body written at one of its ids means`);
    }
    const names = schema === undefined ? [] : namedFields(schema);
    const conditions = schema === undefined ? [] : conditionFields(schema);
    const written = schema ? schemaGrammar(schema) : (spec as Bespoke<V>).grammar;
    const visited = (value: V, where: string, visit: Visit): void => {
      for (const each of names) {
        const at = `${where} ${each.site}`;
        if (each.list) strings(value as unknown as Loose, each.field, each.kind, at, visit);
        else put(value as unknown as Loose, each.field, each.kind, at, visit);
      }
      for (const each of conditions) visitCondition((value as unknown as Loose)[each.field] as Condition | undefined, `${where} ${each.site}`, visit);
      walk(value, where, visit);
    };
    const without = (value: V, at: Pruning, where: string): V | null => {
      let held: Loose | undefined;
      for (const each of conditions) {
        const written = (value as unknown as Loose)[each.field] as Condition | undefined;
        if (!at.intact(() => visitCondition(written, `${where} ${each.site}`, at.visit))) return null;
      }
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
    const unfillable = (value: V): string | undefined => {
      const written = (value as unknown as Loose)[NAMES_THE_SECTION];
      if (typeof written !== 'string' || !parseSegments(written, 0).some((segment) => segment.kind !== 'literal')) return undefined;
      return `${NAMES_THE_SECTION}: holds a fragment, and a name is not a line the game says. Write ${A_LITERAL_BRACE} for a brace of its own.`;
    };
    const built = (value: V, problem = unfillable(value) ?? validate?.(value)): V => {
      if (problem) throw new DslError(`# ${kind} ${value.id}: ${problem}`);
      return value;
    };
    const readBody = sectionParser(schema ? (raw: RawSection) => parseAnySection(raw, schema) : (spec as Bespoke<V>).parse);
    const read = (raw: RawSection): object => {
      const marks = raw.body.filter(isMark);
      if (marks.length === 0) return readBody(raw) as object;
      for (const line of marks) requireNoBlock(line);
      return asDebug(readBody({ ...raw, body: raw.body.filter((line) => !isMark(line)) }) as object);
    };
    const mergeBodies =
      merge ??
      (schema
        ? (into: object | undefined, from: object) => mergeFields((into as Record<string, unknown>) ?? { id: (from as V).id }, from as Record<string, unknown>, schema)
        : (): never => notContent(kind));
    const hydrate = schema
      ? (authored: object, context: HydrateContext): V => built(hydrateSection(authored as Authored<V>, schema as unknown as SectionSchema<V, F, E>, context) as V, unmetNeed(authored as Record<string, unknown>, schema) ?? undefined)
      : (authored: object): V => built(authored as V);
    const printBody = print ?? (schema ? (value: V, context: PrintContext) => printSection(value, schema, context, actionLines) : () => notContent(kind));
    return {
      kind,
      ids,
      vocabulary,
      map: map ?? (maps === undefined ? null : Object.keys(maps)[0]!),
      maps: (maps ?? (map === undefined ? {} : { [map]: (value: V) => [[value.id, value] as const] })) as Lands<V, Filled>,
      nestsActions: nestsActions !== undefined,
      mintedActions,
      flags,
      names,
      grammar: markedLines(nestsActions === undefined ? written : nestedActionLines(kind, nestsActions, written)),
      bodyOver: merge === writtenWhole ? 'whole' : 'lines',
      says,
      members,
      text,
      schema,
      parse: read,
      merge: (into, from) => {
        const merged = mergeBodies(into, from);
        return isDebug(into) || isDebug(from) ? asDebug(merged) : merged;
      },
      build: (authored, context) => (isDebug(authored) ? asDebug(hydrate(authored, context)) : hydrate(authored, context)),
      print: (value, context) => {
        const lines = printBody(value, context);
        return isDebug(value) ? [lines[0]!, DEBUG_MARK, ...lines.slice(1)] : lines;
      },
      visit: visited,
      prune: (value, at, where) => {
        const kept = without(value, at, where);
        if (kept === null) return null;
        return prune === undefined ? (at.intact(() => visited(kept, where, at.visit)) ? kept : null) : prune(kept, at, where);
      },
    } as Section<V, Filled>;
  };
