import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/registry';
import { newContext, runLine, type Ticker } from '../runtime/command';
import { startSession, view, type PlayView } from '../runtime/session';
import { createDriver, type Driver } from './driver';
import { SHIPPED_SOURCES } from './shippedContent';

// One spannable action and nothing else, so a test about time is not also a
// test about what the tutorial happens to offer.
const WORKSHOP = {
  name: 'workshop',
  text: [
    '# info workshop',
    'version: 1.0.0',
    '',
    '# location workshop',
    'x: 0, y: 0',
    'starting',
    'examine: A bench and a lathe.',
    'entities:',
    '  lathe',
    '',
    '# entity lathe',
    'title: Lathe',
    'examine: A lathe, belt slack.',
    'turn a spindle:',
    '  time: 4',
    '  on success:',
    '    say: A spindle comes off the lathe.',
    '',
  ].join('\n'),
};

const SPINDLE = 'use:entity.workshop.lathe.turn a spindle';

// A ticker a test drives by hand, so elapsed milliseconds arrive on demand
// rather than whenever a real timer got around to it.
function handTicker(): Ticker & { advance(elapsedMs: number): void; stops: number } {
  let ticking: ((elapsedMs: number) => void) | null = null;
  const ticker = ((tick) => {
    ticking = tick;
    return () => {
      ticking = null;
      ticker.stops += 1;
    };
  }) as Ticker & { advance(elapsedMs: number): void; stops: number };
  ticker.stops = 0;
  ticker.advance = (elapsedMs) => ticking?.(elapsedMs);
  return ticker;
}

function shown(driver: Driver): PlayView {
  const view = driver.snapshot().view;
  if (!view) throw new Error(driver.snapshot().fault ?? 'no view');
  return view;
}

function position(driver: Driver, choiceId: string): number {
  const at = shown(driver).choices.findIndex((choice) => choice.id === choiceId);
  if (at < 0) throw new Error(`no such choice: ${choiceId}`);
  return at + 1;
}

function texts(driver: Driver): string[] {
  return driver.snapshot().transcript.entries.map((entry) => entry.text);
}

describe('the GUI driver', () => {
  it('opens the shipped session and logs the place it opened in', () => {
    const driver = createDriver(SHIPPED_SOURCES);

    expect(driver.snapshot().fault).toBeNull();
    const view = shown(driver);
    expect(view.location.id).toBe('tutorial-island.guide-house');
    expect(texts(driver)).toEqual([view.location.title, view.location.description]);
    expect(view.choices.length).toBeGreaterThan(0);
  });

  it('dispatches a choice by the position the engine listed it at', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    const before = texts(driver).length;

    driver.choose(position(driver, 'talk:tutorial-island.miki'));

    // The world is withdrawn under an open modal, which is the engine's rule
    // and not one this driver applies.
    expect(shown(driver).modals).toHaveLength(1);
    expect(shown(driver).choices).toEqual([]);
    expect(texts(driver).slice(before)).toEqual(shown(driver).said);
  });

  it('answers a modal by its published option key, and what was beneath comes back', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    driver.choose(position(driver, 'talk:tutorial-island.miki'));

    const asked = shown(driver).modals[0].options[0];
    driver.answer(asked.key, asked.values![0].value);

    expect(shown(driver).modals).toEqual([]);
    expect(shown(driver).choices.map((choice) => choice.id)).toContain('talk:tutorial-island.miki');
  });

  it('carries a free-text answer through with the spaces it was typed with', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    driver.choose(position(driver, 'talk:tutorial-island.miki'));
    const menu = shown(driver).modals[0].options[0];
    driver.answer(menu.key, menu.values![0].value);
    driver.choose(position(driver, 'use:entity.tutorial-island.mirror.look in'));

    const name = shown(driver).modals[0].options[0];
    driver.answer(name.key, 'Sir Robin');
    const race = shown(driver).modals[0].options[0];
    driver.answer(race.key, race.values![0].value);

    expect(shown(driver).modals).toEqual([]);
    expect(shown(driver).player.name).toBe('Sir Robin');
  });

  it('reports a refusal as the engine worded it and leaves the session where it was', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    const before = shown(driver).choices.length;

    driver.choose(before + 7);

    const written = texts(driver);
    expect(written[written.length - 1]).toBe(`invalid choice: ${JSON.stringify(String(before + 7))}`);
    expect(shown(driver).choices).toHaveLength(before);
  });

  it('arms a spannable action rather than resolving it, and reports the run before any time passes', () => {
    const driver = createDriver([WORKSHOP], { ticker: handTicker() });

    driver.choose(position(driver, SPINDLE));

    expect(driver.snapshot().live).toMatchObject({ label: 'turn a spindle', active: true, progress: 0 });
    expect(shown(driver).time).toBe(0);
  });

  it('advances simulated time from the elapsed milliseconds it is handed', () => {
    const ticker = handTicker();
    const driver = createDriver([WORKSHOP], { ticker });
    driver.choose(position(driver, SPINDLE));

    ticker.advance(1_000);
    ticker.advance(500);

    expect(shown(driver).time).toBe(1.5);
    expect(driver.snapshot().live?.progress).toBeCloseTo(0.375);
  });

  it('closes the run when the action finishes, stops the ticker and gives the choices back', () => {
    const ticker = handTicker();
    const driver = createDriver([WORKSHOP], { ticker });
    driver.choose(position(driver, SPINDLE));

    ticker.advance(4_000);

    expect(driver.snapshot().live).toBeNull();
    expect(ticker.stops).toBe(1);
    expect(shown(driver).time).toBe(4);
    expect(texts(driver)).toContain('A spindle comes off the lathe.');
    expect(shown(driver).choices.map((choice) => choice.id)).toContain(SPINDLE);
  });

  it('cancels on request, keeping the time already spent and saying so in the engine words', () => {
    const ticker = handTicker();
    const driver = createDriver([WORKSHOP], { ticker });
    driver.choose(position(driver, SPINDLE));
    ticker.advance(1_000);

    driver.cancel();

    expect(driver.snapshot().live).toBeNull();
    expect(ticker.stops).toBe(1);
    expect(shown(driver).time).toBe(1);
    expect(texts(driver)).toContain('Stopped.');
    expect(texts(driver)).not.toContain('A spindle comes off the lathe.');
    expect(shown(driver).choices.map((choice) => choice.id)).toContain(SPINDLE);
  });

  it('replaces the run under way with the next thing dispatched, keeping the time it spent', () => {
    const ticker = handTicker();
    const driver = createDriver([WORKSHOP], { ticker });
    driver.choose(position(driver, SPINDLE));
    ticker.advance(1_000);

    driver.choose(position(driver, SPINDLE));

    expect(texts(driver)).toContain('Stopped.');
    // A second run, not the first one carried on: the spent second stands and
    // the new one starts from nothing.
    expect(shown(driver).time).toBe(1);
    expect(driver.snapshot().live).toMatchObject({ active: true, progress: 0 });
    expect(ticker.stops).toBe(1);
  });

  it('stops the run under way before a command that is not a choice at all', () => {
    const ticker = handTicker();
    const driver = createDriver([WORKSHOP], { ticker });
    driver.choose(position(driver, SPINDLE));

    driver.send('/look');

    expect(driver.snapshot().live).toBeNull();
    expect(texts(driver)).toContain('Stopped.');
  });

  // The clause's own comparison: the same action, the same elapsed span, two
  // drivers. The REPL side is built the way play-cli builds it — a context
  // with `driving`, runLine, and the run ticked with what the wall clock said.
  it('reaches the state the REPL live path reaches over the same elapsed span', () => {
    const spans = [200, 200, 750, 3_000, 200];

    const session = startSession(loadUniverseWithDiagnostics([WORKSHOP]).registry);
    const repl = newContext(session, view(session), { driving: true });
    const armed = runLine(repl, '1');
    for (const span of spans) armed.live!.tick(span);
    armed.live!.end(false);

    const ticker = handTicker();
    const driver = createDriver([WORKSHOP], { ticker });
    driver.choose(1);
    for (const span of spans) ticker.advance(span);

    expect(shown(driver)).toEqual(repl.view);
  });

  it('carries the fault when a universe cannot open, rather than throwing at the mount', () => {
    const driver = createDriver([{ name: 'empty', text: '# info empty\nversion: 0.0.0\npack: test\n' }]);

    expect(driver.snapshot().view).toBeNull();
    expect(driver.snapshot().fault).toBe('no # location is marked starting, so a new game has nowhere to begin');
    expect(texts(driver)).toEqual([driver.snapshot().fault]);
  });
});
