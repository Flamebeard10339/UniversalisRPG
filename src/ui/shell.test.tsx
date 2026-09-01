import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { localizerFor } from '../runtime/localized';
import type { ModuleSource } from '../content/universe';
import { slotStore, type SlotDriver } from '../runtime/store';
import { pageStorage } from './agent/pageStorage';
import { App, retrying } from './App';
import { browserSlots } from './browserStore';
import { clearingReaches, OPENING_CELLS } from '../runtime/openUniverseFixture';
import type { UniverseProblem } from '../runtime/openUniverse';
import { createDriver, REMEDIES, type Driver } from './driver';
import { FaultBanner } from './FaultBanner';
import { mapFixtureFor } from '../runtime/mapFixture';
import { wordsOf } from './words';
import { fixtureSources } from '../content/worldFixture';

const here = fileURLToPath(new URL('.', import.meta.url));

const words = wordsOf(localizerFor(loadInEnglish(''), 'en'));

const { MOVED_PLACE, MOVED_TO, MOVED_TO_FIELDS, MOVE_LINE } = mapFixtureFor(fixtureSources());

const pageSlots = (): SlotDriver => {
  const storage = pageStorage();
  return browserSlots(() => storage);
};

function alerting(html: string): { drawn: boolean; drivers: string[] } {
  const region = /<div role="alert"[\s\S]*?<\/div>\s*<\/div>/.exec(html);
  if (!region) return { drawn: false, drivers: [] };
  return { drawn: true, drivers: [...region[0].matchAll(/<button[^>]*data-drive="([^"]*)"/g)].map(([, driver]) => driver) };
}

function openedOver(cell: { base: readonly ModuleSource[]; local: string }): Driver {
  const slots = pageSlots();
  if (cell.local !== '') slotStore(slots, () => 0).write(LOCAL_CHANGES_MODULE_ID, cell.local);
  return createDriver(cell.base, { slots, ticker: () => () => undefined });
}

const problemsOf = (message: string): UniverseProblem[] => [{ modules: [LOCAL_CHANGES_MODULE_ID], words: 'tool', message }];

const banner = (driver: Driver): { drawn: boolean; drivers: string[] } => alerting(renderToStaticMarkup(<App driver={driver} />));

describe('a problem is never drawn as text with nothing beside it (c3, c7)', () => {
  it('draws exactly the remedies the report has, for every state the door can leave', () => {
    expect(OPENING_CELLS.length).toBeGreaterThan(6);
    let offered = 0;

    for (const cell of OPENING_CELLS) {
      const drawn = banner(openedOver(cell));

      expect(drawn.drawn, cell.where).toBe(true);
      expect(drawn.drivers, cell.where).toContain('reopen');
      expect(drawn.drivers.includes('clear-local'), cell.where).toBe(clearingReaches(cell));
      if (clearingReaches(cell)) offered += 1;
    }

    expect(offered).toBeGreaterThan(0);
    expect(offered).toBeLessThan(OPENING_CELLS.length);
  });

  it('draws every remedy there is, across the states there are', () => {
    const drawn = new Set(OPENING_CELLS.flatMap((cell) => banner(openedOver(cell)).drivers));

    expect(drawn).toEqual(new Set(REMEDIES));
  });

  it('says what the door said, and nothing it did not', () => {
    const problems = problemsOf('the door said this');
    const html = renderToStaticMarkup(<FaultBanner problems={problems} remedies={REMEDIES} words={words} onRemedy={() => undefined} />);

    expect(html).toContain('the door said this');
  });

  it('draws it over the whole shell, over a game and over the stand-in alike', () => {
    const withGame = openedOver({ base: fixtureSources(), local: brokenLocal() });
    const standingIn = openedOver({ base: [{ name: 'empty', text: '# info empty\nversion: 0.0.0\npack: test\n' }], local: '' });

    expect(standingIn.snapshot().view.location.id).not.toBe(withGame.snapshot().view.location.id);
    for (const driver of [withGame, standingIn]) {
      const drawn = alerting(renderToStaticMarkup(<App driver={driver} />));
      expect(drawn.drawn, driver.snapshot().problems[0]?.message).toBe(true);
      expect(drawn.drivers.length).toBeGreaterThan(0);
    }
  });

  it('draws nothing of the sort when the universe opened with nothing to say', () => {
    expect(alerting(renderToStaticMarkup(<App driver={createDriver(fixtureSources(), { ticker: () => () => undefined })} />)).drawn).toBe(false);
  });
});

function brokenLocal(): string {
  const driver = createDriver(fixtureSources(), { slots: pageSlots(), ticker: () => () => undefined });
  driver.send(MOVE_LINE);
  return (driver.localChanges() ?? '').replace(MOVED_TO_FIELDS, 'x: sideways');
}

function shippedModules(directory: string, prefix: string): Array<{ file: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'agent' ? [] : shippedModules(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, text: readFileSync(path, 'utf8') }];
  });
}

export const SHIPPED_UI = shippedModules(here, 'src/ui');

describe('taking a remedy changes the state it was taken from (c7)', () => {
  it('clears the local module, and the session is the one a first launch opens', () => {
    const driver = openedOver({ base: fixtureSources(), local: brokenLocal() });
    expect(driver.snapshot().problems.flatMap((problem) => problem.modules)).toEqual([LOCAL_CHANGES_MODULE_ID]);

    driver.clearLocalChanges();

    expect(driver.snapshot().problems).toEqual([]);
  });

  it('runs the load again over the store as it stands now', () => {
    const slots = pageSlots();
    const store = slotStore(slots, () => 0);
    store.write(LOCAL_CHANGES_MODULE_ID, brokenLocal());
    const driver = createDriver(fixtureSources(), { slots, ticker: () => () => undefined });
    expect(driver.snapshot().problems.flatMap((problem) => problem.modules)).toEqual([LOCAL_CHANGES_MODULE_ID]);

    store.write(LOCAL_CHANGES_MODULE_ID, brokenLocal().replace('x: sideways', MOVED_TO_FIELDS));
    driver.reopen();

    expect(driver.snapshot().problems).toEqual([]);
    expect(driver.snapshot().view.discovered.find((place) => place.id === MOVED_PLACE)).toMatchObject(MOVED_TO);
  });

  it('offers the remedy that loads the page again, which is the only thing that re-reads a shipped module', () => {
    const driver = openedOver({ base: [{ name: 'torn', text: '# info torn\nversion: 0.0.0\npack: test\n\n# item\n' }], local: '' });

    expect(driver.snapshot().problems.flatMap((problem) => problem.modules)).toEqual(['torn']);
    expect(driver.snapshot().remedies).toEqual(['reopen']);
  });

  it("means loading the page again on a page, and the driver's own re-open where there is none", () => {
    expect([retrying(true), retrying(false)]).toEqual(['reload', 'reopen']);
    expect(readFileSync(join(here, 'App.tsx'), 'utf8')).toContain('window.location.reload()');
  });
});
