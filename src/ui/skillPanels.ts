import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

// What the skills page draws. The level and where inside it a total stands are
// the engine's, published beside the total; everything below is that reading
// turned into a ring, an order and a rate. Nothing here re-derives the curve —
// a page that did would be the one place allowed to disagree with the stat the
// same level feeds.

type Row = PlayView['xp'][number];

export interface SkillPanel {
  id: Answer;
  title: Localized;
  level: number;
  total: number;
  // Where inside the current level the total sits, and how much ground the
  // level covers. The ring is the first over the second.
  into: number;
  span: number;
  toNext: number;
}

export function panelOf(row: Row): SkillPanel {
  return { id: row.id, title: row.title, level: row.level, total: row.value, into: row.earned, span: row.span, toNext: row.span - row.earned };
}

// Sorted by name rather than left in the order the engine happened to build
// them: a page whose panels move when a total changes is a page a player has to
// re-read every time they open it.
export function skillPanels(rows: readonly Row[]): SkillPanel[] {
  return rows.map(panelOf).sort((left, right) => (left.title < right.title ? -1 : left.title > right.title ? 1 : 0));
}

// How far round the ring is drawn. Zero span cannot happen on this curve, and
// is answered with a full ring rather than a division by nothing.
export const filled = (panel: SkillPanel): number => (panel.span <= 0 ? 1 : Math.min(1, Math.max(0, panel.into / panel.span)));

// What the session has watched: a moment on the world's own clock and every
// total as it stood then. Held rather than asked of the engine, because a rate
// is a fact about the play and not about the character, and the engine keeps no
// field for it.
export interface XpMark {
  // Seconds on the world's clock, which is what `time` publishes.
  at: number;
  totals: Readonly<Record<Answer, number>>;
}

export const markOf = (view: PlayView): XpMark => ({ at: view.time, totals: Object.fromEntries(view.xp.map((row) => [row.id, row.value])) });

const SECONDS_PER_HOUR = 3600;

// Experience an hour, measured between two marks, or null where no world time
// has passed between them — which is what a session that has not yet run knows
// about its own rate, and is a different answer from zero.
export function perHour(first: XpMark, now: XpMark, id: Answer): number | null {
  const elapsed = now.at - first.at;
  if (elapsed <= 0) return null;
  return (((now.totals[id] ?? 0) - (first.totals[id] ?? 0)) * SECONDS_PER_HOUR) / elapsed;
}

// How long the ground still to cover takes at that rate, in seconds. Null for a
// rate that is not yet known and for one that is standing still, which is a
// wait no number describes.
export function untilNext(panel: SkillPanel, rate: number | null): number | null {
  if (rate === null || rate <= 0) return null;
  return (panel.toNext * SECONDS_PER_HOUR) / rate;
}
