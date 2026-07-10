import { describe, expect, it } from 'vitest';
import { effectiveCountdownNow } from './universeSettings';

describe('effectiveCountdownNow', () => {
  it('freezes at lastTickAt while paused (timeFlowsContinuously off, no activeAction)', () => {
    const playState = { activeAction: null, lastTickAt: 1_000 };

    // resolveIdleTimers (and its pauseTimersWhileIdle) only run when
    // something schedules them, so merely re-rendering with a much later
    // liveNow (e.g. from repeatedly switching tabs) must not move the
    // displayed countdown at all while paused.
    expect(effectiveCountdownNow(playState, { timeFlowsContinuously: false }, 50_000)).toBe(1_000);
  });

  it('uses the live clock while actively doing something, even when paused is otherwise on', () => {
    const playState = {
      activeAction: { actionId: 'x', startedAt: 0, completesAt: 100, targetHealth: null },
      lastTickAt: 1_000,
    };

    expect(effectiveCountdownNow(playState, { timeFlowsContinuously: false }, 50_000)).toBe(50_000);
  });

  it('uses the live clock when timeFlowsContinuously is on, regardless of activity', () => {
    const playState = { activeAction: null, lastTickAt: 1_000 };

    expect(effectiveCountdownNow(playState, { timeFlowsContinuously: true }, 50_000)).toBe(50_000);
  });
});
