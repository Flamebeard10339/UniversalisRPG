import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

// What the world just gave the player, said at the top of the screen. Both
// halves are read off two views of the same published lists — the engine says
// what a skill has and what the player is carrying, never what either of them
// just got — and the difference is the whole of the event.
//
// A line that is already on screen takes what arrives after it rather than
// being followed by a second line saying the same thing: a skill worked at for
// a minute is one line counting up, and it goes when the work stops. That is
// what keeps a repeated action from writing a column.

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

// What one clause of an experience line says: an amount, and every skill that
// is standing at it.
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

// One entry per skill, whatever the world did to reach it. Two grants to one
// skill in one breath are one number to the player, not two.
export function foldGains(gains: readonly Gain[]): Gain[] {
  const byId = new Map<Answer, Gain>();
  for (const gain of gains) {
    const held = byId.get(gain.id);
    byId.set(gain.id, held ? { ...held, amount: held.amount + gain.amount } : gain);
  }
  return [...byId.values()];
}

// Grouped by amount, largest first, and the skills inside a group in the order
// the engine listed them. A line reads "+737 Attack, Defence, Health" because
// that is one number three skills are standing at; two numbers are two clauses
// of the same line rather than two lines.
export function risesOf(gains: readonly Gain[]): Rise[] {
  const byAmount = new Map<number, Localized[]>();
  for (const gain of foldGains(gains)) byAmount.set(gain.amount, [...(byAmount.get(gain.amount) ?? []), gain.title]);
  return [...byAmount.entries()].sort(([left], [right]) => right - left).map(([amount, titles]) => ({ amount, titles }));
}

// One line on the screen. `slot` is where it is drawn and is the line's for as
// long as it lives: lines leave in the order they arrived and a stack that
// closed the gap would jerk every line still on screen upward the moment the
// oldest went. `key` is what it is about, and is how the next thing of the same
// kind finds it rather than starting a line of its own.
export type Note = { id: number; began: number; slot: number; key: Answer } & ({ kind: 'xp'; gains: Gain[] } | { kind: 'item'; name: Localized; count: number });

// What a line is about, as an id and never as words: the skills one grant
// touched, together, so an action that always pays the same three keeps writing
// into the same line. A thing is about itself and answers to its own id.
const gainsKey = (gains: readonly Gain[]): Answer => gains.map((gain) => gain.id).sort().join('+');

// The lowest place nothing is standing in. A line leaving frees its place for
// the next one rather than for the lines beside it, which is what keeps them
// still.
export function freeSlot(living: readonly Note[]): number {
  const taken = new Set(living.map((note) => note.slot));
  for (let at = 0; ; at += 1) if (!taken.has(at)) return at;
}

// How close together two lines may begin.
export const NOTE_SPACING_MS = 200;

// How long a line lasts after the last thing it was told about.
export const NOTE_LIFETIME_MS = 2000;

// Something the queue has been told about and has not said yet.
export type Pending = { kind: 'xp'; key: Answer; gains: Gain[] } | { kind: 'item'; key: Answer; arrival: Arrival };

export interface NoteQueue {
  shown: readonly Note[];
  waiting: readonly Pending[];
  // When the last line began, on the same clock everything here is asked with.
  began: number;
  next: number;
}

export const emptyQueue: NoteQueue = { shown: [], waiting: [], began: Number.NEGATIVE_INFINITY, next: 1 };

// What a line becomes when it is told the same thing again: more of it, and
// young again, so it stays while the work that feeds it lasts.
function grown(note: Note, told: Pending, now: number): Note {
  if (note.kind === 'xp' && told.kind === 'xp') return { ...note, began: now, gains: foldGains([...note.gains, ...told.gains]) };
  if (note.kind === 'item' && told.kind === 'item') return { ...note, began: now, count: note.count + told.arrival.count };
  return note;
}

function merged(waiting: readonly Pending[], told: Pending): readonly Pending[] {
  const at = waiting.findIndex((each) => each.kind === told.kind && each.key === told.key);
  if (at < 0) return [...waiting, told];
  const held = waiting[at];
  const joined: Pending =
    held.kind === 'xp' && told.kind === 'xp'
      ? { ...held, gains: foldGains([...held.gains, ...told.gains]) }
      : held.kind === 'item' && told.kind === 'item'
        ? { ...held, arrival: { ...held.arrival, count: held.arrival.count + told.arrival.count } }
        : held;
  return waiting.map((each, index) => (index === at ? joined : each));
}

// Everything that just happened, taken in. A line already saying this takes it
// straight away — there is nothing to space out about a number going up — and
// anything else waits for a line of its own.
export function heard(queue: NoteQueue, gains: readonly Gain[], arrivals: readonly Arrival[], now: number): NoteQueue {
  const folded = foldGains(gains);
  const told: Pending[] = [
    ...(folded.length === 0 ? [] : [{ kind: 'xp', key: gainsKey(folded), gains: folded } as Pending]),
    ...arrivals.map((arrival): Pending => ({ kind: 'item', key: arrival.id, arrival })),
  ];
  if (told.length === 0) return queue;

  let shown = queue.shown;
  let waiting = queue.waiting;
  for (const one of told) {
    const at = shown.findIndex((note) => note.kind === one.kind && note.key === one.key);
    if (at >= 0) shown = shown.map((note, index) => (index === at ? grown(note, one, now) : note));
    else waiting = merged(waiting, one);
  }
  return { ...queue, shown, waiting };
}

function lineOf(told: Pending, id: number, now: number, slot: number): Note {
  if (told.kind === 'item') return { id, began: now, slot, key: told.key, kind: 'item', name: told.arrival.name, count: told.arrival.count };
  return { id, began: now, slot, key: told.key, kind: 'xp', gains: told.gains };
}

// The next line begins, and lines nothing has added to for a lifetime have
// gone. Called on a tick rather than on an arrival, so what landed during the
// quiet moment still reaches the screen and a line leaves on its own.
export function poured(queue: NoteQueue, now: number): NoteQueue {
  const living = queue.shown.filter((note) => now - note.began < NOTE_LIFETIME_MS);
  const held = living.length === queue.shown.length ? queue : { ...queue, shown: living };
  const [next, ...rest] = queue.waiting;
  if (next === undefined || now - queue.began < NOTE_SPACING_MS) return held;
  return { ...held, shown: [...living, lineOf(next, queue.next, now, freeSlot(living))], waiting: rest, began: now, next: queue.next + 1 };
}
