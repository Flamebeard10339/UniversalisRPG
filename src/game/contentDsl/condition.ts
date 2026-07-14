import { Codec, Cursor, DslError } from './codec';
import { number } from './values';

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

const REFERENCE = /[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*/;
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

function printReference(reference: Reference): string {
  return reference.path.join('.');
}

function printCondition(node: Condition): string {
  switch (node.kind) {
    case 'reference':
      return printReference(node.reference);
    case 'comparison':
      return `${printReference(node.left)}${node.operator}${node.right}`;
    case 'not':
      return `not ${printCondition(node.condition)}`;
    case 'and':
      return node.conditions.map(printCondition).join(' and ');
    case 'or':
      return node.conditions.map(printCondition).join(' or ');
  }
}

export const condition: Codec<Condition> = {
  parse: parseOr,
  print: printCondition,
};
