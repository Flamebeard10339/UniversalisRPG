import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

// What the world just gave the player, said one line at a time at the top of
// the screen. Both halves are read off two views of the same published lists —
// the engine says what a skill has and what the player is carrying, never what
// either of them just got — and the difference is the whole of the event.
//
// The two halves group differently on purpose. Experience is one thing
// happening to several skills at once, so five skills that gained the same
// amount are one sentence; a thing arriving is one thing, so two of them are
// two lines, one after the other.

type Row = PlayView['xp'][number];
type Carried = PlayView['carried'][number];

export interface Gain {
  id: Answer;
  title: Localized;
  amount: number;
}

export interface Arrival {
  id: Answer;
  name: Localized;
  count: number;
}

// What one experience line says: an amount, and every skill that gained it.
export interface Rise {
  amount: number;
  titles: Localized[];
}

export function gainsBetween(before: readonly Row[], after: readonly Row[]): Gain[] {
  const held = new Map(before.map((row) => [row.id, row.value]));
  return after.flatMap((row) => {
    const gained = row.value - (held.get(row.id) ?? 0);
    return gained > 0 ? [{ id: row.id, title: row.title, amount: gained }] : [];
  });
}

// A row the player did not have, or had fewer of. A grown copy is a row of its
// own the moment it is minted, so it arrives the same way a stack does.
export function arrivalsBetween(before: readonly Carried[], after: readonly Carried[]): Arrival[] {
  const held = new Map(before.map((row) => [row.id, row.count]));
  return after.flatMap((row) => {
    const arrived = row.count - (held.get(row.id) ?? 0);
    return arrived > 0 ? [{ id: row.id, name: row.name, count: arrived }] : [];
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

// Something the queue has been told about and has not said yet.
export type Pending = { kind: 'xp'; gain: Gain } | { kind: 'item'; arrival: Arrival };

// One line on the screen. `slot` is where it is drawn and is the line's for as
// long as it lives: lines leave in the order they arrived and a stack that
// closed the gap would jerk every line still on screen upward the moment the
// oldest went.
export type Note = { id: number; began: number; slot: number } & ({ kind: 'xp'; rises: Rise[] } | { kind: 'item'; name: Localized; count: number });

// The lowest place nothing is standing in. A line leaving frees its place for
// the next one rather than for the lines beside it, which is what keeps them
// still.
export function freeSlot(living: readonly Note[]): number {
  const taken = new Set(living.map((note) => note.slot));
  for (let at = 0; ; at += 1) if (!taken.has(at)) return at;
}

// How close together two lines may begin. Experience arrives a tick at a time
// during a run, and a line per tick is a column of text nobody can read.
export const NOTE_SPACING_MS = 500;

// How long one line lasts before it has gone.
export const NOTE_LIFETIME_MS = 2000;

// What the overlay is holding and what it has not shown yet. Something that
// lands inside the spacing is not dropped: it waits, and is said when the next
// line is allowed to begin.
export interface NoteQueue {
  shown: readonly Note[];
  waiting: readonly Pending[];
  // When the last line began, on the same clock `poured` is asked with.
  began: number;
  next: number;
}

export const emptyQueue: NoteQueue = { shown: [], waiting: [], began: Number.NEGATIVE_INFINITY, next: 1 };

export function queued(queue: NoteQueue, gains: readonly Gain[], arrivals: readonly Arrival[] = []): NoteQueue {
  const told: Pending[] = [...gains.map((gain): Pending => ({ kind: 'xp', gain })), ...arrivals.map((arrival): Pending => ({ kind: 'item', arrival }))];
  return told.length === 0 ? queue : { ...queue, waiting: [...queue.waiting, ...told] };
}

// The next line, and what is left waiting behind it. Experience takes every
// gain waiting, wherever in the queue it is, because a burst of them is one
// event; a thing that arrived takes only itself, because two things arriving
// are two events and the player is owed both names.
function nextLine(waiting: readonly Pending[], id: number, now: number, slot: number): { note: Note; rest: readonly Pending[] } | null {
  const head = waiting[0];
  if (head === undefined) return null;
  if (head.kind === 'item') return { note: { id, began: now, slot, kind: 'item', name: head.arrival.name, count: head.arrival.count }, rest: waiting.slice(1) };
  const gains = waiting.flatMap((each) => (each.kind === 'xp' ? [each.gain] : []));
  return { note: { id, began: now, slot, kind: 'xp', rises: risesOf(gains) }, rest: waiting.filter((each) => each.kind !== 'xp') };
}

// Everything the queue has been told, as far as the clock allows: one line
// begins, and lines older than a lifetime have gone. Called on a tick rather
// than on an arrival, so what landed during the quiet half-second still reaches
// the screen and so a line leaves without anything asking it to.
export function poured(queue: NoteQueue, now: number): NoteQueue {
  const living = queue.shown.filter((note) => now - note.began < NOTE_LIFETIME_MS);
  const held = living.length === queue.shown.length ? queue : { ...queue, shown: living };
  if (now - queue.began < NOTE_SPACING_MS) return held;
  const next = nextLine(queue.waiting, queue.next, now, freeSlot(living));
  if (next === null) return held;
  return { ...held, shown: [...living, next.note], waiting: next.rest, began: now, next: queue.next + 1 };
}
