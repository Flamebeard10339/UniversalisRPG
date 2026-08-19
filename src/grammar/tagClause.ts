import { DslError, Parser, Span } from './parser';
import { isRange, Range } from './range';
import { duration } from './values';

// How much a bonus is worth and which channel it lands in. A percent bonus never
// takes a range, so the two are separate members.
export type BonusAmount = { percent: false; amount: Range } | { percent: true; amount: number };

// What a `per` counts: a resource's level, or how many stacks of one buff the
// character is holding. Two live facts about a character, spelled apart because
// no reader could tell a resource id from a buff's by looking at it.
export type Counter = { kind: 'resource'; id: string } | { kind: 'stack'; id: string };

// `per` says which counter scales the magnitude, and sits on the clause rather
// than on BonusAmount because `# skill`'s `per-level:` reads the same magnitude
// and already has its counter — a bonus that named a second one there would be a
// field one of the two readers has to refuse.
export type TagClause = { kind: 'keyword'; value: string } | ({ kind: 'stat-bonus'; statId: string; per?: Counter } & BonusAmount) | { kind: 'duration'; seconds: number };

// One check per member of TagClause, keyed by the union's own discriminant, so
// a fourth member is a type error here rather than a refusal a reader of
// unparsed clauses discovers at run time. A `# save` body is that reader: it is
// hand-written JSON, and nothing between it and a fold parses what it holds.
const CLAUSE_HOLDS: { [K in TagClause['kind']]: (clause: Record<string, unknown>) => boolean } = {
  keyword: (clause) => typeof clause.value === 'string',
  'stat-bonus': (clause) =>
    typeof clause.statId === 'string' &&
    (clause.per === undefined || isCounter(clause.per)) &&
    (clause.percent === true ? typeof clause.amount === 'number' && Number.isFinite(clause.amount) : clause.percent === false && isRange(clause.amount)),
  duration: (clause) => typeof clause.seconds === 'number' && Number.isFinite(clause.seconds),
};

function isCounter(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, id } = value as { kind?: unknown; id?: unknown };
  return (kind === 'resource' || kind === 'stack') && typeof id === 'string';
}

export function isTagClause(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const clause = value as Record<string, unknown>;
  const holds = CLAUSE_HOLDS[clause.kind as TagClause['kind']] as ((clause: Record<string, unknown>) => boolean) | undefined;
  return holds !== undefined && holds(clause);
}

const SECONDS_PER_MINUTE = 60;

const AMOUNT = String.raw`(?<sign>[+-])(?<lo>\d+)(?:-(?<hi>\d+))?(?<percent>%?)`;
const NAME = String.raw`[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*`;

const DURATION = /^(?:(?<minutes>\d+)m)?(?:(?<seconds>\d+)s)?$/;
const STAT_BONUS = new RegExp(`^${AMOUNT}[ \t]+(?<stat>${NAME})(?:[ \t]+per[ \t]+(?:stack[ \t]+of[ \t]+(?<stack>${NAME})|(?<per>${NAME})))?$`);
const BARE_AMOUNT = new RegExp(`^${AMOUNT}$`);
const KEYWORD = /^[a-z][a-z0-9-]*$/;

function parseAmount(groups: Record<string, string | undefined>, raw: string, span: Span): BonusAmount {
  // The sign leads the whole clause: `-3-6 dr` is between -6 and -3.
  const sign = groups.sign === '-' ? -1 : 1;
  const lo = Number(groups.lo);

  if (groups.percent === '%') {
    if (groups.hi !== undefined) throw new DslError(`a percent stat bonus cannot be a range: ${JSON.stringify(raw)}`, span);
    return { percent: true, amount: sign * lo };
  }

  if (groups.hi === undefined) return { percent: false, amount: { min: sign * lo, max: sign * lo } };

  const hi = Number(groups.hi);
  if (hi < lo) throw new DslError(`a stat bonus range must ascend in magnitude, got ${JSON.stringify(raw)}`, span);
  return { percent: false, amount: { min: Math.min(sign * lo, sign * hi), max: Math.max(sign * lo, sign * hi) } };
}

function parseClause(raw: string, span: Span): TagClause {
  const duration = DURATION.exec(raw)?.groups;
  if (duration && (duration.minutes || duration.seconds)) {
    return {
      kind: 'duration',
      seconds: Number(duration.minutes ?? 0) * SECONDS_PER_MINUTE + Number(duration.seconds ?? 0),
    };
  }

  const bonus = STAT_BONUS.exec(raw)?.groups;
  if (bonus) {
    const clause = { kind: 'stat-bonus' as const, statId: bonus.stat!, ...parseAmount(bonus, raw, span) };
    if (bonus.stack !== undefined) return { ...clause, per: { kind: 'stack', id: bonus.stack } };
    return bonus.per === undefined ? clause : { ...clause, per: { kind: 'resource', id: bonus.per } };
  }

  if (KEYWORD.test(raw)) return { kind: 'keyword', value: raw };

  throw new DslError(`unrecognized tag clause: ${JSON.stringify(raw)}`, span);
}

function printAmount(value: BonusAmount): string {
  if (value.percent) return `${value.amount < 0 ? '-' : '+'}${Math.abs(value.amount)}%`;
  const sign = value.amount.min < 0 || value.amount.max < 0 ? '-' : '+';
  const lo = Math.min(Math.abs(value.amount.min), Math.abs(value.amount.max));
  const hi = Math.max(Math.abs(value.amount.min), Math.abs(value.amount.max));
  return lo === hi ? `${sign}${lo}` : `${sign}${lo}-${hi}`;
}

const printCounter = (value: Counter): string => (value.kind === 'stack' ? `stack of ${value.id}` : value.id);

export const tagClause: Parser<TagClause> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = (cursor.take(/[^,\n]+/) ?? '').trim();
    return parseClause(raw, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
  },
  print(value) {
    switch (value.kind) {
      case 'keyword':
        return value.value;
      case 'duration':
        return duration.print(value.seconds);
      case 'stat-bonus':
        return `${printAmount(value)} ${value.statId}${value.per === undefined ? '' : ` per ${printCounter(value.per)}`}`;
      default: {
        const unreached: never = value;
        return unreached;
      }
    }
  },
  examples: ['sharp', '30s', '2m', '1m30s', '+4-7 attack', '-2 defence', '+25% max-health', '-10% max-health', '+1 attack per mana', '+2 attack per stack of fervour'],
};

// The same magnitude without the stat, for a field that names its stat itself.
export const bonusAmount: Parser<BonusAmount> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = (cursor.take(/[^,\n]+/) ?? '').trim();
    const span = { start: cursor.abs(start), end: cursor.abs(cursor.pos) };
    const groups = BARE_AMOUNT.exec(raw)?.groups;
    if (!groups) throw new DslError(`expected a bonus like +1 or +1%, got ${JSON.stringify(raw)}`, span);
    return parseAmount(groups, raw, span);
  },
  print: printAmount,
  examples: ['+1', '-3', '+25%', '-10%', '+4-7', '-3-6'],
};
