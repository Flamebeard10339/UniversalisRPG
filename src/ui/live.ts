import { LIVE_TICK_MS } from '../runtime/command';

// Elapsed real milliseconds, handed to whoever is advancing a run. Starting a
// ticker hands back the way to stop it, so nothing else has to hold a timer id.
export type Ticker = (tick: (elapsedMs: number) => void) => () => void;

export interface Clock {
  now(): number;
  every(ms: number, fire: () => void): () => void;
}

export const wallClock: Clock = {
  now: () => Date.now(),
  every: (ms, fire) => {
    const timer = setInterval(fire, ms);
    return () => clearInterval(timer);
  },
};

// Elapsed is the distance between two readings of the clock, never the
// interval that was asked for. A backgrounded tab fires late and a slow frame
// fires later still, and a run paid the nominal figure falls behind the wall
// clock the REPL's half of this is measured on.
export function createTicker(clock: Clock = wallClock, everyMs: number = LIVE_TICK_MS): Ticker {
  return (tick) => {
    let last = clock.now();
    return clock.every(everyMs, () => {
      const now = clock.now();
      const elapsedMs = now - last;
      last = now;
      tick(elapsedMs);
    });
  };
}
