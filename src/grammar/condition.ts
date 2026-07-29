import { Cursor, DslError, Parser } from './parser';
import { id, number, REFERENCE } from './values';

export interface Reference {
  path: string[];
}

// State the engine keeps rather than any module: the clock, the player sheet,
// and the per-node visit counters. No module declares one, so nothing resolves
// one either, and the runtime reads them off state instead of off flags.
export const TIME = 'time';
export const PLAYER = 'player';
export const VISITS = 'visits';

const ENGINE_ROOTS: readonly string[] = [TIME, PLAYER];
const ENGINE_MEMBERS: readonly string[] = [VISITS];

export const isEngineReference = (path: readonly string[]): boolean => ENGINE_ROOTS.includes(path[0]) || ENGINE_MEMBERS.includes(path[path.length - 1]);

export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '=';

export type Condition =
  | { kind: 'and'; conditions: Condition[] }
  | { kind: 'or'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition }
  | { kind: 'comparison'; left: Reference; operator: ComparisonOperator; right: number }
  | { kind: 'has'; item: string; count: number }
  | { kind: 'reference'; reference: Reference };

const COMPARISON = /[ \t]*(>=|<=|>|<|=)[ \t]*/;

function parseReference(cursor: Cursor): Reference {
  const raw = cursor.take(REFERENCE);
  if (raw === null) throw new DslError('expected a reference', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
  return { path: raw.split('.') };
}

// `has <item>` / `has <n> <item>` must be checked before parseReference: a
// hyphenated item id like `has-shrimp` is itself a valid reference, so only a
// `has` followed by whitespace is treated as this predicate.
function parseHas(cursor: Cursor): Condition | null {
  if (cursor.take(/has[ \t]+/) === null) return null;
  const hasCount = cursor.peek(/\d/) !== null;
  const count = hasCount ? number.parse(cursor) : 1;
  if (hasCount) cursor.take(/[ \t]+/);
  const item = id.parse(cursor);
  return { kind: 'has', item, count };
}

function parsePrimary(cursor: Cursor): Condition {
  const has = parseHas(cursor);
  if (has !== null) return has;

  const reference = parseReference(cursor);
  const comparison = cursor.take(COMPARISON);
  if (comparison !== null) {
    return { kind: 'comparison', left: reference, operator: comparison.trim() as ComparisonOperator, right: number.parse(cursor) };
  }
  return { kind: 'reference', reference };
}

function parseNot(cursor: Cursor): Condition {
  if (cursor.take(/not[ \t]+/) !== null) return { kind: 'not', condition: parseNot(cursor) };
  return parsePrimary(cursor);
}

function parseAnd(cursor: Cursor): Condition {
  const conditions = [parseNot(cursor)];
  while (cursor.take(/[ \t]+and[ \t]+/) !== null) conditions.push(parseNot(cursor));
  return conditions.length === 1 ? conditions[0] : { kind: 'and', conditions };
}

function parseOr(cursor: Cursor): Condition {
  const conditions = [parseAnd(cursor)];
  while (cursor.take(/[ \t]+or[ \t]+/) !== null) conditions.push(parseAnd(cursor));
  return conditions.length === 1 ? conditions[0] : { kind: 'or', conditions };
}

export const condition: Parser<Condition> = {
  parse: parseOr,
};
