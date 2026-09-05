import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureSources } from '../content/worldFixture';
import { CARRY_ON } from '../runtime/modals';
import { UNDER_WAY_LIMIT_HOURS } from '../runtime/runtime';
import { memoryDriver, type SlotDriver } from '../runtime/store';
import { App } from './App';
import { createDriver, type Driver } from './driver';
import { speedLine } from './devMode';

const DIGGING = 'use:location.fixture-town.green.dig';

const AN_HOUR_MS = 60 * 60 * 1000;

const AN_HOUR_S = 60 * 60;

const noTicks = (): (() => void) => () => undefined;

const greeting = (driver: Driver): boolean => driver.snapshot().view.modals.some((modal) => modal.name === 'welcome-back');

const said = (driver: Driver): string => driver.snapshot().view.said.map(String).join('\n');

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
  it('greets nobody on a page that was never closed on anything', () => {
    expect(greeting(leftUnderWay(shelved()))).toBe(false);
  });

  it('spends the time away on what was under way, and says what came of it', () => {
    const shelf = shelved();
    const before = leftUnderWay(shelf).snapshot().view;
    shelf.wait(AN_HOUR_MS);

    const back = shelf.open();

    expect(greeting(back), 'the page came back on nothing').toBe(true);
    expect(back.snapshot().view.time - before.time).toBe(AN_HOUR_S);
    expect(said(back)).toContain('Gained');
  });

  it('spends it at the speed the dial was left on, which is what the cap is there to bound', () => {
    const shelf = shelved();
    const before = leftUnderWay(shelf, '16').snapshot().view;
    shelf.wait(AN_HOUR_MS);

    const back = shelf.open();

    expect(back.snapshot().view.time - before.time).toBe(UNDER_WAY_LIMIT_HOURS * AN_HOUR_S);
    expect(said(back)).toContain(String(UNDER_WAY_LIMIT_HOURS));
  });

  it('runs nothing on for a page closed with nothing under way', () => {
    const shelf = shelved();
    shelf.open().send('/save');
    shelf.wait(AN_HOUR_MS);

    expect(greeting(shelf.open())).toBe(false);
  });

  it('is a screen the modal stack draws and answers, not one this page keeps beside it', () => {
    const shelf = shelved();
    leftUnderWay(shelf);
    shelf.wait(AN_HOUR_MS);
    const back = shelf.open();

    const greeted = renderToStaticMarkup(<App driver={back} />);
    back.answer(CARRY_ON, CARRY_ON);
    const carried = renderToStaticMarkup(<App driver={back} />);

    expect(greeted).toContain('role="dialog"');
    expect(greeting(back)).toBe(false);
    expect(carried).not.toContain('role="dialog"');
  });

  it('is still standing for a page that came back and was closed again before it was answered', () => {
    const shelf = shelved();
    leftUnderWay(shelf);
    shelf.wait(AN_HOUR_MS);
    shelf.open().send('/save');

    expect(greeting(shelf.open())).toBe(true);
  });
});
