import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { fixtureSources } from '../content/worldFixture';
import { dslRead } from '../grammar/structure';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { App } from './App';
import { createDriver, type Driver } from './driver';
import { TRANSCRIPT_KEPT } from './transcript';

const UNDER_WAY = 'use:location.fixture-town.green.loiter';

const TICK_MS = 100;

const WATCHED = 60;

const A_LONG_SESSION = 400;

const FRAME_BUDGET_MS = 25;

class NothingResizes {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function asABrowserWould(): void {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NothingResizes;
  (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({
    media,
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
}

function position(driver: Driver, choiceId: string): number {
  const at = driver.snapshot().view.choices.findIndex((choice) => choice.id === choiceId);
  if (at < 0) throw new Error(`no such choice: ${choiceId}`);
  return at + 1;
}

function tallied(driver: SlotDriver): { slots: SlotDriver; calls: () => number } {
  let calls = 0;
  const wrapping = Object.entries(driver).map(([name, held]) => [
    name,
    (...taken: unknown[]) => {
      calls += 1;
      return (held as (...args: unknown[]) => unknown)(...taken);
    },
  ]);
  return { slots: Object.fromEntries(wrapping) as SlotDriver, calls: () => calls };
}

interface Watched {
  read: () => number;
  notices: () => number;
  stored: () => number;
  drawn: () => number;
  kept: () => number;
  tick: (frames: number) => void;
  underWay: () => boolean;
  say: (lines: number) => void;
  close: () => void;
}

function playing(): Watched {
  asABrowserWould();
  const held: ((ms: number) => void)[] = [];
  const store = tallied(memoryDriver());
  const driver = createDriver(fixtureSources(), {
    slots: store.slots,
    ticker: (tick) => {
      held.push(tick);
      return () => void held.splice(held.indexOf(tick), 1);
    },
  });

  let notices = 0;
  driver.subscribe(() => void (notices += 1));

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<App driver={driver} />));
  act(() => driver.choose(position(driver, UNDER_WAY)));

  return {
    read: dslRead,
    notices: () => notices,
    stored: store.calls,
    drawn: () => host.querySelectorAll('p').length,
    kept: () => driver.snapshot().transcript.entries.length,
    tick: (frames) =>
      act(() => {
        for (let frame = 0; frame < frames; frame += 1) for (const each of [...held]) each(TICK_MS);
      }),
    underWay: () => driver.snapshot().view.action !== null,
    say: (lines) =>
      act(() => {
        for (let line = 0; line < lines; line += 1) driver.note(`line ${line}`);
      }),
    close: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('a frame of live play', () => {
  it('opens a world by reading it, and leaves something under way, so the frames below are not measuring an idle page', () => {
    const before = dslRead();
    const watched = playing();
    expect(watched.read()).toBeGreaterThan(before);
    expect(watched.underWay()).toBe(true);
    watched.tick(WATCHED);
    expect(watched.notices()).toBeGreaterThan(0);
    watched.close();
  });

  it('reads no world, because everything a frame draws was read when the world was opened', () => {
    const watched = playing();
    const read = watched.read();
    watched.tick(WATCHED);
    expect(watched.read() - read).toBe(0);
    watched.close();
  });

  it('wakes the screen once, so nothing publishes a snapshot twice for one tick of the clock', () => {
    const watched = playing();
    const woken = watched.notices();
    watched.tick(WATCHED);
    expect(watched.notices() - woken).toBe(WATCHED);
    watched.close();
  });

  it('costs what it cost at the start of the session, however long the session has run', () => {
    const watched = playing();
    watched.tick(WATCHED);

    const first = { read: watched.read(), stored: watched.stored(), notices: watched.notices() };
    watched.tick(WATCHED);
    const early = { read: watched.read() - first.read, stored: watched.stored() - first.stored, notices: watched.notices() - first.notices };

    watched.tick(A_LONG_SESSION);

    const then = { read: watched.read(), stored: watched.stored(), notices: watched.notices() };
    watched.tick(WATCHED);
    const late = { read: watched.read() - then.read, stored: watched.stored() - then.stored, notices: watched.notices() - then.notices };

    expect(late).toEqual(early);
    watched.close();
  });

  it('draws a bounded log, so a long session does not leave the screen holding every line it ever said', () => {
    const watched = playing();
    const quiet = watched.drawn();
    watched.say(A_LONG_SESSION);
    const full = watched.drawn();
    expect(full).toBeGreaterThan(quiet);
    expect(watched.kept()).toBeLessThanOrEqual(TRANSCRIPT_KEPT);

    watched.say(A_LONG_SESSION);
    expect(watched.drawn()).toBe(full);
    expect(watched.kept()).toBeLessThanOrEqual(TRANSCRIPT_KEPT);
    watched.close();
  });

  it('lands inside a frame of the clock it is driven by, with room for a machine slower than this one', () => {
    const watched = playing();
    watched.tick(WATCHED);
    const at = performance.now();
    watched.tick(WATCHED);
    const each = (performance.now() - at) / WATCHED;
    expect(each).toBeLessThan(FRAME_BUDGET_MS);
    watched.close();
  });
});
