import { Cursor, DslError, Parser, Span } from './parser';
import { range, Range } from './range';
import { DEFAULT_LANGUAGE } from './section';

export function refuseRange(cursor: Cursor, complaint: string): void {
  const start = cursor.pos;
  if (cursor.peek(/-\d/) === null) return;
  cursor.take(/-\d+(?:\.\d+)?/);
  throw new DslError(complaint, {
    start: cursor.abs(start),
    end: cursor.abs(cursor.pos),
  });
}

export const text: Parser<string> = {
  parse: (cursor) => cursor.take(/[^\n]*/) ?? '',
  print: (value) => value,
  forms: ['<text>'],
  examples: ['Rusty Sword', 'a line that runs to the end'],
};

const THRESHOLD = 'this number is a threshold, not a quantity, so it takes one value rather than a range';

export const number: Parser<number> = {
  parse: (cursor) => {
    const raw = cursor.take(/-?\d+/);
    if (raw === null)
      throw new DslError('expected a number', {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });
    refuseRange(cursor, THRESHOLD);
    return Number(raw);
  },
  print: (value) => String(value),
  forms: ['<number>'],
  examples: ['0', '5', '-3'],
};

export const DECIMAL = /-?\d+(?:\.\d+)?/;

export const decimal: Parser<number> = {
  parse: (cursor) => {
    const raw = cursor.take(DECIMAL);
    if (raw === null)
      throw new DslError('expected a number', {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });
    refuseRange(cursor, THRESHOLD);
    return Number(raw);
  },
  print: (value) => String(value),
  forms: ['<number>'],
  examples: ['0', '5', '1.5', '-2.25'],
};

export const numberOrStat: Parser<number | string> = {
  parse(cursor) {
    const raw = cursor.take(DECIMAL);
    return raw === null ? id.parse(cursor) : Number(raw);
  },
  print: (value) => (typeof value === 'string' ? value : String(value)),
  names: { number: 'stat' },
  forms: ['<number>', '<stat>'],
  examples: ['3', '1.5', 'attack-speed'],
};

const SECONDS_PER_MINUTE = 60;
const DURATION = /(?:(?<minutes>\d+)m)?(?:(?<seconds>\d+)s)?/;

export const duration: Parser<number> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = cursor.take(DURATION);
    const groups = raw === null ? undefined : DURATION.exec(raw)?.groups;
    const total = Number(groups?.minutes ?? 0) * SECONDS_PER_MINUTE + Number(groups?.seconds ?? 0);
    if (total <= 0)
      throw new DslError('expected a duration, as in 30s, 2m or 1m30s', {
        start: cursor.abs(start),
        end: cursor.abs(cursor.pos),
      });
    return total;
  },
  print(seconds) {
    if (seconds % SECONDS_PER_MINUTE === 0) return `${seconds / SECONDS_PER_MINUTE}m`;
    const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
    const left = seconds - minutes * SECONDS_PER_MINUTE;
    return minutes > 0 ? `${minutes}m${left}s` : `${left}s`;
  },
  forms: ['<seconds>s', '<minutes>m', '<minutes>m<seconds>s'],
  examples: ['30s', '2m', '1m30s'],
};

export const REFERENCE = /[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*/;

export const id: Parser<string> = {
  parse: (cursor) => {
    const raw = cursor.take(REFERENCE);
    if (raw === null)
      throw new DslError('expected an id', {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });
    return raw;
  },
  print: (value) => value,
  forms: ['<id>'],
  examples: ['rusty-sword', 'forest.clearing'],
};

// How long something lasts, either counted out on the line or read off a stat when the line runs: a
// stat standing here is read in seconds, so a stretch that is shorter for one player than another is
// a number they carry rather than a second shape of the thing that grants it.
export const durationOrStat: Parser<number | string> = {
  called: 'duration',
  parse: (cursor) => (cursor.peek(/\d/) === null ? id.parse(cursor) : duration.parse(cursor)),
  print: (value) => (typeof value === 'string' ? value : duration.print(value)),
  forms: [...duration.forms, '<stat>'],
  examples: [...duration.examples, 'daze-length'],
};

export const lastSegment = (id: string): string => id.split('.').pop() ?? id;

// The one place a word is cased for a player to read. An address is written either way an
// author is allowed to write one — a hyphenated id or a spaced entry label — so both separate
// words here, which also makes this its own fixed point: humanizing what it returned returns it.
export const humanizeEn = (id: string): string =>
  lastSegment(id)
    .split(/[\s-]+/)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// The whole of what the engine does when it has to put a name in front of a player and nobody
// wrote one. Casing is English, so a world playing in another language is given the plain last
// segment rather than words cased by the wrong rules.
export const mintedName = (id: string, language: string): string => (language === DEFAULT_LANGUAGE ? humanizeEn(id) : lastSegment(id));

export interface Quantified {
  item: string;
  amount?: number;
}

export interface Produced {
  item: string;
  amount?: Range;
}

const COUNT = /\d+/;
export const COUNT_RANGE = /\d+(?:-\d+)?/;
export const DECIMAL_RANGE = /\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?/;

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

function refuseZero(range: Range, span: Span, complaint: string): Range {
  if (range.max === 0) throw new DslError(complaint, span);
  return range;
}

export function countRange(cursor: Cursor, what: string): Range {
  const { range, span } = bounds(cursor, COUNT_RANGE, what);
  return refuseZero(range, span, `${what} of 0 does nothing`);
}

export function decimalRange(cursor: Cursor, what: string): Range {
  const { range, span } = bounds(cursor, DECIMAL_RANGE, what);
  return refuseZero(range, span, `${what} of 0 does nothing`);
}

export const quantified: Parser<Quantified> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = cursor.take(COUNT);
    if (raw !== null) refuseRange(cursor, 'this count is consumed, so it takes one number rather than a range — a craft has to know how many completions an inventory affords');
    if (raw !== null) cursor.take(/[ \t]+/);
    const item = id.parse(cursor);
    if (raw === null) return { item };
    if (Number(raw) === 0)
      throw new DslError(`a count of 0 does nothing: ${item}`, {
        start: cursor.abs(start),
        end: cursor.abs(cursor.pos),
      });
    return { item, amount: Number(raw) };
  },
  print: (value) => (value.amount === undefined ? value.item : `${number.print(value.amount)} ${id.print(value.item)}`),
  forms: ['<item>', '<count> <item>'],
  examples: ['plank', '3 plank'],
};

export const produced: Parser<Produced> = {
  parse(cursor) {
    if (cursor.peek(COUNT_RANGE) === null) return { item: id.parse(cursor) };
    const { range, span } = bounds(cursor, COUNT_RANGE, 'a count');
    cursor.take(/[ \t]+/);
    const item = id.parse(cursor);
    return {
      item,
      amount: refuseZero(range, span, `a count of 0 does nothing: ${item}`),
    };
  },
  print: (value) => (value.amount === undefined ? value.item : `${range.print(value.amount)} ${id.print(value.item)}`),
  forms: ['<item>', '<count> <item>', '<least>-<most> <item>'],
  examples: ['arrow', '5 arrow', '5-10 arrow'],
};

// What a `{…}` a call site fills looks like. Exported because the runtime substitutes into the same shape, and two readings of it would drift the moment either widened.
export const PARAM = /\{([a-z][a-z0-9-]*)\}/g;

// The parameters a pattern names, in the order it names them. A `{…}` is filled by whatever hands the pattern over, so a string nothing hands over names nothing it will get.
export const parametersOf = (pattern: string): string[] => [...pattern.matchAll(PARAM)].map((match) => match[1]!);
