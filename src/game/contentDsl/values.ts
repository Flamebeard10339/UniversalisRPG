import { DslError, Parser } from './parser';

export const text: Parser<string> = {
  parse: (cursor) => cursor.take(/[^\n]*/) ?? '',
};

export const number: Parser<number> = {
  parse: (cursor) => {
    const raw = cursor.take(/-?\d+/);
    if (raw === null) throw new DslError('expected a number', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return Number(raw);
  },
};

export const id: Parser<string> = {
  parse: (cursor) => {
    const raw = cursor.take(/[a-z][a-z0-9-]*/);
    if (raw === null) throw new DslError('expected an id', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return raw;
  },
};

// A dotted state path: `bridge-open`, `front-door.unlocked`, `quest.x.accepted`.
export const REFERENCE = /[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*/;

export const humanize = (id: string): string =>
  id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
