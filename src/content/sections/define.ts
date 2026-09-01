import { Action, actionBody, actionLines } from '../../grammar/action';
import { filledBy } from '../../grammar/codec';
import { paired } from '../../grammar/form';
import { ActionResult } from '../../grammar/actionResult';
import { DslError, Holds, Parser, Written } from '../../grammar/parser';
import { ListParser } from '../../grammar/list';
import { RawLine, RawSection, requireNoBlock, sectionParser } from '../../grammar/structure';
import { AnyField, AnySchema, Authored, HydrateContext, PrintContext, SectionSchema, hydrateSection, isListField, isPositionalField, parseAnySection, printSection, unmetNeed } from '../../grammar/section';
import { Loose, Pruning, Visit, put, strings } from '../refs';
import { mergeFields } from '../merge';
import { parametersOf } from '../../grammar/values';

export type { PrintContext };

// Where a kind's own ids are kept apart. `owned` qualifies the id with its module's namespace, `global` means one name across every module, `none` declares nothing anyone can name. This says nothing about what happens where one of these is named — `Vocabulary` does.
export type Ids = 'owned' | 'global' | 'none';

// Whether a name of this kind is held to what the world declares. `declared` refuses one nothing declared, where it is written; `open` takes whatever an author writes, which is what a kind whose vocabulary is written somewhere other than its own sections has to do.
export type Vocabulary = 'declared' | 'open';

export type Maps = Record<string, Map<string, never>>;

// A section written to prove something about the engine, which ships to nobody. Upper case because nothing else in the language is, so it can never be read as an id, a keyword or a value of some kind's own; and written under the heading rather than in it, because a heading is rebuilt from its parts wherever a section is moved or renamed and a body line is carried along whole.
export const DEBUG_MARK = 'DEBUG';

// A second body at an id already written is laid over the one there rather than replacing it, and these are how it adds to and takes back what the first one wrote. The engine reads them wherever a line is written, so they belong to no kind and are said once; a kind that will not take one refuses it where it stands.
const WRITTEN_AGAIN = 'writing over a body already there';

// The line every kind takes and no kind declares. It is not in any kind's grammar because it belongs to none of them — what holds of every section is written here once, and the page an author reads says so in the same words.
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

// The one name for *the player has interacted with this thing themselves*, put in a kind's `flags`
// by every kind whose things a player interacts with. It is named on the contract rather than in one
// kind's file because two kinds mean the same thing by it — an entity that has been read and a
// location that has been stood in are the same fact about the player — and a third kind that becomes
// interactable joins them by declaring this, not by minting a word of its own.
export const TOUCHED = 'touched';

const isMark = (line: RawLine): boolean => line.text === DEBUG_MARK;

export const isDebug = (value: object | undefined): boolean => (value as { debug?: unknown } | undefined)?.debug === true;

// What a sheet that lists what the world declares may put on it. What keeps a DEBUG section out of a player's hands everywhere else is that anything they can reach is refused for naming it — and a sheet that walks a registry map names nothing, it lists everything, so the refusal never fires there and the sheet asks here instead. A sheet that reports what a player holds or where they stand is reading their state and is not one of these.
export const listedToPlayer = <V extends object>(declared: Iterable<V>): V[] => [...declared].filter((value) => !isDebug(value));

// Laid on the value rather than held in a table beside it, so every hand a section passes through — a merge, a build, a prune that spreads it, a printer — carries the mark without knowing it is there.
const asDebug = <V extends object>(value: V): V => Object.defineProperty(value, 'debug', { enumerable: true, configurable: true, value: true });

// An action a section of this kind offers that its author did not write as an action block: the action itself, which says where it is addressed and whose words it is, and the line an author reads it under.
export interface MintedAction {
  action: Action;
  from: string;
}

// A name the namespace holds under one value of this kind, wherever that value came from. A kind declaring this is answering for every value that lands in its map, including the ones another kind put there.
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
  // Where the actions written under this kind reach, said as the rest of "offered …". A kind that nests actions is the only thing that knows this — nothing in the engine can tell an item the player carries from an entity that stays where it stands — so declaring the reach is how a kind declares that it nests them at all.
  nestsActions?: string;
  // The actions a section of this kind offers that its author did not write as an action block. Read off the value, since a kind mints one only where the field it compiles is written.
  mintedActions?: (value: V) => readonly MintedAction[];
  // Flags every section of this kind owns without an author writing them.
  flags?: readonly string[];
  // The result lists an author wrote here, whose spoken lines key under this id.
  says?: (value: V) => ActionResult[][];
  // The names one of these holds that anything may address, which the namespace declares beneath whatever section landed the value.
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

// What a keyword's shapes trail off in where it takes a list of them.
const LISTED = ', …';

// The grammar a field's own body is written in, where its parser has one. Asked of the parser rather than of the field, so any parser that says what its indented lines hold is offered as a block wherever it stands.
const blockOf = (parser: Parser<unknown>): (() => readonly Written[]) | undefined => ('lines' in parser ? () => (parser as { lines(): readonly Written[] }).lines() : undefined);

// The parser a value of this one is written with, which for a list is the parser one item of it is written with.
const valueOf = (parser: Parser<unknown>): Parser<unknown> => ('element' in parser ? (parser as ListParser<unknown>).element : parser);

// Every shape the parser takes, written out where it stands.
const spelled = (parser: Parser<unknown>, written: (value: string) => string, said: object, shown?: string): Written[] =>
  paired(parser.forms, parser.examples).flatMap((example, at) => (example === undefined ? [] : [{ form: written(parser.forms[at]!), example: written(shown ?? example), ...said }]));

// A grammar with a name of its own is pointed at rather than written out: the field takes `<name>`,
// and what a `<name>` is written with is said once, wherever the page says it. What the hole holds is
// the parser itself, which is how the same line still answers an author standing in it.
function pointedAt(parser: Parser<unknown>, written: (value: string) => string, said: object): Written | undefined {
  const called = parser.called;
  if (called === undefined) return undefined;
  const shown = spelled(parser, written, said)[0];
  if (shown === undefined) return undefined;
  const held = (said as { holds?: Holds }).holds?.() ?? {};
  // A list is its element written over and over, so the name stands where one item does and the list's own `, …` is kept.
  const list = parser.forms.every((form) => form.endsWith(LISTED));
  return { ...shown, form: written(`<${called}>${list ? LISTED : ''}`), holds: () => ({ ...held, [called]: valueOf(parser) }) };
}

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
  const named = pointedAt(parser, written, said);
  const shapes = named === undefined ? spelled(parser, written, said, spec.example) : [named];
  if (shapes.length === 0) return [];
  // A block whose lines are this field's own values written one to a line takes what the field says over its parser; a block that is a grammar of its own already says what each of its lines holds.
  const laid = valueOf(parser) === parser ? {} : filledBy(spec);
  const held = block === undefined ? undefined : (): readonly Written[] => block().map((line) => ({ ...line, ...laid }));
  return [...shapes, ...(held === undefined ? [] : [{ form: `${keyword}:`, example: `${keyword}:`, ...said, block: held }])];
};

export const schemaGrammar = (schema: AnySchema): readonly Written[] => [
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

// How an action nested under a kind is addressed and how far it reaches, laid on the lines `actionBody` itself declares. Those forms are what tells an action apart from whatever else a kind nests beside it — an entity's `on <event>:` is not offered anywhere — and the reach is the kind's own word, so this is written once for however many kinds nest actions.
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

// What a second body at one id means for a kind whose body has no fields to lay over one another:
// the later writing is the section, and the earlier one is gone. A kind with a rule of its own
// declares it instead; a kind with neither is refused where it is declared, because keeping the
// first and dropping the second is the one answer an author is never told about.
export const writtenWhole = (_into: object | undefined, from: object): object => from;

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
    const written = schema ? schemaGrammar(schema) : (spec as Bespoke<V>).grammar;
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
    // A prose field is said to a player as it is written: nothing stands beside it to fill a hole, so a `{…}` in one names something that will never arrive. What is spoken — a line of dialogue, a `say:` — is read as segments instead, and is not one of these.
    const unfillable = (value: V): string | undefined => {
      for (const field of text) {
        const written = (value as unknown as Loose)[field];
        if (typeof written !== 'string') continue;
        const named = parametersOf(written);
        if (named.length > 0) return `${field}: names ${named.map((one) => `{${one}}`).join(', ')}, which nothing supplies`;
      }
      return undefined;
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
      grammar: nestsActions === undefined ? written : nestedActionLines(kind, nestsActions, written),
      says,
      members,
      text,
      schema,
      parse: read,
      // A section already marked cannot be unmarked by a later edit of it: what is written to prove something about the engine stays out of the world however many modules go on to add to it.
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
