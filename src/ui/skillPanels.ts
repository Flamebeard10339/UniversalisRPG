import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

type Row = PlayView['xp'][number];

export interface SkillPanel {
  id: Answer;
  title: Localized;
  level: number;
  total: number;
  into: number;
  span: number;
  toNext: number;
}

export function panelOf(row: Row): SkillPanel {
  return { id: row.id, title: row.title, level: row.level, total: row.value, into: row.earned, span: row.span, toNext: row.span - row.earned };
}

export function skillPanels(rows: readonly Row[]): SkillPanel[] {
  return rows.map(panelOf).sort((left, right) => (left.title < right.title ? -1 : left.title > right.title ? 1 : 0));
}

export const filled = (panel: SkillPanel): number => (panel.span <= 0 ? 1 : Math.min(1, Math.max(0, panel.into / panel.span)));

export interface XpMark {
  at: number;
  totals: Readonly<Record<Answer, number>>;
}

export const markOf = (view: PlayView): XpMark => ({ at: view.time, totals: Object.fromEntries(view.xp.map((row) => [row.id, row.value])) });

const SECONDS_PER_HOUR = 3600;

export function perHour(first: XpMark, now: XpMark, id: Answer): number | null {
  const elapsed = now.at - first.at;
  if (elapsed <= 0) return null;
  return (((now.totals[id] ?? 0) - (first.totals[id] ?? 0)) * SECONDS_PER_HOUR) / elapsed;
}

export function untilNext(panel: SkillPanel, rate: number | null): number | null {
  if (rate === null || rate <= 0) return null;
  return (panel.toNext * SECONDS_PER_HOUR) / rate;
}
