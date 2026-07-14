import { Codec, DslError } from './codec';

export const text: Codec<string> = {
  parse: (cursor) => cursor.take(/[^\n]*/) ?? '',
  print: (value) => value,
};

export const number: Codec<number> = {
  parse: (cursor) => {
    const raw = cursor.take(/-?\d+/);
    if (raw === null) throw new DslError('expected a number', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return Number(raw);
  },
  print: (value) => String(value),
};

export const id: Codec<string> = {
  parse: (cursor) => {
    const raw = cursor.take(/[a-z][a-z0-9-]*/);
    if (raw === null) throw new DslError('expected an id', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return raw;
  },
  print: (value) => value,
};

export const humanize = (id: string): string =>
  id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
