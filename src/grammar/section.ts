import { Cursor, DslError, Filled, Parser, Span, Written } from './parser';
import { ListParser } from './list';
import { RawLine, RawSection, hasBlock, indentLines, sectionParser, takeBlock } from './structure';

export interface HydrateContext {
  language: string;
}

export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_CONTEXT: HydrateContext = { language: DEFAULT_LANGUAGE };

export type PrintWhen = 'when-set' | 'always' | 'unless-default';

export interface FieldPrinting extends Filled {
  // The section stands when what this field names is removed, and the field is cleared instead. A section written around a name it no longer has cannot stand; one that merely points at another does.
  standsWithout?: true;
  note?: string;
  // What this line is for, said in the words an author is choosing between. Lines that share one are offered together, whether the kind declares them as fields, as keywords or in its own grammar.
  family?: string;
  printed?: PrintWhen;
  block?: true;
  generated?: true;
}

export interface Field<T, Self> extends FieldPrinting {
  parser: Parser<NonNullable<T>>;
  default?: (self: Self, context: HydrateContext) => T;
  keyword?: string; // DSL surface keyword, when it differs from the field name
}

export interface MappedField<T, Self> extends FieldPrinting {
  parser: Parser<unknown>;
  hydrate(parsed: unknown): NonNullable<T>;
  dehydrate?: (held: NonNullable<T>) => unknown[];
  default?: (self: Self, context: HydrateContext) => T;
  keyword?: string;
}

export interface EntryBody {
  parse(cursor: Cursor, label: string): object;
  parseBlock(lines: RawLine[], label: string): object;
  grammar: readonly Written[];
}

export interface SectionSchema<H extends { id: string }, Flags extends keyof H = never, Entries extends keyof H = never> {
  kind: string;
  fields: {
    [K in Exclude<keyof H, 'id' | Flags | Entries>]: Field<H[K], H> | MappedField<H[K], H>;
  };
  clauses?: Exclude<keyof H, 'id' | Flags | Entries>;
  bare?: Exclude<keyof H, 'id' | Flags | Entries>;
  keywords?: readonly Flags[];
  keywordsAfter?: Exclude<keyof H, 'id' | Flags | Entries>;
  entries?: { into: Entries; body: EntryBody };
  exclusive?: readonly (readonly Exclude<keyof H, 'id' | Flags | Entries>[])[];
  needs?: Partial<Record<Exclude<keyof H, 'id'> | Flags, Exclude<keyof H, 'id' | Flags | Entries>>>;
}

export type Authored<H extends { id: string }> = { id: string } & Partial<Omit<H, 'id'>>;

export interface AnyField extends FieldPrinting {
  parser: unknown;
  keyword?: string;
  default?: (self: never, context: HydrateContext) => unknown;
  dehydrate?: (held: never) => unknown[];
}

export interface AnySchema {
  kind: string;
  fields: Record<string, AnyField>;
  clauses?: string;
  bare?: string;
  keywords?: readonly string[];
  keywordsAfter?: string;
  entries?: { into: string; body: EntryBody };
  needs?: Record<string, string>;
}

const isListParser = (parser: unknown): boolean => typeof parser === 'object' && parser !== null && 'element' in parser;

export const isListField = (schema: AnySchema, name: string): boolean => isListParser(schema.fields[name]?.parser);

export const isPositionalField = (schema: Pick<AnySchema, 'clauses' | 'bare'>, name: string): boolean => name === schema.clauses || name === schema.bare;

export interface FieldEdits {
  ops: { op: '+' | '-'; values: unknown[] }[];
}

export const isFieldEdits = (value: unknown): value is FieldEdits => typeof value === 'object' && value !== null && 'ops' in value;

export function listMembers<T>(value: unknown): T[] {
  if (isFieldEdits(value)) return value.ops.flatMap((op) => op.values as T[]);
  return Array.isArray(value) ? (value as T[]) : [];
}

export interface EntryRemoval {
  label: string;
  removed: true;
}

export const isEntryRemoval = (entry: { label: string }): entry is EntryRemoval => (entry as EntryRemoval).removed === true;

export const parseAnySection = (section: RawSection, schema: AnySchema): { id: string } => parseSection(section, schema as unknown as SectionSchema<{ id: string }>);

type AnyFields = Record<
  string,
  {
    parser: Parser<unknown>;
    hydrate?: (parsed: unknown) => unknown;
    default?: (self: unknown, context: HydrateContext) => unknown;
    keyword?: string;
  }
>;
type EntryConfig = { into: string; body: EntryBody };

const KEY = /(?<op>[+-][ \t]*)?(?<key>[a-z][a-z0-9 -]*?):/;
const WORD = /[a-z][a-z0-9-]*/;

function parseBlock(parser: Parser<unknown>, children: RawLine[], span: Span): unknown {
  if (!('parseBlock' in parser)) throw new DslError('this field cannot be written as a block', span);
  return (parser as ListParser<unknown>).parseBlock(children);
}

export function parseSection<H extends { id: string }, F extends keyof H = never, E extends keyof H = never>(section: RawSection, schema: SectionSchema<H, F, E>): Authored<H> {
  return sectionParser((read: RawSection) => readSection(read, schema))(section);
}

function readSection<H extends { id: string }, F extends keyof H = never, E extends keyof H = never>(section: RawSection, schema: SectionSchema<H, F, E>): Authored<H> {
  if (section.kind !== schema.kind) throw new DslError(`expected # ${schema.kind}, got # ${section.kind}`, section.span);
  if (!section.id) throw new DslError(`# ${schema.kind} requires an id`, section.span);

  const fields = schema.fields as unknown as AnyFields;
  const byKeyword: Record<string, string> = {};
  for (const name of Object.keys(fields)) byKeyword[fields[name].keyword ?? name] = name;
  const keywords = (schema.keywords ?? []) as readonly string[];
  const clauses = schema.clauses as string | undefined;
  const bare = schema.bare as string | undefined;
  const entries = schema.entries as EntryConfig | undefined;
  const authored: Record<string, unknown> = { id: section.id };
  for (const line of section.body) parseLine(line, fields, byKeyword, keywords, clauses, bare, entries, schema.kind, authored);

  if (schema.exclusive) {
    const active = schema.exclusive.filter((group) => (group as readonly string[]).some((key) => authored[key] !== undefined));
    if (active.length > 1) {
      const names = active.flat().filter((key) => authored[key as string] !== undefined);
      throw new DslError(`# ${schema.kind} ${section.id}: ${names.join(' and ')} cannot both be set`, section.span);
    }
  }
  return authored as Authored<H>;
}

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let edits = 0;
  for (let j = 0; j < longer.length; j++) {
    if (shorter[i] === longer[j]) i++;
    else if (++edits > 1) return false;
    else if (shorter.length === longer.length) i++;
  }
  return edits + (shorter.length - i) <= 1;
}

const SHORTEST_TYPO = 3;

export function typoOf(key: string, known: readonly string[]): string | undefined {
  if (key.length < SHORTEST_TYPO) return undefined;
  return known.find((field) => withinOneEdit(field, key));
}

const claimsTheBlock = (cursor: Cursor, line: RawLine): boolean => hasBlock(line) && cursor.rest().replace(/[ \t,]+$/, '') === '';

function parseLine(line: RawLine, fields: AnyFields, byKeyword: Record<string, string>, keywords: readonly string[], clauses: string | undefined, bare: string | undefined, entries: EntryConfig | undefined, kind: string, authored: Record<string, unknown>): void {
  const cursor = new Cursor(line.text, 0, line.span.start);

  while (!cursor.done) {
    cursor.take(/[ \t]*/);
    if (cursor.done) break;

    const heading = cursor.peek(KEY)?.groups;
    const key = heading?.key;
    const op = heading?.op?.trim() as '+' | '-' | undefined;
    const name = key !== undefined ? byKeyword[key] : undefined;
    const labelsBareField = name !== undefined && isPositionalField({ clauses, bare }, name);
    if (key !== undefined && !labelsBareField && (name !== undefined || entries !== undefined)) {
      const keySpan = {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos + (heading!.op?.length ?? 0) + key.length),
      };
      const meantField = name !== undefined ? undefined : typoOf(key, [...Object.keys(byKeyword), ...keywords]);
      cursor.take(KEY);
      cursor.take(/[ \t]*/);
      if (name !== undefined) {
        const held = authored[name];
        if (held !== undefined && (op === undefined || !isFieldEdits(held))) {
          throw new DslError(op === undefined && !isFieldEdits(held) ? `${kind} field ${key} is defined more than once` : `${kind} field ${key} cannot be both replaced and modified in one section`, keySpan);
        }
        if (op !== undefined && !isListParser(fields[name].parser)) throw new DslError(`${kind} field ${key} is not a list, so it cannot take ${op}`, keySpan);

        const inline = !cursor.done;
        const value = inline ? fields[name].parser.parse(cursor) : hasBlock(line) ? parseBlock(fields[name].parser, takeBlock(line), line.span) : undefined;
        if (inline && claimsTheBlock(cursor, line)) throw new DslError(`${kind} field ${key} is written inline and as a block; give it one`, keySpan);
        if (value === undefined) continue;
        if (op === undefined) authored[name] = value;
        else
          ((authored[name] ??= { ops: [] }) as FieldEdits).ops.push({
            op,
            values: value as unknown[],
          });
      } else if (meantField !== undefined) {
        throw new DslError(`unknown ${kind} field: ${key}, one letter from ${meantField}`, keySpan);
      } else if (op === '+') {
        throw new DslError(`a bare ${key}: already adds ${key} when it is not there, so + means nothing here`, keySpan);
      } else if (op === '-') {
        ((authored[entries!.into] ??= []) as object[]).push({
          label: key,
          removed: true,
        });
      } else {
        const inline = !cursor.done;
        const body = inline ? entries!.body.parse(cursor, key) : entries!.body.parseBlock(takeBlock(line), key);
        if (inline && claimsTheBlock(cursor, line)) throw new DslError(`${kind} ${key}: is written inline and as a block; give it one`, keySpan);
        ((authored[entries!.into] ??= []) as object[]).push({
          label: key,
          ...body,
        });
      }
    } else if (labelsBareField) {
      throw new DslError(`${kind} field ${key} must be written bare, without a '${key}:' label`, {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos + key!.length),
      });
    } else if (key !== undefined) {
      throw new DslError(`unknown ${kind} field: ${key}`, {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos + key.length),
      });
    } else {
      const word = cursor.peek(WORD)?.[0];
      if (word !== undefined && keywords.includes(word)) {
        cursor.take(WORD);
        authored[word] = true;
      } else if (clauses !== undefined) {
        const element = (fields[clauses].parser as ListParser<unknown>).element;
        ((authored[clauses] ??= []) as unknown[]).push(element.parse(cursor));
      } else if (bare !== undefined) {
        if (authored[bare] !== undefined)
          throw new DslError(`${kind} ${bare} is defined more than once`, {
            start: cursor.abs(cursor.pos),
            end: cursor.abs(line.text.length),
          });
        authored[bare] = fields[bare].parser.parse(cursor);
      } else {
        throw new DslError(`unexpected content: ${JSON.stringify(cursor.rest())}`, { start: cursor.abs(cursor.pos), end: cursor.abs(line.text.length) });
      }
    }

    cursor.take(/[ \t]*,[ \t]*/);
  }
}

export function hydrateSection<H extends { id: string }, F extends keyof H = never, E extends keyof H = never>(authored: Authored<H>, schema: SectionSchema<H, F, E>, context: HydrateContext = DEFAULT_CONTEXT): H {
  const fields = schema.fields as unknown as AnyFields;
  const read = authored as Record<string, unknown>;
  const view = { id: authored.id } as H;

  for (const key of Object.keys(fields)) {
    let cached: unknown;
    let state: 'unresolved' | 'resolving' | 'resolved' = 'unresolved';
    Object.defineProperty(view, key, {
      enumerable: true,
      get() {
        if (state === 'resolving') throw new DslError(`circular default among ${schema.kind} fields, reached via ${key}`);
        if (state === 'unresolved') {
          state = 'resolving';
          const authoredValue = read[key];
          const hydrate = fields[key].hydrate;
          cached = authoredValue === undefined ? fields[key].default?.(view, context) : hydrate ? hydrate(authoredValue) : authoredValue;
          state = 'resolved';
        }
        return cached;
      },
    });
  }
  for (const keyword of (schema.keywords ?? []) as readonly string[]) {
    Object.defineProperty(view, keyword, {
      enumerable: true,
      value: read[keyword] ?? false,
    });
  }
  if (schema.entries) {
    const into = (schema.entries as EntryConfig).into;
    Object.defineProperty(view, into, {
      enumerable: true,
      value: read[into] ?? [],
    });
  }
  return view;
}

export interface PrintContext {
  moduleId: string;
  id: string;
  authored(field: string): boolean;
}

const keywordOf = (name: string, spec: AnyField): string => spec.keyword ?? name;

export const moduleLocalId = (moduleId: string, id: string): string => (id.startsWith(`${moduleId}.`) ? id.slice(moduleId.length + 1) : id);

function fieldLines(schema: AnySchema, name: string, spec: AnyField, held: Record<string, unknown>, context: PrintContext): string[] {
  const value = held[name];
  if (value === undefined) return [];
  if (spec.generated && !context.authored(name)) return [];

  const parser = spec.parser as Parser<unknown> & Partial<ListParser<unknown>>;
  const positional = isPositionalField(schema, name);
  const label = (text: string): string[] => (positional ? [text] : [`${keywordOf(name, spec)}: ${text}`]);

  const members = Array.isArray(value) ? value : (spec.dehydrate as ((held: unknown) => unknown[]) | undefined)?.(value);
  if (members !== undefined) {
    if (members.length === 0 && spec.printed !== 'always') return [];
    const lines = parser.printBlock!(members);
    if (spec.block) return positional ? lines : [`${keywordOf(name, spec)}:`, ...indentLines(lines)];
    return label(lines.join(', '));
  }

  const printed = parser.print(value);
  if (spec.printed === 'unless-default' && spec.default !== undefined && parser.print(spec.default(held as never, DEFAULT_CONTEXT)) === printed) return [];
  return label(printed);
}

export function printSection(value: object, schema: AnySchema, context: PrintContext, entryLines: (entry: never) => string[]): string[] {
  const held = value as Record<string, unknown>;
  const lines = [`# ${schema.kind} ${moduleLocalId(context.moduleId, context.id)}`];
  for (const [name, spec] of Object.entries(schema.fields)) {
    lines.push(...fieldLines(schema, name, spec, held, context));
    if (name === schema.keywordsAfter) lines.push(...(schema.keywords ?? []).filter((word) => held[word] === true));
  }
  const entries = schema.entries === undefined ? [] : ((held[schema.entries.into] as never[] | undefined) ?? []);
  for (const entry of entries) lines.push(...entryLines(entry));
  return lines;
}
