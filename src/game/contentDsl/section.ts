// Generic engine: field value-types are erased internally via the AnyFields casts; the rejected alternative was a hand-written parser per section kind.
import { Cursor, DslError, Parser, Span } from './parser';
import { ListParser } from './list';
import { RawLine, RawSection } from './structure';

export interface Field<T, Self> {
  parser: Parser<NonNullable<T>>;
  default?: (self: Self) => T;
}

// An open-ended, dynamically-labelled collection (e.g. an entity's actions):
// each `<label>:` that is not a fixed field becomes one entry `{ label, ...body }`.
export interface EntryBody {
  parse(cursor: Cursor): object;
  parseBlock(lines: RawLine[]): object;
}

export interface SectionSchema<H extends { id: string }, Flags extends keyof H = never, Entries extends keyof H = never> {
  kind: string;
  fields: { [K in Exclude<keyof H, 'id' | Flags | Entries>]: Field<H[K], H> };
  clauses?: Exclude<keyof H, 'id' | Flags | Entries>;
  bare?: Exclude<keyof H, 'id' | Flags | Entries>;
  flags?: readonly Flags[];
  entries?: { into: Entries; body: EntryBody };
  exclusive?: readonly (readonly Exclude<keyof H, 'id' | Flags | Entries>[])[];
}

export type Authored<H extends { id: string }> = { id: string } & Partial<Omit<H, 'id'>>;

type AnyFields = Record<string, { parser: Parser<unknown>; default?: (self: unknown) => unknown }>;
type EntryConfig = { into: string; body: EntryBody };

const KEY = /(?<key>[a-z][a-z0-9 -]*?):/;
const WORD = /[a-z][a-z0-9-]*/;

function parseBlock(parser: Parser<unknown>, children: RawLine[], span: Span): unknown {
  if (!('parseBlock' in parser)) throw new DslError('this field cannot be written as a block', span);
  return (parser as ListParser<unknown>).parseBlock(children);
}

export function parseSection<H extends { id: string }, F extends keyof H = never, E extends keyof H = never>(section: RawSection, schema: SectionSchema<H, F, E>): Authored<H> {
  if (section.kind !== schema.kind) throw new DslError(`expected # ${schema.kind}, got # ${section.kind}`, section.span);
  if (!section.id) throw new DslError(`# ${schema.kind} requires an id`, section.span);

  const fields = schema.fields as unknown as AnyFields;
  const flags = (schema.flags ?? []) as readonly string[];
  const clauses = schema.clauses as string | undefined;
  const bare = schema.bare as string | undefined;
  const entries = schema.entries as EntryConfig | undefined;
  const authored: Record<string, unknown> = { id: section.id };
  for (const line of section.body) parseLine(line, fields, flags, clauses, bare, entries, schema.kind, authored);

  if (schema.exclusive) {
    const active = schema.exclusive.filter((group) => (group as readonly string[]).some((key) => authored[key] !== undefined));
    if (active.length > 1) {
      const names = active.flat().filter((key) => authored[key as string] !== undefined);
      throw new DslError(`# ${schema.kind} ${section.id}: ${names.join(' and ')} cannot both be set`, section.span);
    }
  }
  return authored as Authored<H>;
}

function parseLine(line: RawLine, fields: AnyFields, flags: readonly string[], clauses: string | undefined, bare: string | undefined, entries: EntryConfig | undefined, kind: string, authored: Record<string, unknown>): void {
  const cursor = new Cursor(line.text, 0, line.span.start);

  while (!cursor.done) {
    cursor.take(/[ \t]*/);
    if (cursor.done) break;

    const key = cursor.peek(KEY)?.groups?.key;
    if (key !== undefined && key !== clauses && key !== bare && (fields[key] || entries !== undefined)) {
      const keySpan = { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos + key.length) };
      cursor.take(KEY);
      cursor.take(/[ \t]*/);
      if (fields[key]) {
        if (authored[key] !== undefined) throw new DslError(`${kind} field ${key} is defined more than once`, keySpan);
        if (!cursor.done) authored[key] = fields[key].parser.parse(cursor);
        else if (line.children.length > 0) authored[key] = parseBlock(fields[key].parser, line.children, line.span);
        // an empty value with no block is unspecified: leave the field absent
      } else {
        const body = cursor.done ? entries!.body.parseBlock(line.children) : entries!.body.parse(cursor);
        ((authored[entries!.into] ??= []) as object[]).push({ label: key, ...body });
      }
    } else if (key !== undefined && key !== clauses && key !== bare) {
      throw new DslError(`unknown ${kind} field: ${key}`, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos + key.length) });
    } else {
      const word = cursor.peek(WORD)?.[0];
      if (word !== undefined && flags.includes(word)) {
        cursor.take(WORD);
        authored[word] = true;
      } else if (clauses !== undefined) {
        const element = (fields[clauses].parser as ListParser<unknown>).element;
        ((authored[clauses] ??= []) as unknown[]).push(element.parse(cursor));
      } else if (bare !== undefined) {
        if (authored[bare] !== undefined) throw new DslError(`${kind} ${bare} is defined more than once`, { start: cursor.abs(cursor.pos), end: cursor.abs(line.text.length) });
        authored[bare] = fields[bare].parser.parse(cursor);
      } else {
        throw new DslError(`unexpected content: ${JSON.stringify(cursor.rest())}`, { start: cursor.abs(cursor.pos), end: cursor.abs(line.text.length) });
      }
    }

    cursor.take(/[ \t]*,[ \t]*/);
  }
}

export function hydrateSection<H extends { id: string }, F extends keyof H = never, E extends keyof H = never>(authored: Authored<H>, schema: SectionSchema<H, F, E>): H {
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
          cached = read[key] ?? fields[key].default?.(view);
          state = 'resolved';
        }
        return cached;
      },
    });
  }
  for (const flag of (schema.flags ?? []) as readonly string[]) {
    Object.defineProperty(view, flag, { enumerable: true, value: read[flag] ?? false });
  }
  if (schema.entries) {
    const into = (schema.entries as EntryConfig).into;
    Object.defineProperty(view, into, { enumerable: true, value: read[into] ?? [] });
  }
  return view;
}
