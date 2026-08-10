import { describe, expect, it } from 'vitest';
import type { PlayView } from '../runtime/session';
import { createDriver, type Driver } from './driver';
import { SHIPPED_SOURCES } from './shippedContent';

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
    driver.answer(asked.key, asked.values![0]);

    expect(shown(driver).modals).toEqual([]);
    expect(shown(driver).choices.map((choice) => choice.id)).toContain('talk:tutorial-island.miki');
  });

  it('carries a free-text answer through with the spaces it was typed with', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    driver.choose(position(driver, 'talk:tutorial-island.miki'));
    const menu = shown(driver).modals[0].options[0];
    driver.answer(menu.key, menu.values![0]);
    driver.choose(position(driver, 'use:entity.tutorial-island.mirror.look in'));

    const name = shown(driver).modals[0].options[0];
    driver.answer(name.key, 'Sir Robin');
    const race = shown(driver).modals[0].options[0];
    driver.answer(race.key, race.values![0]);

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

  it('carries the fault when a universe cannot open, rather than throwing at the mount', () => {
    const driver = createDriver([{ name: 'empty', text: '# info empty\nversion: 0.0.0\npack: test\n' }]);

    expect(driver.snapshot().view).toBeNull();
    expect(driver.snapshot().fault).toBe('no # location is marked starting, so a new game has nowhere to begin');
    expect(texts(driver)).toEqual([driver.snapshot().fault]);
  });
});
