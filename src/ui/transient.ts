import { createContext, useContext, useEffect } from 'react';
import { LIVE_TICK_MS } from '../runtime/command';
import { merged, NOTICE_LIFETIME_MS, sayingOf, type Notice, type Shown } from './notice';
import { useMedia } from './wide';

export const SETTLE_MS = 220;

export const RELAX_MS = 250;

export type MomentKind = 'arrival' | 'rise' | 'darken' | 'settle' | 'sprout' | 'linger' | 'deny' | 'underway';

const DRAWN_AS: Record<MomentKind, string> = {
  arrival: 'arrived',
  rise: 'risen',
  darken: 'darkened',
  settle: `transform ${SETTLE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
  sprout: 'sprouted',
  linger: 'lingered',
  deny: 'denied',
  underway: 'underway',
};

const LESS_MOTION = '(prefers-reduced-motion: reduce)';

export const useMotionless = (): boolean => useMedia(LESS_MOTION);

export const FILL_TRANSITION = { transitionProperty: 'width', transitionTimingFunction: 'linear', transitionDuration: `${LIVE_TICK_MS}ms` };

export const playedAfter = (ms: number): { animationDelay: string; animationFillMode: 'backwards' } => ({ animationDelay: `${ms}ms`, animationFillMode: 'backwards' });

export const STIRRING = 'stirring';

export const MARCHING = 'marching';

export const MARCHING_BACK = 'marching marching-back';

export interface Moment {
  id: number;
  kind: MomentKind | 'note';
  subject: string;
}

export interface Played {
  moments: readonly Moment[];
  cursor: number;
}

export interface TransientChannel {
  play(kind: MomentKind, subject?: string): string;
  note(said: Notice): void;
  notices(): readonly Shown[];
  playedSince(cursor: number): Played;
  subscribe(listener: () => void): () => void;
}

export interface TransientOptions {
  lifetimeMs?: number;
  schedule?: (expire: () => void, ms: number) => void;
  limit?: number;
}

export const MOMENT_LOG_LIMIT = 200;

export function createTransientChannel(options: TransientOptions = {}): TransientChannel {
  const lifetimeMs = options.lifetimeMs ?? NOTICE_LIFETIME_MS;
  const schedule = options.schedule ?? ((expire, ms) => setTimeout(expire, ms));
  const limit = options.limit ?? MOMENT_LOG_LIMIT;
  const listeners = new Set<() => void>();
  let shown: readonly Shown[] = [];
  let log: readonly Moment[] = [];
  let nextId = 1;

  const tell = (): void => {
    for (const listener of listeners) listener();
  };

  const wrote = (kind: Moment['kind'], subject: string): number => {
    const moment: Moment = { id: nextId++, kind, subject };
    log = [...log, moment].slice(-limit);
    return moment.id;
  };

  return {
    play(kind, subject = '') {
      wrote(kind, subject);
      tell();
      return DRAWN_AS[kind];
    },
    note(said) {
      const grew = merged(shown, said, wrote('note', sayingOf(said)));
      shown = grew.shown;
      schedule(() => {
        shown = shown.filter((each) => each !== grew.one);
        tell();
      }, lifetimeMs);
      tell();
    },
    notices: () => shown,
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
