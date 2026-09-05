import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureSources } from '../content/worldFixture';
import { UNDER_WAY_LIMIT_HOURS } from '../runtime/runtime';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { App } from './App';
import { createDriver, type Driver } from './driver';
import { speedLine } from './devMode';

const DIGGING = 'use:location.fixture-town.green.dig';

const AN_HOUR_MS = 60 * 60 * 1000;

const noTicks = (): (() => void) => () => undefined;

function position(driver: Driver, choiceId: string): number {
  const at = driver.snapshot().view.choices.findIndex((choice) => choice.id === choiceId);
  if (at < 0) throw new Error(`no such choice: ${choiceId}`);
  return at + 1;
}

interface Shelved {
  slots: SlotDriver;
  open: () => Driver;
  wait: (ms: number) => void;
}

function shelved(): Shelved {
  const slots = memoryDriver();
  let at = 1_000;
  return {
    slots,
    open: () => createDriver(fixtureSources(), { slots, ticker: noTicks, now: () => at }),
    wait: (ms) => void (at += ms),
  };
}

function leftUnderWay(shelf: Shelved, speed?: string): Driver {
  const driver = shelf.open();
  if (speed) driver.send(speedLine(speed));
  driver.choose(position(driver, DIGGING));
  if (driver.snapshot().view.action === null) throw new Error('nothing was left under way, so every claim below holds vacuously');
  return driver;
}

describe('the world runs on while the page is closed (c1)', () => {
  it('says nothing about a page that was never closed on anything', () => {
    const shelf = shelved();
    expect(leftUnderWay(shelf).snapshot().away).toBeNull();
  });

  it('spends the time away on what was under way, and says what came of it', () => {
    const shelf = shelved();
    const before = leftUnderWay(shelf).snapshot().view;
    shelf.wait(AN_HOUR_MS);

    const back = shelf.open();
    const away = back.snapshot().away;

    expect(away, 'the page came back on nothing').not.toBeNull();
    expect(away!.awayMs).toBe(AN_HOUR_MS);
    expect(away!.ranMs).toBe(AN_HOUR_MS);
    expect(away!.capped).toBe(false);
    expect(away!.lines.length).toBeGreaterThan(0);
    expect(back.snapshot().view.time).toBeGreaterThan(before.time);
  });

  it('spends it at the speed the dial was left on, which is what the cap is there to bound', () => {
    const shelf = shelved();
    leftUnderWay(shelf, '16');
    shelf.wait(AN_HOUR_MS);

    const away = shelf.open().snapshot().away;

    expect(away!.capped).toBe(true);
    expect(away!.ranMs).toBe(UNDER_WAY_LIMIT_HOURS * AN_HOUR_MS);
  });

  it('runs nothing on for a page closed with nothing under way', () => {
    const shelf = shelved();
    shelf.open().send('/save');
    shelf.wait(AN_HOUR_MS);

    expect(shelf.open().snapshot().away).toBeNull();
  });

  it('draws the screen until it is answered, and nothing once it is', () => {
    const shelf = shelved();
    leftUnderWay(shelf);
    shelf.wait(AN_HOUR_MS);
    const back = shelf.open();

    const greeted = renderToStaticMarkup(<App driver={back} />);
    back.dismissAway();
    const carried = renderToStaticMarkup(<App driver={back} />);

    expect(greeted).toContain('away.carry-on');
    expect(back.snapshot().away).toBeNull();
    expect(carried).not.toContain('away.carry-on');
  });
});
