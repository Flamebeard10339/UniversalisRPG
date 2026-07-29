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

// Item, xp and flag counts stay on the integer-only `number` above.
export const decimal: Parser<number> = {
  parse: (cursor) => {
    const raw = cursor.take(/-?\d+(?:\.\d+)?/);
    if (raw === null) throw new DslError('expected a number', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return Number(raw);
  },
};

export const REFERENCE = /[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*/;

// Every id an author writes is a path into the namespace tree, whether or not
// they shortened it, so the parser that reads one takes the whole path.
export const id: Parser<string> = {
  parse: (cursor) => {
    const raw = cursor.take(REFERENCE);
    if (raw === null) throw new DslError('expected an id', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return raw;
  },
};

// Reads the name off the end of the path: a title says "Miki", never the
// namespace that keeps two Mikis apart.
export const humanize = (id: string): string =>
  (id.split('.').pop() ?? id)
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export interface Quantified {
  item: string;
  amount?: number;
}

export const quantified: Parser<Quantified> = {
  parse(cursor) {
    const amount = cursor.take(/\d+/);
    if (amount !== null) cursor.take(/[ \t]+/);
    const item = id.parse(cursor);
    return amount !== null ? { item, amount: Number(amount) } : { item };
  },
};
