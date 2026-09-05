import { Cursor, DslError, Parser } from './parser';
import { DECIMAL, decimal, id, number, REFERENCE } from './values';

export interface Reference {
  path: string[];
}

export const TIME = 'time';
export const PLAYER = 'player';
export const SETTING = 'setting';

interface Rooted {
  kind: string;
  stands: string;
  against?: number;
  means?: string;
}

interface Named {
  stands: string;
}

interface Bare {
  means: string;
  against: number;
}

export const ENGINE_ROOTS = {
  [TIME]: { means: 'seconds of game time this run has taken', against: 30 },
  [PLAYER]: { stands: 'race' },
  [SETTING]: { stands: 'hardcore' },
  xp: { kind: 'skill', stands: 'thieving', against: 4 },
  level: { kind: 'skill', stands: 'mining', against: 2 },
  'highest-level': { means: 'the level of whichever skill stands highest, so a bound on it is a bound on any one skill', against: 2 },
  resource: { kind: 'resource', stands: 'health', against: 10 },
  inventory: { kind: 'item', stands: 'plank', against: 3 },
  count: { kind: 'flag', stands: 'confiscated', against: 1, means: 'how much a bundle holds, all told — a `# variable` marked `bundle`. It is the only reading a bundle answers: what is inside it is moved rather than looked at' },
  stat: { kind: 'stat', stands: 'attack', against: 1.5 },
  us: { kind: 'stat', stands: 'attack', against: 1.5, means: 'a stat of whoever is acting, which is the player wherever no action is under way' },
  them: { kind: 'stat', stands: 'attack', against: 1.5, means: 'a stat of whatever the action under way is aimed at, so a line with no action under way — a dialogue — and one whose action is aimed at a place rather than an entity are both refused as they are said, rather than going quiet' },
  changed: { kind: 'stat', stands: 'attack', means: 'whether that stat stands anywhere other than the base it was declared with, which is how a line asks whether anything has moved it without writing down what it started at' },
} as const satisfies Readonly<Record<string, Rooted | Named | Bare>>;

export type EngineRoot = keyof typeof ENGINE_ROOTS;

export const ENGINE_ROOT_NAMES = Object.keys(ENGINE_ROOTS) as EngineRoot[];

const rooted = (root: EngineRoot): Rooted | Named | Bare => ENGINE_ROOTS[root];

const named = (held: Rooted | Named | Bare): held is Rooted => 'kind' in held;

const bare = (held: Rooted | Named | Bare): held is Bare => 'means' in held;

export const isEngineRoot = (path: readonly string[]): boolean => path.length > 0 && path[0] in ENGINE_ROOTS;

export const rootedKind = (root: string): string | null => {
  if (!(root in ENGINE_ROOTS)) return null;
  const held = rooted(root as EngineRoot);
  return named(held) ? held.kind : null;
};

const ROOTED_LINES = ENGINE_ROOT_NAMES.map((root): { form: string; example: string; note?: string } => {
  const held = rooted(root);
  if (named(held)) {
    if (held.against === undefined) return { form: `${root}.<${held.kind}>`, example: `${root}.${held.stands}`, note: held.means };
    return { form: `${root}.<${held.kind}> <comparison> <float>`, example: `${root}.${held.stands} >= ${held.against}`, note: held.means };
  }
  if (bare(held)) return { form: `${root} <comparison> <float>`, example: `${root} >= ${held.against}`, note: held.means };
  return { form: `${root}.<name>`, example: `${root}.${held.stands}` };
});

export const engineState: Parser<string> = {
  parse: (cursor) => cursor.take(/.+/) ?? '',
  print: (value) => value,
  called: 'engine state',
  forms: ROOTED_LINES.map((line) => line.form),
  examples: ROOTED_LINES.map((line) => line.example),
  notes: Object.fromEntries(ROOTED_LINES.flatMap((line) => (line.note === undefined ? [] : [[line.form, line.note] as const]))),
};

export const VISITS = 'visits';

export const visitedNode = (path: readonly string[]): readonly string[] | null => (path.length > 1 && path[path.length - 1] === VISITS ? path.slice(0, -1) : null);

export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '=' | '!=';

export interface Threshold {
  value: number;
  places: number;
}

const readAt = (value: number, places: number): number => {
  if (places === 0) return value;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

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
  | { kind: 'always' }
  | { kind: 'reference'; reference: Reference };

export const ALWAYS = 'always';

const ALWAYS_WRITTEN = new RegExp(`${ALWAYS}(?![\\w-])`);

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

const COUNTED_ITEM = /\d+[ \t]+[a-z]/;

function parseHas(cursor: Cursor): Condition | null {
  if (cursor.take(/has[ \t]+/) === null && cursor.peek(COUNTED_ITEM) === null) return null;
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
  if (cursor.take(ALWAYS_WRITTEN) !== null) return { kind: 'always' };

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
    case 'always':
      return ALWAYS;
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
  called: 'condition',
  holds: () => ({ comparison, condition, 'engine state': engineState }),
  forms: [
    '<flag>',
    '<flag> <comparison> <float>',
    '<engine state>',
    'has <item>',
    'has <count> <item>',
    ALWAYS,
    'not <condition>',
    '<condition> and <condition>',
    '<condition> or <condition>',
  ],
  examples: [
    'has-key',
    'quest.stage >= 2',
    ROOTED_LINES[0]!.example,
    'has plank',
    'has 3 plank',
    ALWAYS,
    'not has-key',
    'has-key and not has-rope',
    'has-key or has-rope',
    'a and b or c',
  ],
  notes: {
    'has <count> <item>': 'the `has` may be left off — a condition opening on a count and an item is read as this — and either way it prints back with the `has` written in',
    [ALWAYS]: `holds whatever the state of the world is, so \`not ${ALWAYS}\` is a line that never holds, which is how a body is shut off outright rather than by a flag nothing sets`,
  },
};
