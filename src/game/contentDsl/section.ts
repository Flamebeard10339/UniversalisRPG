import { Codec, Cursor, DslError, Span } from './codec';
import { ListCodec } from './list';
import { RawLine, RawSection } from './structure';

export interface Field<T, Self> {
  codec: Codec<NonNullable<T>>;
  default?: (self: Self) => T;
}

export interface SectionSchema<H extends { id: string }, Flags extends keyof H = never> {
  kind: string;
  fields: { [K in Exclude<keyof H, 'id' | Flags>]: Field<H[K], H> };
  clauses?: Exclude<keyof H, 'id' | Flags>;
  flags?: readonly Flags[];
}

export type Authored<H extends { id: string }> = { id: string } & Partial<Omit<H, 'id'>>;

type AnyFields = Record<string, { codec: Codec<unknown>; default?: (self: unknown) => unknown }>;

const KEY = /(?<key>[a-z][a-z0-9-]*):/;
const WORD = /[a-z][a-z0-9-]*/;

function parseBlock(codec: Codec<unknown>, children: RawLine[], span: Span): unknown {
  if (!('parseBlock' in codec)) throw new DslError('this field cannot be written as a block', span);
  return (codec as ListCodec<unknown>).parseBlock(children);
}

export function parseSection<H extends { id: string }, F extends keyof H = never>(section: RawSection, schema: SectionSchema<H, F>): Authored<H> {
  if (section.kind !== schema.kind) throw new DslError(`expected # ${schema.kind}, got # ${section.kind}`, section.span);
  if (!section.id) throw new DslError(`# ${schema.kind} requires an id`, section.span);

  const fields = schema.fields as unknown as AnyFields;
  const flags = (schema.flags ?? []) as readonly string[];
  const clauses = schema.clauses as string | undefined;
  const authored: Record<string, unknown> = { id: section.id };
  for (const line of section.body) parseLine(line, fields, flags, clauses, schema.kind, authored);
  return authored as Authored<H>;
}

function parseLine(line: RawLine, fields: AnyFields, flags: readonly string[], clauses: string | undefined, kind: string, authored: Record<string, unknown>): void {
  const cursor = new Cursor(line.text, 0, line.span.start);

  while (!cursor.done) {
    cursor.take(/[ \t]*/);
    if (cursor.done) break;

    const key = cursor.peek(KEY)?.groups?.key;
    if (key !== undefined) {
      if (key === clauses || !fields[key]) throw new DslError(`unknown ${kind} field: ${key}`, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos + key.length) });
      cursor.take(KEY);
      cursor.take(/[ \t]*/);
      const codec = fields[key].codec;
      authored[key] = cursor.done ? parseBlock(codec, line.children, line.span) : codec.parse(cursor);
    } else {
      const word = cursor.peek(WORD)?.[0];
      if (word !== undefined && flags.includes(word)) {
        cursor.take(WORD);
        authored[word] = true;
      } else if (clauses !== undefined) {
        const element = (fields[clauses].codec as ListCodec<unknown>).element;
        ((authored[clauses] ??= []) as unknown[]).push(element.parse(cursor));
      } else {
        throw new DslError(`unexpected content: ${JSON.stringify(cursor.rest())}`, { start: cursor.abs(cursor.pos), end: cursor.abs(line.text.length) });
      }
    }

    cursor.take(/[ \t]*,[ \t]*/);
  }
}

export function printSection<H extends { id: string }, F extends keyof H = never>(authored: Authored<H>, schema: SectionSchema<H, F>): string {
  const fields = schema.fields as unknown as AnyFields;
  const read = authored as Record<string, unknown>;
  const lines = [`# ${schema.kind} ${authored.id}`];

  for (const key of Object.keys(fields)) {
    const value = read[key];
    if (value === undefined) continue;
    if (key === schema.clauses) {
      if ((value as unknown[]).length > 0) lines.push(fields[key].codec.print(value));
    } else {
      lines.push(`${key}: ${fields[key].codec.print(value)}`);
    }
  }
  for (const flag of (schema.flags ?? []) as readonly string[]) {
    if (read[flag] === true) lines.push(flag);
  }
  return lines.join('\n');
}

export function hydrateSection<H extends { id: string }, F extends keyof H = never>(authored: Authored<H>, schema: SectionSchema<H, F>): H {
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
  return view;
}
