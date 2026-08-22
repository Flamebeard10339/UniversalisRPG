import { Cursor, DslError, Parser } from './parser';
import { id, number, REFERENCE } from './values';

export interface Reference {
  path: string[];
}

export const TIME = 'time';
export const PLAYER = 'player';

// What the engine holds itself, rather than a flag an author declares. A root paired with a kind reads the rest of the path as an id of that kind, so `xp.thieving` is the writing module's own skill and a name nothing declares is refused where it is written.
export const ENGINE_ROOTS = {
  [TIME]: null,
  [PLAYER]: null,
  xp: 'skill',
  resource: 'resource',
  inventory: 'item',
} as const satisfies Readonly<Record<string, string | null>>;

export type EngineRoot = keyof typeof ENGINE_ROOTS;

export const ENGINE_ROOT_NAMES = Object.keys(ENGINE_ROOTS) as EngineRoot[];

export const isEngineRoot = (path: readonly string[]): boolean => path.length > 0 && path[0] in ENGINE_ROOTS;

export const rootedKind = (root: string): string | null => (root in ENGINE_ROOTS ? ENGINE_ROOTS[root as EngineRoot] : null);

export const VISITS = 'visits';

export const visitedNode = (path: readonly string[]): readonly string[] | null => (path.length > 1 && path[path.length - 1] === VISITS ? path.slice(0, -1) : null);

export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '=' | '!=';

export type Condition =
  | { kind: 'and'; conditions: Condition[] }
  | { kind: 'or'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition }
  | {
      kind: 'comparison';
      left: Reference;
      operator: ComparisonOperator;
      right: number;
    }
  | { kind: 'has'; item: string; count: number }
  | { kind: 'reference'; reference: Reference };

const COMPARISON = /[ \t]*(>=|<=|!=|>|<|=)[ \t]*/;

function parseReference(cursor: Cursor): Reference {
  const raw = cursor.take(REFERENCE);
  if (raw === null)
    throw new DslError('expected a reference', {
      start: cursor.abs(cursor.pos),
      end: cursor.abs(cursor.pos),
    });
  return { path: raw.split('.') };
}

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
    return {
      kind: 'comparison',
      left: reference,
      operator: comparison.trim() as ComparisonOperator,
      right: number.parse(cursor),
    };
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

export const printReference = (value: Reference): string => value.path.join('.');

function printCondition(value: Condition): string {
  switch (value.kind) {
    case 'reference':
      return printReference(value.reference);
    case 'comparison':
      return `${printReference(value.left)} ${value.operator} ${number.print(value.right)}`;
    case 'has':
      return value.count === 1 ? `has ${value.item}` : `has ${number.print(value.count)} ${value.item}`;
    case 'not':
      return `not ${printCondition(value.condition)}`;
    case 'and':
    case 'or':
      return value.conditions.map(printCondition).join(` ${value.kind} `);
    default: {
      const unreached: never = value;
      return unreached;
    }
  }
}

// The operators are a closed set of words, and a set of words is a parser like any other, so what an author is shown is the set the engine reads.
export const comparison: Parser<ComparisonOperator> = {
  parse(cursor) {
    const raw = cursor.take(/>=|<=|!=|>|<|=/);
    if (raw === null) throw new DslError('expected a comparison', { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos) });
    return raw as ComparisonOperator;
  },
  print: (value) => value,
  forms: ['>', '>=', '=', '!=', '<=', '<'],
  examples: ['>', '>=', '=', '!=', '<=', '<'],
};

export const condition: Parser<Condition> = {
  parse: parseOr,
  print: printCondition,
  holds: () => ({ comparison, condition }),
  forms: [
    '<flag>',
    '<flag> <comparison> <number>',
    'xp.<skill> <comparison> <number>',
    'resource.<resource> <comparison> <number>',
    'inventory.<item> <comparison> <number>',
    'has <item>',
    'has <count> <item>',
    'not <condition>',
    '<condition> and <condition>',
    '<condition> or <condition>',
  ],
  examples: [
    'has-key',
    'quest.stage >= 2',
    'xp.thieving >= 4',
    'resource.health < 10',
    'inventory.plank = 3',
    'has plank',
    'has 3 plank',
    'not has-key',
    'has-key and not has-rope',
    'has-key or has-rope',
    'a and b or c',
  ],
};
