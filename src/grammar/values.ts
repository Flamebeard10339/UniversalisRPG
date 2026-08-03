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

export const DECIMAL = /-?\d+(?:\.\d+)?/;

// Item, xp and flag counts stay on the integer-only `number` above.
export const decimal: Parser<number> = {
  parse: (cursor) => {
    const raw = cursor.take(DECIMAL);
    if (raw === null) throw new DslError('expected a number', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return Number(raw);
  },
};

// A flat number, or the id of the stat holding one. What a field takes when the
// same quantity can be authored once or moved live by gear and buffs.
export const numberOrStat: Parser<number | string> = {
  parse(cursor) {
    const raw = cursor.take(DECIMAL);
    return raw === null ? id.parse(cursor) : Number(raw);
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

// Approximate: the written vowel, not the spoken one, so "a unicorn" comes out
// wrong and "an Hay" — which is what a blanket "an" produced — does not.
export const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a');

export interface Quantified {
  item: string;
  amount?: number;
}

export const quantified: Parser<Quantified> = {
  parse(cursor) {
    const amount = cursor.take(/\d+/);
    if (amount !== null) cursor.take(/[ \t]+/);
    const item = id.parse(cursor);
    if (amount === null) return { item };
    // An absent count means one; a written zero is a line that does nothing.
    if (Number(amount) === 0) throw new DslError(`a count of 0 does nothing: ${item}`, { start: cursor.abs(cursor.pos - item.length), end: cursor.abs(cursor.pos) });
    return { item, amount: Number(amount) };
  },
};
