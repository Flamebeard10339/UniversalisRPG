import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';

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

export function arrivalsBetween(before: readonly Carried[], after: readonly Carried[]): Arrival[] {
  const held = new Map(before.map((row) => [row.id, row.count]));
  return after.flatMap((row) => {
    const arrived = row.count - (held.get(row.id) ?? 0);
    return arrived > 0 ? [{ id: row.id, name: row.name, count: arrived }] : [];
  });
}

export function foldGains(gains: readonly Gain[]): Gain[] {
  const byId = new Map<Answer, Gain>();
  for (const gain of gains) {
    const held = byId.get(gain.id);
    byId.set(gain.id, held ? { ...held, amount: held.amount + gain.amount } : gain);
  }
  return [...byId.values()];
}

export function risesOf(gains: readonly Gain[]): Rise[] {
  const byAmount = new Map<number, Localized[]>();
  for (const gain of foldGains(gains)) byAmount.set(gain.amount, [...(byAmount.get(gain.amount) ?? []), gain.title]);
  return [...byAmount.entries()].sort(([left], [right]) => right - left).map(([amount, titles]) => ({ amount, titles }));
}

export type Note = { id: number; began: number; slot: number; key: Answer } & ({ kind: 'xp'; gains: Gain[] } | { kind: 'item'; name: Localized; count: number });

const gainsKey = (gains: readonly Gain[]): Answer => gains.map((gain) => gain.id).sort().join('+');

export function freeSlot(living: readonly Note[]): number {
  const taken = new Set(living.map((note) => note.slot));
  for (let at = 0; ; at += 1) if (!taken.has(at)) return at;
}

export const NOTE_SPACING_MS = 200;

export const NOTE_LIFETIME_MS = 2000;

export type Pending = { kind: 'xp'; key: Answer; gains: Gain[] } | { kind: 'item'; key: Answer; arrival: Arrival };

export interface NoteQueue {
  shown: readonly Note[];
  waiting: readonly Pending[];
  began: number;
  next: number;
}

export const emptyQueue: NoteQueue = { shown: [], waiting: [], began: Number.NEGATIVE_INFINITY, next: 1 };

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

export function poured(queue: NoteQueue, now: number): NoteQueue {
  const living = queue.shown.filter((note) => now - note.began < NOTE_LIFETIME_MS);
  const held = living.length === queue.shown.length ? queue : { ...queue, shown: living };
  const [next, ...rest] = queue.waiting;
  if (next === undefined || now - queue.began < NOTE_SPACING_MS) return held;
  return { ...held, shown: [...living, lineOf(next, queue.next, now, freeSlot(living))], waiting: rest, began: now, next: queue.next + 1 };
}
