import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

// Experience arriving, as one line of text at a time. What was earned is read
// off two views of the same published totals — the engine says what a skill has
// and never what it just got — and the line is grouped by the amount, because
// five skills that gained the same thing is one sentence and not five.

type Row = PlayView['xp'][number];

export interface Gain {
  id: Answer;
  title: Localized;
  amount: number;
}

// What one line says: an amount, and every skill that gained exactly it.
export interface Rise {
  amount: number;
  titles: Localized[];
}

export interface XpNote {
  id: number;
  // When it began, on the clock `poured` is asked with. What decides when it
  // has gone, so a line leaves on its own without anything asking it to.
  began: number;
  rises: Rise[];
}

export function gainsBetween(before: readonly Row[], after: readonly Row[]): Gain[] {
  const held = new Map(before.map((row) => [row.id, row.value]));
  return after.flatMap((row) => {
    const gained = row.value - (held.get(row.id) ?? 0);
    return gained > 0 ? [{ id: row.id, title: row.title, amount: gained }] : [];
  });
}

// Grouped by amount, largest first, and the skills inside a group in the order
// the engine listed them. A line reads "+737 Attack, Defence, Health" because
// that is one thing happening to three skills; two amounts are two clauses of
// the same line rather than two lines, so nothing is ever dropped for being
// second.
export function risesOf(gains: readonly Gain[]): Rise[] {
  const byAmount = new Map<number, Localized[]>();
  for (const gain of gains) byAmount.set(gain.amount, [...(byAmount.get(gain.amount) ?? []), gain.title]);
  return [...byAmount.entries()].sort(([left], [right]) => right - left).map(([amount, titles]) => ({ amount, titles }));
}

// How close together two lines may begin. Experience arrives a tick at a time
// during a run, and a line per tick is a column of text nobody can read.
export const NOTE_SPACING_MS = 500;

// How long one line lasts before it has gone.
export const NOTE_LIFETIME_MS = 2000;

// What the overlay is holding and what it has not shown yet. A gain that lands
// inside the spacing is not dropped: it waits, and joins whatever else is
// waiting when the next line is allowed to begin.
export interface NoteQueue {
  shown: readonly XpNote[];
  waiting: readonly Gain[];
  // When the last line began, on the same clock `pour` is asked with.
  began: number;
  next: number;
}

export const emptyQueue: NoteQueue = { shown: [], waiting: [], began: Number.NEGATIVE_INFINITY, next: 1 };

export function queued(queue: NoteQueue, gains: readonly Gain[]): NoteQueue {
  return gains.length === 0 ? queue : { ...queue, waiting: [...queue.waiting, ...gains] };
}

// Everything the queue has been told, as far as the clock allows: one line
// begins, taking every gain that was waiting, and lines older than a lifetime
// have gone. Called on a tick rather than on an arrival, so a gain that landed
// during the quiet half-second still reaches the screen.
export function poured(queue: NoteQueue, now: number): NoteQueue {
  const living = queue.shown.filter((note) => now - note.began < NOTE_LIFETIME_MS);
  const held = living.length === queue.shown.length ? queue : { ...queue, shown: living };
  if (queue.waiting.length === 0 || now - queue.began < NOTE_SPACING_MS) return held;
  return { ...held, shown: [...living, { id: queue.next, began: now, rises: risesOf(queue.waiting) }], waiting: [], began: now, next: queue.next + 1 };
}
