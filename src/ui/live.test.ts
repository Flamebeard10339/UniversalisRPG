import { describe, expect, it } from 'vitest';
import { LIVE_TICK_MS } from '../runtime/command';
import { createTicker, type Clock } from './live';

// A clock a test moves by hand, and a timer a test fires by hand: the two are
// separate because the whole question here is what happens when they disagree.
function fakeClock(): Clock & { at: number; cadence: number[]; stops: number; fire(): void } {
  const fires: Array<() => void> = [];
  return {
    at: 1_000,
    cadence: [],
    stops: 0,
    now() {
      return this.at;
    },
    every(ms, fire) {
      this.cadence.push(ms);
      fires.push(fire);
      return () => void (this.stops += 1);
    },
    fire() {
      for (const fire of fires) fire();
    },
  };
}

describe('the ticker a live run is advanced by', () => {
  it('hands over the time that actually passed, not the interval it asked for', () => {
    const clock = fakeClock();
    const spans: number[] = [];
    createTicker(clock, 200)((elapsedMs) => spans.push(elapsedMs));

    clock.at = 1_200;
    clock.fire();
    // The tab was backgrounded: one fire, four seconds of wall clock behind it.
    clock.at = 5_200;
    clock.fire();

    expect(spans).toEqual([200, 4000]);
  });

  it('ticks at the cadence the command surface publishes, so both drivers round the same way', () => {
    const clock = fakeClock();
    createTicker(clock)(() => undefined);

    expect(clock.cadence).toEqual([LIVE_TICK_MS]);
  });

  it('stops the timer it started when the run is over', () => {
    const clock = fakeClock();
    const stop = createTicker(clock)(() => undefined);

    stop();

    expect(clock.stops).toBe(1);
  });
});
