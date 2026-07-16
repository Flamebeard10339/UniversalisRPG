import { Cursor, DslError, Parser } from './parser';
import { number, REFERENCE } from './values';

export interface Reference {
  path: string[];
}

export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '=';

export type Condition =
  | { kind: 'and'; conditions: Condition[] }
  | { kind: 'or'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition }
  | { kind: 'comparison'; left: Reference; operator: ComparisonOperator; right: number }
  | { kind: 'reference'; reference: Reference };

const COMPARISON = /[ \t]*(>=|<=|>|<|=)[ \t]*/;

function parseReference(cursor: Cursor): Reference {
  const raw = cursor.take(REFERENCE);
  if (raw === null) throw new DslError('expected a reference', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
  return { path: raw.split('.') };
}

function parsePrimary(cursor: Cursor): Condition {
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
