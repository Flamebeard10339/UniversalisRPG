import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { loadUniverseWithDiagnostics } from '../content/load';
import type { ModuleSource } from '../content/universe';
import { COMMANDS, newContext, runLine, type CommandSpec } from '../runtime/command';
import { DEV_SLOT, DEV_SNAPSHOT_SLOT, PLAYER_SLOT } from '../runtime/saveSlots';
import { serializeSession, startSession, view } from '../runtime/session';
import { slotStore, type SlotDriver } from '../runtime/store';
import { pageStorage } from './agent/pageStorage';
import { App } from './App';
import { browserSlots } from './browserStore';
import { devLine, devRefusal, speedLine, tappedPlace } from './devMode';
import { createDriver, type Driver } from './driver';
import { SHIPPED_SOURCES } from './shippedContent';
import { LAYERS, OPENING, toLayer, toSubpage } from './nav';
import { SHIPPED_UI } from './shell.test';

const here = fileURLToPath(new URL('.', import.meta.url));

const DEV_STRIP = 'role="status"';

const pageSlots = (): SlotDriver => {
  const storage = pageStorage();
  return browserSlots(() => storage);
};

function playing(): { driver: Driver; slots: SlotDriver } {
  const slots = pageSlots();
  return { driver: createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined }), slots };
}

const said = (driver: Driver): string[] => driver.snapshot().transcript.entries.map((entry) => String(entry.text));

const MARKED: readonly CommandSpec[] = COMMANDS.filter((spec) => spec.dev);

const ACTS_ON: Record<string, string> = { '/goto': 'tutorial-island.basement' };

const lineFor = (spec: CommandSpec): string => `${spec.name}${ACTS_ON[spec.name] ? ` ${ACTS_ON[spec.name]}` : ''}`;

const CUT_OFF: ModuleSource = {
  name: 'cut-off',
  text: [
    '# location camp',
    'x: 0, y: 0',
    'starting',
    'adjacent:',
    '  shore',
    'entities:',
    '  signpost',
    '',
    '# location shore',
    'x: 1, y: 0',
    '',
    '# location isle',
    'x: 40, y: 0',
    'adjacent:',
    '  cove',
    '',
    '# location cove',
    'x: 41, y: 0',
    '',
    '# entity signpost',
    'title: Signpost',
    'read the signpost:',
    '  discover: isle',
    '',
  ].join('\n'),
};

function cutOff(): Driver {
  const driver = createDriver([engineLocale(), CUT_OFF], { slots: pageSlots(), ticker: () => () => undefined });
  driver.send('use: entity.signpost.read-the-signpost');
  const drawn = driver.snapshot().view.discovered.map((place) => place.id);
  if (!drawn.includes('isle')) throw new Error('the far place is not on the map, so there is nothing to teleport to');
  return driver;
}

describe('one answer gates every dev-only control (c6)', () => {
  it('marks and gates in one statement, so nothing else in the tree can write the mark', () => {
    const writing = SHIPPED_UI.filter((module) => module.text.includes('data-dev'));

    expect(writing.map((module) => module.file)).toEqual(['src/ui/DevOnly.tsx']);
  });

  it("draws no dev-only surface while the session is the player's, and several once it is not", () => {
    const { driver } = playing();

    const asPlayer = renderToStaticMarkup(<App driver={driver} />);
    driver.send(devLine(true));
    const asDeveloper = renderToStaticMarkup(<App driver={driver} />);

    expect(asPlayer).not.toContain('data-dev');
    expect([...asDeveloper.matchAll(/data-dev=/g)].length).toBeGreaterThan(1);
  });

  it("says whose session this is from every page there is, and says nothing while it is the player's", () => {
    const { driver } = playing();
    const everywhere = LAYERS.flatMap((layer, at) => layer.subpages.map((subpage) => toSubpage(toLayer(OPENING, at), at, subpage.id)));
    expect(everywhere.length).toBeGreaterThan(4);

    for (const where of everywhere) {
      expect(renderToStaticMarkup(<App driver={driver} opening={where} />), `${LAYERS[where.layer].id}`).not.toContain(DEV_STRIP);
    }

    driver.send(devLine(true));

    for (const where of everywhere) {
      expect(renderToStaticMarkup(<App driver={driver} opening={where} />), `${LAYERS[where.layer].id}`).toContain(DEV_STRIP);
    }
  });

  it('keeps the editing page out of the tab bar until the session is a developer', () => {
    const { driver } = playing();

    const asPlayer = renderToStaticMarkup(<App driver={driver} />);
    driver.send(devLine(true));
    const asDeveloper = renderToStaticMarkup(<App driver={driver} />);

    expect(asPlayer).not.toContain('data-subpage="edit"');
    expect(asPlayer).toContain('data-subpage="settings"');
    expect(asDeveloper).toContain('data-subpage="edit"');
  });

  it('leaves the command line where the session is played, so the mode takes no line away', () => {
    const { driver } = playing();
    const asPlayer = renderToStaticMarkup(<App driver={driver} />);

    driver.send('/look');

    expect(asPlayer).toContain('data-drive="send"');
    expect(said(driver).some((line) => line.includes('dev power'))).toBe(false);
  });

  it('draws the strip through the same gate the surfaces go through', () => {
    expect(readFileSync(join(here, 'DevBanner.tsx'), 'utf8')).toContain('<DevOnly dev={dev}>');
  });

  it('reads the mode off the session rather than holding it, so both halves move together', () => {
    const { driver } = playing();
    expect(driver.snapshot().dev).toBe(false);

    driver.send(devLine(true));
    expect(driver.snapshot().dev).toBe(true);
    driver.send('/slots');
    expect(said(driver).some((line) => line.includes('dev mode on'))).toBe(true);

    driver.send(devLine(false));
    expect(driver.snapshot().dev).toBe(false);
  });
});

describe("the toggle is the dev slot's entry, not a second one (c7)", () => {
  it('spells the line the REPL types, and nothing under src/ui names the slot machinery', () => {
    expect([devLine(true), devLine(false)]).toEqual(['/dev on', '/dev off']);

    for (const module of SHIPPED_UI) {
      for (const name of ['enterDev', 'leaveDev', 'devSnapshot', 'liveSlot', 'DEV_SLOT', 'DEV_SNAPSHOT_SLOT']) {
        expect(module.text, `${module.file} names ${name}`).not.toContain(name);
      }
      expect(module.text, `${module.file} assigns a dev flag`).not.toMatch(/\.dev\s*=[^=]/);
    }
  });

  it('takes the snapshot on the way in and puts the session back on the way out', () => {
    const { driver, slots } = playing();
    const store = slotStore(slots, () => 0);
    driver.send('/dsl location tutorial-island.guide-house x: 7, y: 7');
    const before = driver.serialized();

    driver.send(devLine(true));
    expect(store.read(DEV_SNAPSHOT_SLOT)).not.toBeNull();
    driver.send('/wait 30');
    expect(driver.serialized()).not.toBe(before);
    driver.send('/save');

    driver.send(devLine(false));
    expect(driver.serialized()).toBe(before);
    expect(store.read(DEV_SNAPSHOT_SLOT)).toBeNull();
    expect(store.read(DEV_SLOT)).not.toBeNull();
    expect(store.read(PLAYER_SLOT)).toBeNull();
  });

  it('leaves the staged edits where they were, because they are not a game', () => {
    const { driver } = playing();
    driver.send(devLine(true));
    driver.send('/dsl location tutorial-island.guide-house x: 7, y: 7');
    const staged = driver.localChanges();
    expect(staged).toContain('x: 7, y: 7');

    driver.send(devLine(false));

    expect(driver.localChanges()).toBe(staged);
    expect(driver.snapshot().view.discovered.find((place) => place.id === 'tutorial-island.guide-house')).toMatchObject({ x: 7, y: 7 });
  });
});

describe('every dev power is a line the shared command table parses (c8)', () => {
  it('marks at least one, and every mark is a line both drivers can run', () => {
    expect(MARKED.length).toBeGreaterThan(0);

    const { driver } = playing();
    driver.send(devLine(true));
    const session = startSession(loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry);
    const repl = newContext(session, view(session));

    for (const spec of MARKED) {
      const before = said(driver).length;
      driver.send(lineFor(spec));
      expect(said(driver).slice(before).some((line) => line.includes('dev power')), spec.name).toBe(false);
      expect(runLine(repl, lineFor(spec)).output.filter((out) => out.kind === 'message' && out.tone === 'error'), spec.name).toEqual([]);
    }
  });
});

describe('tapping a place has one handler and one decision (c9)', () => {
  it("spells a choice while the session is the player's and a teleport once it is not", () => {
    expect(tappedPlace(false, 'somewhere', 3)).toBe('3');
    expect(tappedPlace(false, 'somewhere', null)).toBeNull();
    expect(tappedPlace(true, 'somewhere', 3)).toBe('/goto somewhere');
    expect(tappedPlace(true, 'somewhere', null)).toBe('/goto somewhere');
  });

  it('reaches a place no road reaches, and leaves the state an arrival leaves', () => {
    const driver = cutOff();
    driver.send(devLine(true));
    const far = 'isle';
    expect(driver.snapshot().view.choices.some((choice) => choice.leadsTo === far)).toBe(false);
    expect(tappedPlace(false, far, null)).toBeNull();

    driver.send(tappedPlace(true, far, null)!);

    const after = driver.snapshot().view;
    expect(after.location.id).toBe(far);
    expect(after.discovered.map((place) => place.id)).toContain(far);
    for (const road of after.choices.flatMap((choice) => (choice.leadsTo ? [choice.leadsTo] : []))) {
      expect(after.discovered.map((place) => place.id), road).toContain(road);
    }
  });

  it("sets off for a place exactly as a choice does while the session is the player's", () => {
    const driver = cutOff();
    const twin = cutOff();
    const at = driver.snapshot().view;
    const road = at.choices.findIndex((choice) => choice.kind === 'travel');
    expect(road, 'the island offers no walk from where it opens').toBeGreaterThanOrEqual(0);

    driver.send(tappedPlace(false, at.choices[road].leadsTo!, road + 1)!);
    twin.choose(road + 1);

    expect(driver.serialized()).toBe(twin.serialized());
    expect(driver.snapshot().live).toEqual(twin.snapshot().live);
  });
});

describe('there is one time multiplier (c10)', () => {
  it('writes the dial /speed turns and reads the same value back', () => {
    const { driver } = playing();
    driver.send(devLine(true));

    driver.send(speedLine('4'));
    expect(driver.snapshot().speed).toBe(4);
    driver.send('/speed 2.5');
    expect(driver.snapshot().speed).toBe(2.5);
  });

  it('hands over what was typed and lets the command refuse it', () => {
    const { driver } = playing();
    driver.send(devLine(true));
    driver.send(speedLine('4'));

    for (const typed of ['nope', '', '0', '-2']) {
      driver.send(speedLine(typed));
      expect(said(driver)[said(driver).length - 1], typed).toContain('/speed requires a positive number');
      expect(driver.snapshot().speed, typed).toBe(4);
    }
  });

  it('declares no second multiplier in src/ui, no default and no clamp', () => {
    for (const module of SHIPPED_UI) {
      expect(module.text, `${module.file} declares a multiplier of its own`).not.toMatch(/\bspeed\b[^\n]*[:=]\s*-?\d/i);
      expect(module.text, `${module.file} clamps a multiplier of its own`).not.toMatch(/\bspeed\b[^\n]*(?:Math\.(?:min|max)|clamp)/i);
    }
  });
});

describe('with dev off, nothing changes (c11)', () => {
  it('refuses every dev power and says so, over the marks rather than a list', () => {
    expect(MARKED.length).toBeGreaterThan(0);
    const { driver, slots } = playing();
    const before = driver.serialized();

    for (const spec of MARKED) {
      driver.send(lineFor(spec));
      const last = said(driver)[said(driver).length - 1];
      expect(last, spec.name).toContain(spec.name);
      expect(last, spec.name).toContain('dev power');
    }

    expect(driver.serialized()).toBe(before);
    expect(slotStore(slots, () => 0).list()).not.toContain(DEV_SLOT);
    expect(slotStore(slots, () => 0).list()).not.toContain(DEV_SNAPSHOT_SLOT);
  });

  it('says nothing about a line that names no dev power', () => {
    for (const line of ['/look', '', '1', '/local list', 'travel: tutorial-island.basement']) {
      expect(devRefusal(line, false), line).toBeNull();
    }
    for (const spec of MARKED) expect(devRefusal(spec.name, true), spec.name).toBeNull();
  });

  it('plays a whole session with no dev slot anywhere in the store', () => {
    const { driver, slots } = playing();
    driver.send('/autosave 1');
    driver.send('/save');
    driver.send('/look');
    driver.send('/restore');

    expect(driver.snapshot().dev).toBe(false);
    expect(slotStore(slots, () => 0).list().filter((name) => name.startsWith('dev'))).toEqual([]);
  });

  it('leaves the CLI ungated, which is what every # test goes through', () => {
    const session = startSession(loadInEnglish('# location camp\nx: 0, y: 0\nstarting\n\n# location isle\nx: 9, y: 0\n'));
    const repl = newContext(session, view(session));
    const before = serializeSession(session);

    const result = runLine(repl, '/goto isle');

    expect(result.output.filter((out) => out.kind === 'message' && out.tone === 'error')).toEqual([]);
    expect(serializeSession(session)).not.toBe(before);
  });
});
