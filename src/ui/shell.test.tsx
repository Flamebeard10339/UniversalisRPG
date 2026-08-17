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

  // The remedy that stands wherever the trouble is. A shipped module is not
  // this app's to repair, so what an author does about one is fix the file and
  // come back — and this is that, in the one form the shell can offer: the
  // sources and the store are read again rather than remembered.
  it('opens again over the sources as they stand, so a repaired module is picked up', () => {
    const torn: ModuleSource = { name: 'torn', text: '# info torn\nversion: 0.0.0\npack: test\n' };
    const driver = openedOver([torn], '');

    expect(driver.snapshot().fault).toMatchObject({ at: 'base' });
    expect(remediesFor(driver.snapshot().fault!)).toContain('reopen');

    torn.text = '# info torn\nversion: 0.0.0\npack: test\n\n# location hall\nx: 0, y: 0\nstarting\n';
    driver.reopen();

    expect(driver.snapshot().fault).toBeNull();
    expect(driver.snapshot().view?.location.id).toBe('torn.hall');
  });
});
