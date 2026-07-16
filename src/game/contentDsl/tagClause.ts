import { DslError, Parser, Span } from './parser';

export type TagClause =
  | { kind: 'keyword'; value: string }
  | { kind: 'stat-bonus'; statId: string; amount: number; percent: boolean }
  | { kind: 'duration'; seconds: number };

const SECONDS_PER_MINUTE = 60;

const DURATION = /^(?:(?<minutes>\d+)m)?(?:(?<seconds>\d+)s)?$/;
const STAT_BONUS = /^(?<sign>[+-])(?<magnitude>\d+)(?<percent>%?)[ \t]+(?<stat>[a-z][a-z0-9-]*)$/;
const KEYWORD = /^[a-z][a-z0-9-]*$/;

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
    return {
      kind: 'stat-bonus',
      statId: bonus.stat,
      amount: (bonus.sign === '-' ? -1 : 1) * Number(bonus.magnitude),
      percent: bonus.percent === '%',
    };
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
