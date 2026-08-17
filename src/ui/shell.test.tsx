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
import { App } from './App';
import { browserSlots } from './browserStore';
import { createDriver, FAULT_AT, REMEDIES, remediesFor, type Driver, type Fault } from './driver';
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

const faults: Fault[] = FAULT_AT.map((at) => ({ at, why: `the ${at} would not load` }));

describe('a fault is never drawn as text with nothing beside it (c4, c5)', () => {
  it('draws exactly the remedies the fault has, for every fault there is', () => {
    expect(faults.length).toBeGreaterThan(1);

    for (const fault of faults) {
      const drawn = alerting(renderToStaticMarkup(<FaultBanner fault={fault} words={words} onRemedy={() => undefined} />));

      expect(drawn.drawn, fault.at).toBe(true);
      expect([...drawn.drivers].sort(), fault.at).toEqual([...remediesFor(fault)].sort());
      // The clause's own sentence: something to do, always.
      expect(drawn.drivers.length, fault.at).toBeGreaterThan(0);
    }
  });

  // A remedy no fault draws would be a control nobody can reach; the pair of
  // checks is what holds the markup and the decision to the same set.
  it('draws every remedy there is, across the faults there are', () => {
    const drawn = new Set(faults.flatMap((fault) => alerting(renderToStaticMarkup(<FaultBanner fault={fault} words={words} onRemedy={() => undefined} />)).drivers));

    expect(drawn).toEqual(new Set(REMEDIES));
  });

  // And the shell puts it where a page cannot be used to leave it: over the
  // column, so it stands whether or not there is a session under it.
  it('draws it over the whole shell, with a session and without one', () => {
    const withSession = openedOver(SHIPPED_SOURCES, brokenLocal());
    const without = openedOver([{ name: 'empty', text: '# info empty\nversion: 0.0.0\npack: test\n' }], '');

    expect(withSession.snapshot().view).not.toBeNull();
    expect(without.snapshot().view).toBeNull();
    for (const driver of [withSession, without]) {
      const drawn = alerting(renderToStaticMarkup(<App driver={driver} />));
      expect(drawn.drawn, driver.snapshot().fault?.at).toBe(true);
      expect(drawn.drivers.length).toBeGreaterThan(0);
    }
  });

  it('draws nothing of the sort when the session opened', () => {
    expect(alerting(renderToStaticMarkup(<App driver={createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined })} />)).drawn).toBe(false);
  });
});

function openedOver(sources: readonly ModuleSource[], local: string): Driver {
  const slots = pageSlots();
  if (local !== '') slotStore(slots, () => 0).write(LOCAL_CHANGES_MODULE_ID, local);
  return createDriver(sources, { slots, ticker: () => () => undefined });
}

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

describe('taking a remedy changes the state it was taken from (c4)', () => {
  it('clears the local module, and the session is the one a first launch opens', () => {
    const driver = openedOver(SHIPPED_SOURCES, brokenLocal());
    expect(driver.snapshot().fault).toMatchObject({ at: 'local' });

    driver.clearLocalChanges();

    expect(driver.snapshot().fault).toBeNull();
  });

  // What opening again actually does: read the store and run the load over it.
  // A module somebody repaired in another tab is the case that reaches — the
  // store is shared and the base sources are not, so this is the whole of what
  // the shell can do about a fault without the page going away.
  it('runs the load again over the store as it stands now', () => {
    const slots = pageSlots();
    const store = slotStore(slots, () => 0);
    store.write(LOCAL_CHANGES_MODULE_ID, brokenLocal());
    const driver = createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined });
    expect(driver.snapshot().fault).toMatchObject({ at: 'local' });

    // Another writer over the same store, which is what a second tab is.
    store.write(LOCAL_CHANGES_MODULE_ID, brokenLocal().replace('x: sideways', 'x: 7, y: 7'));
    driver.reopen();

    expect(driver.snapshot().fault).toBeNull();
    expect(driver.snapshot().view?.discovered.find((place) => place.id === 'tutorial-island.guide-house')).toMatchObject({ x: 7, y: 7 });
  });

  // The base fault, where nothing the driver can do helps. `reopen` re-runs the
  // load over the same source objects, and in a browser those are
  // `SHIPPED_SOURCES` — `import.meta.glob` with `eager`, so their text is
  // inlined at build time and cannot change while the page is up. A shipped
  // module somebody repaired is therefore reached by loading the page again and
  // by nothing else, which is what the control over a base fault does.
  //
  // A driver handed sources whose text later changes does pick them up; that is
  // true of this function and false of the app, so it is not what is asserted
  // here. What is asserted is the wiring, and how it behaves in a browser is
  // the author's to look at — this suite mounts nothing.
  it('offers the remedy that loads the page again, which is the only thing that re-reads a shipped module', () => {
    const driver = openedOver([{ name: 'torn', text: '# info torn\nversion: 0.0.0\npack: test\n' }], '');

    expect(driver.snapshot().fault).toMatchObject({ at: 'base' });
    expect(remediesFor(driver.snapshot().fault!)).toEqual(['reopen']);
    expect(readFileSync(join(here, 'App.tsx'), 'utf8')).toContain('window.location.reload()');
  });
});
