import { DslError, Parser, Span } from './parser';
import { Range } from './range';

// A percent bonus never takes a range, so the two are separate members.
export type TagClause =
  | { kind: 'keyword'; value: string }
  | { kind: 'stat-bonus'; statId: string; percent: false; amount: Range }
  | { kind: 'stat-bonus'; statId: string; percent: true; amount: number }
  | { kind: 'duration'; seconds: number };

const SECONDS_PER_MINUTE = 60;

const DURATION = /^(?:(?<minutes>\d+)m)?(?:(?<seconds>\d+)s)?$/;
const STAT_BONUS = /^(?<sign>[+-])(?<lo>\d+)(?:-(?<hi>\d+))?(?<percent>%?)[ \t]+(?<stat>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)$/;
const KEYWORD = /^[a-z][a-z0-9-]*$/;

function parseStatBonus(groups: Record<string, string | undefined>, raw: string, span: Span): TagClause {
  const statId = groups.stat!;
  // The sign leads the whole clause: `-3-6 dr` is between -6 and -3.
  const sign = groups.sign === '-' ? -1 : 1;
  const lo = Number(groups.lo);

  if (groups.percent === '%') {
    if (groups.hi !== undefined) throw new DslError(`a percent stat bonus cannot be a range: ${JSON.stringify(raw)}`, span);
    return { kind: 'stat-bonus', statId, percent: true, amount: sign * lo };
  }

  if (groups.hi === undefined) return { kind: 'stat-bonus', statId, percent: false, amount: { min: sign * lo, max: sign * lo } };

  const hi = Number(groups.hi);
  if (hi < lo) throw new DslError(`a stat bonus range must ascend in magnitude, got ${JSON.stringify(raw)}`, span);
  return { kind: 'stat-bonus', statId, percent: false, amount: { min: Math.min(sign * lo, sign * hi), max: Math.max(sign * lo, sign * hi) } };
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
  if (bonus) return parseStatBonus(bonus, raw, span);

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
