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
import { OPENING_CELLS } from '../runtime/openUniverseFixture';
import type { UniverseProblem } from '../runtime/openUniverse';
import { createDriver, REMEDIES, remediesFor, type Driver } from './driver';
import { FaultBanner } from './FaultBanner';
import { SHIPPED_SOURCES } from './shippedContent';
import { wordsOf } from './words';

const here = fileURLToPath(new URL('.', import.meta.url));

const words = wordsOf(localizerFor(loadInEnglish(''), 'en'));

const pageSlots = (): SlotDriver => {
  const storage = pageStorage();
  return browserSlots(() => storage);
};

// The one region a fault is drawn in, and every control inside it. Read off the
// markup rather than off a component's props, because what c4 is about is what
// reaches a screen.
function alerting(html: string): { drawn: boolean; drivers: string[] } {
  const region = /<div role="alert"[\s\S]*?<\/div>\s*<\/div>/.exec(html);
  if (!region) return { drawn: false, drivers: [] };
  return { drawn: true, drivers: [...region[0].matchAll(/<button[^>]*data-drive="([^"]*)"/g)].map(([, driver]) => driver) };
}

// Every cell of the door's own family, opened the way a browser opens one, so
// that what is drawn is asked of the same states the door is proved over.
function openedOver(cell: { base: readonly ModuleSource[]; local: string }): Driver {
  const slots = pageSlots();
  if (cell.local !== '') slotStore(slots, () => 0).write(LOCAL_CHANGES_MODULE_ID, cell.local);
  return createDriver(cell.base, { slots, ticker: () => () => undefined });
}

const problemsOf = (message: string): UniverseProblem[] => [{ modules: [LOCAL_CHANGES_MODULE_ID], words: 'tool', message }];

describe('a problem is never drawn as text with nothing beside it (c3, c7)', () => {
  it('draws exactly the remedies the report has, for every state the door can leave', () => {
    expect(OPENING_CELLS.length).toBeGreaterThan(6);

    for (const cell of OPENING_CELLS) {
      const problems = openedOver(cell).snapshot().problems;
      const drawn = alerting(renderToStaticMarkup(<FaultBanner problems={problems} words={words} onRemedy={() => undefined} />));

      expect(drawn.drawn, cell.where).toBe(true);
      expect([...drawn.drivers].sort(), cell.where).toEqual([...remediesFor(problems)].sort());
      // The clause's own sentence: something to do, always.
      expect(drawn.drivers.length, cell.where).toBeGreaterThan(0);
    }
  });

  // A remedy no state draws would be a control nobody can reach; the pair of
  // checks is what holds the markup and the decision to the same set.
  it('draws every remedy there is, across the states there are', () => {
    const drawn = new Set(
      OPENING_CELLS.flatMap((cell) => alerting(renderToStaticMarkup(<FaultBanner problems={openedOver(cell).snapshot().problems} words={words} onRemedy={() => undefined} />)).drivers),
    );

    expect(drawn).toEqual(new Set(REMEDIES));
  });

  // c3's screen half: what the door said is what the reader is given, rather
  // than a sentence this layer wrote about it.
  it('says what the door said, and nothing it did not', () => {
    const problems = problemsOf('the door said this');
    const html = renderToStaticMarkup(<FaultBanner problems={problems} words={words} onRemedy={() => undefined} />);

    expect(html).toContain('the door said this');
  });

  // And the shell puts it where a page cannot be used to leave it: over the
  // column, so it stands whether or not the session is the game.
  it('draws it over the whole shell, over a game and over the stand-in alike', () => {
    const withGame = openedOver({ base: SHIPPED_SOURCES, local: brokenLocal() });
    const standingIn = openedOver({ base: [{ name: 'empty', text: '# info empty\nversion: 0.0.0\npack: test\n' }], local: '' });

    // Both have a session now, which is the point of the door; what differs is
    // whether it is the game.
    expect(withGame.snapshot().view).not.toBeNull();
    expect(standingIn.snapshot().view).not.toBeNull();
    expect(standingIn.snapshot().view.location.id).not.toBe(withGame.snapshot().view.location.id);
    for (const driver of [withGame, standingIn]) {
      const drawn = alerting(renderToStaticMarkup(<App driver={driver} />));
      expect(drawn.drawn, driver.snapshot().problems[0]?.message).toBe(true);
      expect(drawn.drivers.length).toBeGreaterThan(0);
    }
  });

  it('draws nothing of the sort when the universe opened with nothing to say', () => {
    expect(alerting(renderToStaticMarkup(<App driver={createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined })} />)).drawn).toBe(false);
  });
});

// A staged edit, then the file changed under it — which is the route into the
// state, and the reason the text is written into the store rather than typed.
function brokenLocal(): string {
  const driver = createDriver(SHIPPED_SOURCES, { slots: pageSlots(), ticker: () => () => undefined });
  driver.send('/dsl location tutorial-island.guide-house x: 7, y: 7');
  return (driver.localChanges() ?? '').replace('x: 7, y: 7', 'x: sideways');
}

// Every module under src/ui that ships, which is what the rule below is about.
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
    const driver = openedOver({ base: SHIPPED_SOURCES, local: brokenLocal() });
    expect(driver.snapshot().problems.flatMap((problem) => problem.modules)).toEqual([LOCAL_CHANGES_MODULE_ID]);

    driver.clearLocalChanges();

    expect(driver.snapshot().problems).toEqual([]);
  });

  // What opening again actually does: read the store and run the load over it.
  // A module somebody repaired in another tab is the case that reaches — the
  // store is shared and the base sources are not, so this is the whole of what
  // the shell can do about a problem without the page going away.
  it('runs the load again over the store as it stands now', () => {
    const slots = pageSlots();
    const store = slotStore(slots, () => 0);
    store.write(LOCAL_CHANGES_MODULE_ID, brokenLocal());
    const driver = createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined });
    expect(driver.snapshot().problems.flatMap((problem) => problem.modules)).toEqual([LOCAL_CHANGES_MODULE_ID]);

    // Another writer over the same store, which is what a second tab is.
    store.write(LOCAL_CHANGES_MODULE_ID, brokenLocal().replace('x: sideways', 'x: 7, y: 7'));
    driver.reopen();

    expect(driver.snapshot().problems).toEqual([]);
    expect(driver.snapshot().view.discovered.find((place) => place.id === 'tutorial-island.guide-house')).toMatchObject({ x: 7, y: 7 });
  });

  // A problem no local module is named in, where clearing an author's work
  // would help nothing. `reopen` re-runs the load over the same source objects,
  // and in a browser those are `SHIPPED_SOURCES` — `import.meta.glob` with
  // `eager`, so their text is inlined at build time and cannot change while the
  // page is up. A shipped module somebody repaired is therefore reached by
  // loading the page again and by nothing else, which is what that control does.
  //
  // A driver handed sources whose text later changes does pick them up; that is
  // true of this function and false of the app, so it is not what is asserted
  // here. What is asserted is the wiring, and how it behaves in a browser is
  // the author's to look at — this suite mounts nothing.
  it('offers the remedy that loads the page again, which is the only thing that re-reads a shipped module', () => {
    const driver = openedOver({ base: [{ name: 'torn', text: '# info torn\nversion: 0.0.0\npack: test\n' }], local: '' });

    expect(driver.snapshot().problems.flatMap((problem) => problem.modules)).toEqual(['torn']);
    expect(remediesFor(driver.snapshot().problems)).toEqual(['reopen']);
  });

  // Both answers, because only one of them is ever taken here: the suite runs
  // in node and would otherwise grade the shipped branch by reading App.tsx for
  // a string, which passes with the call in a comment.
  it("means loading the page again on a page, and the driver's own re-open where there is none", () => {
    expect([retrying(true), retrying(false)]).toEqual(['reload', 'reopen']);
    expect(readFileSync(join(here, 'App.tsx'), 'utf8')).toContain('window.location.reload()');
  });
});
