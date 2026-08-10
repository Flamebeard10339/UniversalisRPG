import { DslError, Parser, Span } from './parser';
import { Range } from './range';

// How much a bonus is worth and which channel it lands in. A percent bonus never
// takes a range, so the two are separate members.
export type BonusAmount = { percent: false; amount: Range } | { percent: true; amount: number };

// `per` says which counter scales the magnitude, and sits on the clause rather
// than on BonusAmount because `# skill`'s `per-level:` reads the same magnitude
// and already has its counter — a bonus that named a second one there would be a
// field one of the two readers has to refuse.
export type TagClause = { kind: 'keyword'; value: string } | ({ kind: 'stat-bonus'; statId: string; per?: string } & BonusAmount) | { kind: 'duration'; seconds: number };

const SECONDS_PER_MINUTE = 60;

const AMOUNT = String.raw`(?<sign>[+-])(?<lo>\d+)(?:-(?<hi>\d+))?(?<percent>%?)`;
const NAME = String.raw`[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*`;

const DURATION = /^(?:(?<minutes>\d+)m)?(?:(?<seconds>\d+)s)?$/;
const STAT_BONUS = new RegExp(`^${AMOUNT}[ \\t]+(?<stat>${NAME})(?:[ \\t]+per[ \\t]+(?<per>${NAME}))?$`);
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
    return bonus.per === undefined ? clause : { ...clause, per: bonus.per };
  }

  if (KEYWORD.test(raw)) return { kind: 'keyword', value: raw };

  throw new DslError(`unrecognized tag clause: ${JSON.stringify(raw)}`, span);
}

export const tagClause: Parser<TagClause> = {
  parse(cursor) {
    const start = cursor.pos;
    const raw = (cursor.take(/[^,\n]+/) ?? '').trim();
    return parseClause(raw, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
  },
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
};
