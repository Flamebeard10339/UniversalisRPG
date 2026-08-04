import { Cursor, DslError, Parser, Span } from './parser';
import { Range } from './range';

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

// A quantity that is CONSUMED. One number, because `inputLimit` has to answer
// how many completions an inventory affords, and a range has no answer.
export interface Quantified {
  item: string;
  amount?: number;
}

// A quantity that is PRODUCED, held as the range it was written as so each
// reader decides whether to draw — see `sampleCount` against `serialize`'s
// `range()`, the same fork `sampleStat` and `statValue` already are.
export interface Produced {
  item: string;
  amount?: Range;
}

const COUNT = /\d+/;
export const COUNT_RANGE = /\d+(?:-\d+)?/;
export const DECIMAL_RANGE = /\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?/;

// Unsigned throughout: a produced amount is never negative, and admitting a sign
// would make `-3--1` unreadable against the hyphen that separates the bounds.
// That is why `add:`, the one signed count, keeps a plain integer.
function bounds(cursor: Cursor, pattern: RegExp, what: string): { range: Range; span: Span } {
  const start = cursor.pos;
  const raw = cursor.take(pattern);
  const span = { start: cursor.abs(start), end: cursor.abs(cursor.pos) };
  if (raw === null) throw new DslError(`expected ${what}, as an amount or a range like 4-7`, span);
  const [lo, hi] = raw.split('-');
  const min = Number(lo);
  const max = hi === undefined ? min : Number(hi);
  if (max < min) throw new DslError(`a range must ascend, got ${raw}`, span);
  return { range: { min, max }, span };
}

// A lower bound of zero is the whole point of a range — `0-3` is "sometimes
// nothing". What does nothing is an upper bound of zero, and `0` alone is that
// case rather than a rule of its own.
function refuseZero(range: Range, span: Span, complaint: string): Range {
  if (range.max === 0) throw new DslError(complaint, span);
  return range;
}

// Items and xp are whole; a pool is not, because a rate that rounds to zero
// stops regenerating.
export function countRange(cursor: Cursor, what: string): Range {
  const { range, span } = bounds(cursor, COUNT_RANGE, what);
  return refuseZero(range, span, `${what} of 0 does nothing`);
}

export function decimalRange(cursor: Cursor, what: string): Range {
  const { range, span } = bounds(cursor, DECIMAL_RANGE, what);
  return refuseZero(range, span, `${what} of 0 does nothing`);
}

// A range where only a count belongs reads as an id that will not parse, which
// says nothing about why. Each site that refuses one says which it is.
export function refuseRange(cursor: Cursor, complaint: string): void {
  const start = cursor.pos;
  if (cursor.peek(/-\d/) === null) return;
  cursor.take(/-\d+(?:\.\d+)?/);
  throw new DslError(complaint, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
}

export const quantified: Parser<Quantified> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = cursor.take(COUNT);
    if (raw !== null) refuseRange(cursor, 'this count is consumed, so it takes one number rather than a range — a craft has to know how many completions an inventory affords');
    if (raw !== null) cursor.take(/[ \t]+/);
    const item = id.parse(cursor);
    if (raw === null) return { item };
    // An absent count means one; a written zero is a line that does nothing.
    if (Number(raw) === 0) throw new DslError(`a count of 0 does nothing: ${item}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    return { item, amount: Number(raw) };
  },
};

export const produced: Parser<Produced> = {
  parse(cursor) {
    if (cursor.peek(COUNT_RANGE) === null) return { item: id.parse(cursor) };
    const { range, span } = bounds(cursor, COUNT_RANGE, 'a count');
    cursor.take(/[ \t]+/);
    // The item is read first so the complaint can name it, which is what makes
    // a zero findable in a block of twenty grants.
    const item = id.parse(cursor);
    return { item, amount: refuseZero(range, span, `a count of 0 does nothing: ${item}`) };
  },
};
