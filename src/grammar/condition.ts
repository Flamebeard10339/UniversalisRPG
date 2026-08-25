import { Cursor, DslError, Parser } from './parser';
import { DECIMAL, decimal, id, number, REFERENCE } from './values';

export interface Reference {
  path: string[];
}

export const TIME = 'time';
export const PLAYER = 'player';
export const SETTING = 'setting';

// A root the engine holds itself, in one of the two shapes it can take: one that names a kind reads the rest of the path as an id of that kind and is weighed against a number, and one that only stands for something reads a name of its own and is read as it is. Either way the one line standing for it wherever the shapes are shown is derived from it.
interface Rooted {
  kind: string;
  stands: string;
  against: number;
}

interface Named {
  stands: string;
}

// What the engine holds itself, rather than a flag an author declares. A root paired with a kind reads the rest of the path as an id of that kind, so `xp.thieving` is the writing module's own skill and a name nothing declares is refused where it is written.
export const ENGINE_ROOTS = {
  [TIME]: null,
  [PLAYER]: { stands: 'race' },
  [SETTING]: { stands: 'hardcore' },
  xp: { kind: 'skill', stands: 'thieving', against: 4 },
  level: { kind: 'skill', stands: 'mining', against: 2 },
  resource: { kind: 'resource', stands: 'health', against: 10 },
  inventory: { kind: 'item', stands: 'plank', against: 3 },
  stat: { kind: 'stat', stands: 'attack', against: 1.5 },
} as const satisfies Readonly<Record<string, Rooted | Named | null>>;

export type EngineRoot = keyof typeof ENGINE_ROOTS;

export const ENGINE_ROOT_NAMES = Object.keys(ENGINE_ROOTS) as EngineRoot[];

const rooted = (root: EngineRoot): Rooted | Named | null => ENGINE_ROOTS[root];

const named = (held: Rooted | Named | null): held is Rooted => held !== null && 'kind' in held;

export const isEngineRoot = (path: readonly string[]): boolean => path.length > 0 && path[0] in ENGINE_ROOTS;

export const rootedKind = (root: string): string | null => {
  const held = root in ENGINE_ROOTS ? rooted(root as EngineRoot) : null;
  return named(held) ? held.kind : null;
};

// The shapes an author is shown for the roots are the roots themselves, so one added above reaches the page with no second list to remember.
const ROOTED_LINES = ENGINE_ROOT_NAMES.flatMap((root) => {
  const held = rooted(root);
  if (held === null) return [];
  if (!named(held)) return [{ form: `${root}.<name>`, example: `${root}.${held.stands}` }];
  return [{ form: `${root}.<${held.kind}> <comparison> <number>`, example: `${root}.${held.stands} >= ${held.against}` }];
});

export const VISITS = 'visits';

export const visitedNode = (path: readonly string[]): readonly string[] | null => (path.length > 1 && path[path.length - 1] === VISITS ? path.slice(0, -1) : null);

export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '=' | '!=';

// A figure an author wrote, and how many decimals they wrote it to.
export interface Threshold {
  value: number;
  places: number;
}

const readAt = (value: number, places: number): number => {
  if (places === 0) return value;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

// An author's literal declares the precision it is compared at, so the figure their own arithmetic
// gives is one they can write: the engine's answer is read to as many decimals as the literal has
// and then weighed by the operator as written, which leaves `<`, `=` and `>` still dividing the
// line between them. A whole number writes no decimals and is weighed as it stands.
export function holds(value: number, operator: ComparisonOperator, right: Threshold): boolean {
  const at = readAt(value, right.places);
  switch (operator) {
    case '>':
      return at > right.value;
    case '<':
      return at < right.value;
    case '>=':
      return at >= right.value;
    case '<=':
      return at <= right.value;
    case '=':
      return at === right.value;
    case '!=':
      return at !== right.value;
    default: {
      const unreached: never = operator;
      return unreached;
    }
  }
}

export type Condition =
  | { kind: 'and'; conditions: Condition[] }
  | { kind: 'or'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition }
  | {
      kind: 'comparison';
      left: Reference;
      operator: ComparisonOperator;
      right: Threshold;
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

function parseThreshold(cursor: Cursor): Threshold {
  const written = cursor.peek(DECIMAL)?.[0] ?? '';
  const value = decimal.parse(cursor);
  return { value, places: written.split('.')[1]?.length ?? 0 };
}

export const printThreshold = (value: Threshold): string => value.value.toFixed(value.places);

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
      right: parseThreshold(cursor),
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

export function printCondition(value: Condition): string {
  switch (value.kind) {
    case 'reference':
      return printReference(value.reference);
    case 'comparison':
      return `${printReference(value.left)} ${value.operator} ${printThreshold(value.right)}`;
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
    ...ROOTED_LINES.map((line) => line.form),
    'has <item>',
    'has <count> <item>',
    'not <condition>',
    '<condition> and <condition>',
    '<condition> or <condition>',
  ],
  examples: [
    'has-key',
    'quest.stage >= 2',
    ...ROOTED_LINES.map((line) => line.example),
    'has plank',
    'has 3 plank',
    'not has-key',
    'has-key and not has-rope',
    'has-key or has-rope',
    'a and b or c',
  ],
};
