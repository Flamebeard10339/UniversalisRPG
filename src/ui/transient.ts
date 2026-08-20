import { createContext, useContext, useEffect } from 'react';
import { LIVE_TICK_MS } from '../runtime/command';

export const SETTLE_MS = 220;

export type MomentKind = 'note' | 'arrival' | 'rise' | 'darken' | 'settle' | 'sprout' | 'linger' | 'deny';

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

export const FILL_TRANSITION = { transitionProperty: 'width', transitionTimingFunction: 'linear', transitionDuration: `${LIVE_TICK_MS}ms` };

export const playedAfter = (ms: number): { animationDelay: string; animationFillMode: 'backwards' } => ({ animationDelay: `${ms}ms`, animationFillMode: 'backwards' });

export const STIRRING = 'stirring';

export interface TransientNote {
  id: number;
  text: string;
}

export interface Moment {
  id: number;
  kind: MomentKind;
  subject: string;
}

export interface Played {
  moments: readonly Moment[];
  cursor: number;
}

export interface TransientChannel {
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

const CHANNEL = createContext<TransientChannel | null>(null);

export const TransientProvider = CHANNEL.Provider;

export function useMoment(kind: MomentKind, plays: boolean, subject = ''): string {
  const channel = useContext(CHANNEL);

  useEffect(() => {
    if (plays) channel?.play(kind, subject);
  }, [channel, kind, plays, subject]);

  return plays ? DRAWN_AS[kind] : '';
}

export function useMomentPlayer(kind: MomentKind): (subject?: string) => string {
  const channel = useContext(CHANNEL);

  return (subject = '') => channel?.play(kind, subject) ?? DRAWN_AS[kind];
}
