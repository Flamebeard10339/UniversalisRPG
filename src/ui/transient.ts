import { createContext, useContext, useEffect } from 'react';
import { LIVE_TICK_MS } from '../runtime/command';

// How a released strip finishes travelling, on either axis. One figure, so the
// horizontal pages and the vertical layers settle as one surface.
export const SETTLE_MS = 220;

// A moment is something the shell plays that begins and ends on its own. It is
// over before an agent driving the GUI can ask what is on the screen, which is
// why the channel writes down that it played rather than that it is playing.
//
// A note is the kind the channel draws itself; the rest are drawn by the node
// they play over.
export type MomentKind = 'note' | 'arrival' | 'rise' | 'darken' | 'settle' | 'sprout' | 'linger' | 'deny';

// What the caller puts on its node for the moment to be drawn, which is the
// only place any of these strings is written. A kind is a verb and a class is
// the word the stylesheet answers to, deliberately not the same word: that is
// what lets a rule say the class is written here and asked for everywhere.
//
// A settle is a transition rather than a class, because it moves a node a
// finger was holding a moment ago and is reached imperatively for that reason.
const DRAWN_AS: Record<MomentKind, string> = {
  note: '',
  arrival: 'arrived',
  rise: 'risen',
  darken: 'darkened',
  settle: `transform ${SETTLE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
  sprout: 'sprouted',
  linger: 'lingered',
  deny: 'denied',
};

// Not a moment, and here for the same reason the moments are: this file is
// where every animation string the shell draws is written, so a rule can say
// that nothing else writes one. The fill eases linearly over exactly one tick,
// so a bar the clock moves every tick arrives as the next tick leaves and reads
// as continuous rather than as steps; it is read off the cadence rather than
// spelled again as a duration, because the two would have to change together
// and nothing would say so. It is never played, because it renders a value the
// view publishes as that value changes — there is no instant of it a driving
// agent could miss.
export const FILL_TRANSITION = { transitionProperty: 'width', transitionTimingFunction: 'linear', transitionDuration: `${LIVE_TICK_MS}ms` };

// When a moment plays, for the one kind that plays over many things at once: a
// cluster of a plane arrives as a dozen nodes and edges, and a dozen of them in
// one frame reads as the screen having changed rather than as something being
// built. `backwards` so a node waiting its turn is already in the state its
// moment begins from, instead of standing fully drawn until its delay is up.
// Here for the same reason FILL_TRANSITION is: this file is where the shell's
// animation is written, and a rule can say nothing else writes one.
export const playedAfter = (ms: number): { animationDelay: string; animationFillMode: 'backwards' } => ({ animationDelay: `${ms}ms`, animationFillMode: 'backwards' });

// Not a moment: a level crossed and not yet looked at is a state the banner is
// in, which lasts until the player goes and looks rather than beginning and
// ending on its own. Here because this file is where the shell's animation is
// named, which is the rule the moments are a case of.
export const STIRRING = 'stirring';

// A transient note carries text and nothing about where it came from, so the
// overlay rendering it cannot know which moment produced it.
export interface TransientNote {
  id: number;
  text: string;
}

export interface Moment {
  id: number;
  kind: MomentKind;
  // What it played over, where the kind plays over more than one thing: the
  // place that arrived, the text a note carried. Empty where the kind is about
  // the one thing it can be about.
  subject: string;
}

export interface Played {
  moments: readonly Moment[];
  // What to ask from next. Handed back rather than inferred from the last
  // moment, so a step that played nothing still moves the reader forward.
  cursor: number;
}

export interface TransientChannel {
  // The one door in, and the reason there is no way to play a moment the log
  // does not carry: what a node needs is what this hands back.
  play(kind: MomentKind, subject?: string): string;
  notes(): readonly TransientNote[];
  playedSince(cursor: number): Played;
  subscribe(listener: () => void): () => void;
}

export interface TransientOptions {
  lifetimeMs?: number;
  schedule?: (expire: () => void, ms: number) => void;
  limit?: number;
}

export const TRANSIENT_LIFETIME_MS = 1400;

// How many moments the log keeps. A driving agent reads it between two steps
// milliseconds apart, so this is a bound on a leak rather than a budget any
// reader is expected to reach.
export const MOMENT_LOG_LIMIT = 200;

export function createTransientChannel(options: TransientOptions = {}): TransientChannel {
  const lifetimeMs = options.lifetimeMs ?? TRANSIENT_LIFETIME_MS;
  const schedule = options.schedule ?? ((expire, ms) => setTimeout(expire, ms));
  const limit = options.limit ?? MOMENT_LOG_LIMIT;
  const listeners = new Set<() => void>();
  let notes: readonly TransientNote[] = [];
  let log: readonly Moment[] = [];
  let nextId = 1;

  const tell = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    play(kind, subject = '') {
      const moment: Moment = { id: nextId++, kind, subject };
      log = [...log, moment].slice(-limit);

      if (kind === 'note') {
        const note = { id: moment.id, text: subject };
        notes = [...notes, note];
        schedule(() => {
          notes = notes.filter((each) => each !== note);
          tell();
        }, lifetimeMs);
      }

      tell();
      return DRAWN_AS[kind];
    },
    notes: () => notes,
    playedSince: (cursor) => ({ moments: log.filter((moment) => moment.id > cursor), cursor: nextId - 1 }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Null where nothing has provided one, which is a component rendered outside a
// session: it draws what it would have drawn and writes nothing down, because
// there is no session to write it to.
const CHANNEL = createContext<TransientChannel | null>(null);

export const TransientProvider = CHANNEL.Provider;

// The only way to draw a moment, and the reason the class names above are
// written in one file: asking what to draw is what writes the play down, so a
// component cannot have one without the other.
export function useMoment(kind: MomentKind, plays: boolean, subject = ''): string {
  const channel = useContext(CHANNEL);

  useEffect(() => {
    if (plays) channel?.play(kind, subject);
  }, [channel, kind, plays, subject]);

  return plays ? DRAWN_AS[kind] : '';
}

// The imperative twin, for the two surfaces that write a moment onto a node a
// finger was holding a moment ago rather than onto one React is about to
// mount. Same door, and the same bargain: what it hands back is what plays.
export function useMomentPlayer(kind: MomentKind): (subject?: string) => string {
  const channel = useContext(CHANNEL);

  return (subject = '') => channel?.play(kind, subject) ?? DRAWN_AS[kind];
}
