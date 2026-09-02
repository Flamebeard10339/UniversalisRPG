import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { localizerFor, type Params } from '../runtime/localized';
import { referencesIn } from '../content/locale';
import { asLocalized } from '../runtime/localizedFixture';
import { loadUniverseWithDiagnostics } from '../content/load';
import { leaves } from '../runtime/viewLeaves';
import { LIVE_TICK_MS, newContext, runLine, type Ticker } from '../runtime/command';
import { applyDirective, readRoom, sheetOffers, startSession, unreadHere, view, type PlayView } from '../runtime/session';
import { sheetOf } from '../runtime/map';
import { App } from './App';
import { addressable, offeredBy, searchHint } from './authoringSurface';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import { offerCells } from './choices';
import { createDriver, type Driver } from './driver';
import { MapPane } from './MapPane';
import { LocationBanner } from './LocationBanner';
import { StatusBanner } from './StatusBanner';
import { dismissal } from './asking';
import { sectionKey } from './editControls';
import { formatClock } from './format';
import { htmlRuns } from './htmlRuns';
import { devLine, RATES, speedLine } from './devMode';
import { FORGOTTEN, recorded } from './editorMemory';
import { ModalSheet } from './ModalSheet';
import { LABELS, type LabelId } from './labels';
import { wordsOf } from './words';
import { HOME_LAYER, LAYERS, OPENING, toLayer, toSubpage } from './nav';
import { Pager } from './Pager';
import { fixtureSources } from '../content/worldFixture';

const MAPPING = { sections: [], where: FORGOTTEN.map, onWhere: () => undefined, onSend: () => undefined, onNote: () => undefined, dev: false };

const noTicks: Ticker = () => () => undefined;

const ROAST = 'craft:core.rope-from-tails';
const TALK = 'talk:fixture-town.keeper';

const STOCKED = { kind: 'load', save: 'fixture-combat.supplied' } as const;

const readable = (html: string): string[] => htmlRuns(html).filter((run) => /[A-Za-z]/.test(run));

function accountedFor(run: string, permitted: readonly string[]): boolean {
  const longest = [...permitted].filter((word) => /[A-Za-z]/.test(word)).sort((left, right) => right.length - left.length);
  let rest = run;
  while (rest !== '') {
    const word = longest.find((each) => rest.startsWith(each));
    if (word !== undefined) {
      rest = rest.slice(word.length);
      continue;
    }
    if (/^[A-Za-z]/.test(rest)) return false;
    rest = rest.slice(1);
  }
  return true;
}

const onScreen = (runs: readonly string[], text: string): boolean => runs.some((run) => run.includes(text));

const published = (view: PlayView, addresses: ReadonlySet<string>): string[] =>
  leaves(view).flatMap((leaf) => leaf.signatures).filter((each) => !addresses.has(each));

function pagesDrawn(view: PlayView): Record<string, number> {
  return { stats: view.stats.length, skills: view.xp.length, equipment: view.equipment.length, carried: view.carried.length, map: view.discovered.length, settings: view.settings.length };
}

const shellWord = wordsOf(localizerFor(loadInEnglish(''), 'en'));

const SAID = loadInEnglish('');
const NODE: Params = Object.fromEntries(
  Object.values(LABELS).flatMap((key) => referencesIn(SAID.locales.english.get(key) ?? SAID.locales.base.get(key)?.text ?? '').map((name) => [name, asLocalized(name)])),
);

const SHELL_WORDS: readonly string[] = (Object.keys(LABELS) as LabelId[]).map((id) => shellWord(id, NODE));

const sourcesOf = (driver: Driver) => [...driver.baseSources(), { name: LOCAL_CHANGES_MODULE_ID, text: driver.localChanges() ?? '' }];

const authored = (driver: Driver): string[] => addressable(sourcesOf(driver)).map((section) => `# ${section.kind} ${section.address}`);

const addressesOf = (driver: Driver): ReadonlySet<string> => new Set(addressable(sourcesOf(driver)).map((section) => section.address));

const packed = (driver: Driver): string[] => driver.snapshot().mods.flatMap((pack) => [pack.pack, ...pack.modules.map((module) => module.id)]);

const engineRuns = (html: string): string[] => readable(html).filter((run) => !SHELL_WORDS.includes(run));

function whatStoppingSays(): string[] {
  const session = startSession(loadUniverseWithDiagnostics(fixtureSources()).registry);
  applyDirective(session, STOCKED);
  readRoom(session);
  const opening = view(session);
  const armed = runLine(newContext(session, opening, { driving: true }), String(opening.choices.findIndex((choice) => choice.id === ROAST) + 1));
  return armed.live!.end(true).output.flatMap((output) => (output.kind === 'message' ? [output.text] : []));
}

const asking = (html: string): boolean => html.includes('role="dialog"');

const STOREYS = {
  name: 'storeys',
  text: [
    '# info storeys',
    'version: 1.0.0',
    '',
    '# location hall',
    'x: 0, y: 0, z: 0',
    'title: The Hall',
    'adjacent:',
    '  landing',
    '',
    '# location landing',
    'x: 0, y: 0, z: 1',
    'starting',
    'title: The Landing',
    'adjacent:',
    '  hall',
  ].join('\n'),
};

function floors(html: string): { offered: number[]; drawn: number | null } {
  const strip = [...html.matchAll(/<button([^>]*data-floor="(-?\d+)"[^>]*)>/g)];
  const drawn = strip.filter(([, attributes]) => attributes.includes('data-drawn'));
  return { offered: strip.map(([, , floor]) => Number(floor)), drawn: drawn.length === 1 ? Number(drawn[0][2]) : null };
}

function drawnAt(html: string): { x: number; y: number; zoom: number } | null {
  const found = html.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/);
  return found ? { x: Number(found[1]), y: Number(found[2]), zoom: Number(found[3]) } : null;
}

function places(html: string): Array<{ id: string; runs: string[]; disabled: boolean; walk?: string; flashing: boolean; left: number; top: number }> {
  const offset = (attributes: string, edge: string): number => Number(attributes.match(new RegExp(`${edge}:\\s*(-?[\\d.]+)`))?.[1] ?? NaN);
  return [...html.matchAll(/<button([^>]*data-place="([^"]*)"[^>]*)>([\s\S]*?)<\/button>/g)].map(([, attributes, id, inner]) => ({
    id,
    runs: readable(inner),
    disabled: attributes.includes('disabled'),
    walk: attributes.match(/data-walk="([^"]*)"/)?.[1],
    flashing: /\barrived\b/.test(attributes),
    left: offset(attributes, 'left'),
    top: offset(attributes, 'top'),
  }));
}

function skillPanels(html: string): Array<{ id: string; runs: string[]; ring: boolean }> {
  return [...html.matchAll(/<button([^>]*data-skill="([^"]*)"[^>]*)>([\s\S]*?)<\/button>/g)].map(([, , id, inner]) => ({
    id,
    runs: inner
      .replace(/<[^>]*>/g, '\n')
      .split('\n')
      .map((run) => run.trim())
      .filter((run) => run !== ''),
    ring: inner.includes('stroke-dashoffset'),
  }));
}

function stocked(): Driver {
  const driver = createDriver(fixtureSources(), { ticker: noTicks });
  driver.send(`/load ${STOCKED.save}`);
  return read(driver);
}

function read(driver: Driver): Driver {
  for (const choice of unreadHere(driver.snapshot().view)) driver.send(String(choice.id));
  return driver;
}

function position(driver: Driver, choiceId: string): number {
  const at = driver.snapshot().view.choices.findIndex((choice) => choice.id === choiceId);
  if (at < 0) throw new Error(`no such choice: ${choiceId}`);
  return at + 1;
}

const SURVEYED = {
  name: 'surveyed',
  text: [
    '# info surveyed',
    'version: 1.0.0',
    '',
    '# stat might',
    'base: 4',
    '',
    '# skill surveying',
    '',
    '# location workshop',
    'x: 0, y: 0',
    'starting',
    'title: The Workshop',
    'examine: A bench and a lathe.',
    'adjacent:',
    '  overlook',
    '  shed',
    'entities:',
    '  window',
    '',
    '# location overlook',
    'x: 1, y: 0',
    'title: The Overlook',
    'examine: A long view over the valley.',
    'adjacent:',
    '  workshop',
    '  cove',
    '',
    '# location cove',
    'x: 2, y: 0',
    'title: The Cove',
    'examine: Shingle and a drawn-up boat.',
    'adjacent:',
    '  overlook',
    '',
    '# location shed',
    'x: 0, y: 1',
    'title: The Shed',
    'examine: Rakes, and a smell of creosote.',
    'adjacent:',
    '  workshop',
    '',
    '# item ore',
    'examine: Streaked with red.',
    '',
    '# slot mainhand',
    'title: Main Hand',
    '',
    '# item awl',
    'title: Awl',
    'slot: mainhand',
    '',
    '# entity window',
    'title: Window',
    'look out:',
    '  discover: workshop',
    '  discover: overlook',
    '  discover: cove',
    '  discover: shed',
    '  give: 1 ore',
    '  give: 1 awl',
    '  xp: surveying 3',
    '',
  ].join('\n'),
};

const LOOK_OUT = 'use:entity.surveyed.window.look-out';

function everyPageFilled(): Driver {
  const driver = createDriver([engineLocale(), SURVEYED]);
  driver.choose(position(driver, LOOK_OUT));
  driver.open('surveyed.awl');
  driver.answer('verb', 'equip');
  return driver;
}

describe('what the shell puts on the screen', () => {
  it('renders nothing a player can read that the engine did not publish', () => {
    const driver = createDriver(fixtureSources(), { ticker: noTicks });
    driver.send(`/load ${STOCKED.save}`);
    const addresses = addressesOf(driver);
    const engine = new Set<string>(whatStoppingSays());
    let seen = 0;

    const step = (): void => {
      const at = driver.snapshot().view;
      for (const line of published(at, addresses)) engine.add(line);
      const html = renderToStaticMarkup(<App driver={driver} />);

      const runs = readable(html);
      seen += runs.length;
      for (const run of runs) {
        expect(accountedFor(run, [...engine, ...SHELL_WORDS, ...authored(driver), ...packed(driver)]), `"${run}" is on the screen and no engine value produced it`).toBe(true);
      }
    };

    step();
    for (const choice of unreadHere(driver.snapshot().view)) {
      driver.send(String(choice.id));
      step();
    }
    driver.choose(position(driver, TALK));
    step();
    const menu = driver.snapshot().view.modals[0].options[0];
    driver.answer(menu.key, menu.values![0]!.value);
    step();
    for (let guard = 0; guard < 8 && driver.snapshot().view.modals.length > 0; guard += 1) {
      const asked = driver.snapshot().view.modals[0]!.options[0]!;
      driver.answer(asked.key, asked.values![asked.values!.length - 1]!.value);
      step();
    }
    driver.choose(position(driver, ROAST));
    step();
    driver.cancel();
    driver.choose(position(driver, 'use:entity.fixture-town.keeper.examine'));
    step();

    expect(seen).toBeGreaterThan(20);
  });

  it('renders nothing a player can read that the engine did not publish, with a row on every page', () => {
    const driver = everyPageFilled();
    const view = driver.snapshot().view;

    expect(Object.entries(pagesDrawn(view)).filter(([, rows]) => rows === 0)).toEqual([]);

    const engine = new Set<string>(published(view, addressesOf(driver)));
    for (const run of readable(renderToStaticMarkup(<App driver={driver} />))) {
      expect(accountedFor(run, [...engine, ...SHELL_WORDS, ...authored(driver), ...packed(driver)]), `"${run}" is on the screen and no engine value produced it`).toBe(true);
    }
  });

  it('draws the playtest bar while a run is recorded, and nothing when none is', () => {
    const driver = createDriver(fixtureSources());
    const quiet = readable(renderToStaticMarkup(<App driver={driver} />));
    expect(onScreen(quiet, shellWord('playtest-attach'))).toBe(false);

    driver.playtest.start();
    driver.send('/look');
    const recording = readable(renderToStaticMarkup(<App driver={driver} />));

    expect(onScreen(recording, shellWord('playtest-attach')), 'the bar is drawn').toBe(true);
    expect(onScreen(recording, shellWord('playtest-turn', { turn: 1 })), 'it says which turn').toBe(true);
    expect(driver.playtest.written().split('\n')[0]).toMatch(/^# save run-[a-z0-9-]+-start$/);
  });

  it('draws every offer the page is handed, or else the cell that is the way to it', () => {
    const driver = createDriver(fixtureSources());

    const runs = readable(renderToStaticMarkup(<App driver={driver} />));
    const offers = sheetOffers(driver.snapshot().view);

    expect(offers.length, 'the page is handed something, so nothing below holds vacuously').toBeGreaterThan(0);
    expect(offerCells(offers).some((cell) => cell.examine !== null), 'something is reached from the cell it sits on, so a label read off a cell is not a label nothing has').toBe(true);
    for (const offer of offers) expect(onScreen(runs, offer.label), offer.label).toBe(true);
  });

  it('draws the discovered places where they are, with the roads between them', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));
    const found = driver.snapshot().view.discovered;

    const html = renderToStaticMarkup(<App driver={driver} />);
    const drawn = places(html);

    expect(found.map((place) => place.id).sort()).toEqual(['surveyed.cove', 'surveyed.overlook', 'surveyed.shed', 'surveyed.workshop']);
    for (const place of found) {
      const node = drawn.find((entry) => entry.id === place.id);
      expect(node, `${place.title} has no node on the map`).toBeDefined();
      expect(onScreen(node!.runs, place.title), place.title).toBe(true);
    }
    expect(html.match(/<line/g) ?? []).toHaveLength(3);
  });

  it('puts them as far apart as the engine put them, a unit of world at a time', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));
    const grid = driver.snapshot().view.mapGrid;
    const found = driver.snapshot().view.discovered;

    const drawn = places(renderToStaticMarkup(<App driver={driver} />));

    const [first, second] = found.map((place) => ({ place, node: drawn.find((entry) => entry.id === place.id)! }));
    expect(second.place.x - first.place.x).not.toBe(0);
    expect(second.node.left - first.node.left).toBe((second.place.x - first.place.x) * grid);
    expect(second.node.top - first.node.top).toBe((second.place.y - first.place.y) * grid);
  });

  it('draws the world at the grid the world declares', () => {
    const wider = { ...SURVEYED, text: SURVEYED.text.replace('# stat might', ['# variable map-grid', 'value: 300', '', '# stat might'].join('\n')) };
    const driver = createDriver([wider]);
    driver.choose(position(driver, LOOK_OUT));

    expect(driver.snapshot().view.mapGrid).toBe(300);
    const drawn = places(renderToStaticMarkup(<App driver={driver} />));
    const found = driver.snapshot().view.discovered;
    const [first, second] = found.map((place) => ({ place, node: drawn.find((entry) => entry.id === place.id)! }));

    expect(second.node.left - first.node.left).toBe((second.place.x - first.place.x) * 300);
  });

  it('acknowledges the place that has just arrived, and leaves the known one alone', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));
    const view = driver.snapshot().view;

    const drawn = places(renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={['surveyed.overlook']} generation={1} {...MAPPING} />));

    expect(drawn.find((entry) => entry.id === 'surveyed.overlook')!.flashing).toBe(true);
    expect(drawn.find((entry) => entry.id === 'surveyed.workshop')!.flashing).toBe(false);
  });

  it('lights the walk up: where it starts, the next stop, where it ends, and the roads between', () => {
    const driver = createDriver([SURVEYED], { ticker: noTicks });
    driver.choose(position(driver, LOOK_OUT));
    driver.choose(position(driver, 'travel:surveyed.cove'));
    const view = driver.snapshot().view;

    const html = renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} {...MAPPING} />);

    expect(view.journey).toEqual({ to: 'surveyed.cove', legs: ['surveyed.overlook', 'surveyed.cove'] });
    expect(places(html).map((node) => [node.id, node.walk])).toEqual([
      ['surveyed.workshop', 'here'],
      ['surveyed.overlook', 'next'],
      ['surveyed.cove', 'target'],
      ['surveyed.shed', undefined],
    ]);
    expect(html.match(/<line/g) ?? []).toHaveLength(3);
    expect(html.match(/data-walk="now"/g) ?? []).toHaveLength(1);
    expect(html.match(/data-walk="ahead"/g) ?? []).toHaveLength(1);
  });

  it('lights no journey up when nobody is walking, leaving only where the player stands', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));

    const html = renderToStaticMarkup(<MapPane words={shellWord} view={driver.snapshot().view} arrivals={[]} generation={0} {...MAPPING} />);

    expect(driver.snapshot().view.journey).toBeNull();
    expect(places(html).filter((node) => node.walk !== undefined).map((node) => node.walk)).toEqual(['here']);
    expect(html).not.toContain('data-walk="now"');
    expect(html).not.toContain('data-walk="ahead"');
  });

  it('sets off for a place when it is tapped, through the choice the engine published', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));
    const html = renderToStaticMarkup(<App driver={driver} />);

    const overlook = places(html).find((entry) => entry.id === 'surveyed.overlook')!;
    const workshop = places(html).find((entry) => entry.id === 'surveyed.workshop')!;

    expect(driver.snapshot().view.choices.some((choice) => choice.id === 'travel:surveyed.overlook')).toBe(true);
    expect(overlook.disabled).toBe(false);
    expect(workshop.disabled).toBe(true);
  });

  it('draws what the player is carrying, and what they are made of, on the sheet', () => {
    const driver = everyPageFilled();
    const view = driver.snapshot().view;

    const runs = engineRuns(renderToStaticMarkup(<App driver={driver} />));

    expect(view.stats.map((row) => row.id)).toContain('surveyed.might');
    expect(view.carried.map((row) => row.id)).toContain('surveyed.ore');
    expect(view.stats.find((row) => row.id === 'surveyed.might')?.title).toBe('Might');
    for (const row of [...view.stats, ...view.xp]) {
      expect(onScreen(runs, row.title), row.title).toBe(true);
      expect(onScreen(runs, row.id), row.id).toBe(false);
    }

    for (const row of view.carried) {
      expect(onScreen(runs, row.name), row.name).toBe(true);
      expect(onScreen(runs, row.id), row.id).toBe(false);
    }
    expect(view.equipment.map((row) => [row.slot, row.title])).toEqual([['mainhand', 'Main Hand']]);
    for (const row of view.equipment) {
      expect(onScreen(runs, row.title), row.title).toBe(true);
      if (row.name !== null) expect(onScreen(runs, row.name), row.name).toBe(true);
      expect(onScreen(runs, row.slot), row.slot).toBe(false);
    }
  });

  it('draws the run a second time while it is under way, without withdrawing the choices', () => {
    const driver = stocked();
    const idle = driver.snapshot().view.choices;
    const running = idle.find((choice) => choice.id === ROAST)!.label;
    const other = idle.find((choice) => choice.id === TALK)!.label;

    driver.choose(position(driver, ROAST));
    const under = engineRuns(renderToStaticMarkup(<App driver={driver} />));

    expect(under).toContain(running);
    expect(under).toContain(other);
    expect(under.indexOf(running)).toBeLessThan(under.lastIndexOf(running));

    driver.cancel();
    const stopped = engineRuns(renderToStaticMarkup(<App driver={driver} />));

    expect(stopped.indexOf(running)).toBe(stopped.lastIndexOf(running));
  });

  it('draws what is under way in the same band as the pools and what is being held, above them', () => {
    const driver = stocked();
    driver.choose(position(driver, ROAST));
    const { view, live } = driver.snapshot();

    const band = readable(renderToStaticMarkup(<StatusBanner view={view} live={live} speed={1} stirring={false} />));

    expect(live).not.toBeNull();
    expect(view.resources.length).toBeGreaterThan(0);
    expect(band[0]).toBe(String(live!.label));
    expect(band.slice(1)).toEqual(view.resources.map((resource) => resource.title));
    driver.cancel();
  });

  it('names where the player is, what time it is there and who is standing with them', () => {
    const view = createDriver(fixtureSources(), { ticker: noTicks }).snapshot().view;

    const html = renderToStaticMarkup(<LocationBanner view={view} flash={false} />);

    expect(view.entities.length).toBeGreaterThan(0);
    expect(readable(html)).toEqual([view.location.title, view.entities.map((entity) => entity.title).join(' · ')]);
    expect(html).toContain(`>${formatClock(view.time)}<`);
  });

  it('draws one meter per resource the view publishes, in the order it published them', () => {
    const view = createDriver(fixtureSources(), { ticker: noTicks }).snapshot().view;

    const drawn = readable(renderToStaticMarkup(<StatusBanner view={view} live={null} speed={1} stirring={false} />));

    expect(view.resources.length).toBeGreaterThan(0);
    expect(drawn).toEqual(view.resources.map((resource) => resource.title));
  });

  it('narrows the Local surface to what is standing where the player is', () => {
    const driver = createDriver(fixtureSources(), { ticker: noTicks });
    driver.send(devLine(true));
    const view = driver.snapshot().view;
    const sections = addressable([...driver.baseSources(), { name: LOCAL_CHANGES_MODULE_ID, text: driver.localChanges() ?? '' }]);
    const here = offeredBy(sections, { location: view.location.id, entities: view.entities.map((entity) => entity.id) }, 'local');

    const drawn = [...renderToStaticMarkup(<App driver={driver} />).matchAll(/data-section="([^"]*)"/g)].map(([, key]) => key);

    expect(here.length).toBeGreaterThan(0);
    expect(drawn).toEqual(here.map(sectionKey));
  });

  it('hands the sheet the way out the screen published, and nothing where it published none', () => {
    const leaves = createDriver([engineLocale(), SURVEYED]);
    leaves.choose(position(leaves, LOOK_OUT));
    leaves.open('surveyed.awl');
    const stays = read(createDriver(fixtureSources()));
    stays.choose(position(stays, TALK));

    expect(dismissal(leaves.snapshot().view.modals)).not.toBeNull();
    expect(renderToStaticMarkup(<App driver={leaves} />)).toContain('data-drive="dismiss"');

    const held = renderToStaticMarkup(<App driver={stays} />);
    expect(dismissal(stays.snapshot().view.modals)).toBeNull();
    expect(asking(held)).toBe(true);
    expect(held).not.toContain('data-drive="dismiss"');
  });

  it('draws the command field once the setting asks for it, and nothing of it until then', () => {
    const driver = createDriver(fixtureSources(), { ticker: noTicks });
    const field = `aria-label="${shellWord('command')}"`;

    const closed = renderToStaticMarkup(<App driver={driver} />);
    driver.editorMemory.write(recorded({ ...FORGOTTEN, commandLine: true }));
    const open = renderToStaticMarkup(<App driver={driver} />);

    expect(closed).not.toContain(field);
    expect(open).toContain(field);
    expect(onScreen(readable(open), shellWord('run'))).toBe(true);
  });

  it('offers every rate on Settings and marks the one the session is running', () => {
    const driver = createDriver(fixtureSources(), { ticker: noTicks });
    const running = RATES[RATES.length - 2];
    driver.send(devLine(true));
    driver.send(speedLine(String(running)));
    const html = renderToStaticMarkup(<App driver={driver} opening={toSubpage(toLayer(OPENING, HOME_LAYER), HOME_LAYER, 'settings')} />);
    const drawn = [...html.matchAll(/data-rate="(\d+)"(?:[^>]*?(data-running))?/g)];

    expect(driver.snapshot().speed).toBe(running);
    expect(drawn.map(([, rate]) => Number(rate))).toEqual([...RATES]);
    expect(drawn.filter(([, , marked]) => marked).map(([, rate]) => Number(rate))).toEqual([running]);
    expect(html, 'a rate off the list is typed on the command line, not here').not.toContain(`aria-label="${shellWord('speed')}"`);
  });

  it('names its two glyph controls with the engine value each one acts on', () => {
    const driver = stocked();
    const running = driver.snapshot().view.choices.find((choice) => choice.id === ROAST)!.label;
    driver.choose(position(driver, ROAST));

    expect(renderToStaticMarkup(<App driver={driver} />)).toContain(`aria-label="${running}"`);

    const field = { key: 'name', label: asLocalized('Name'), values: null };
    expect(renderToStaticMarkup(<ModalSheet option={field} manner={{}} onAnswer={() => undefined} />)).toContain(`aria-label="${field.label}"`);
  });

  it('moves a bar over exactly one tick of the cadence both drivers read, and draws none when nothing is under way', () => {
    const idle = stocked();
    expect(renderToStaticMarkup(<App driver={idle} />)).not.toContain('data-live="fill"');

    const driver = stocked();
    driver.choose(position(driver, ROAST));
    const bar = renderToStaticMarkup(<App driver={driver} />).match(/<div[^>]*data-live="fill"[^>]*>/);

    expect(bar, 'a run is under way, so a live bar is drawn').not.toBeNull();
    expect(bar![0]).toContain(`transition-duration:${LIVE_TICK_MS}ms`);
  });

  it('draws the modal the engine is asking for, and stops once it is answered', () => {
    const driver = read(createDriver(fixtureSources()));
    driver.choose(position(driver, 'talk:fixture-town.keeper'));
    const menu = driver.snapshot().view.modals[0].options[0];

    const asked = renderToStaticMarkup(<App driver={driver} />);
    expect(asking(asked)).toBe(true);
    for (const choice of menu.values!) expect(onScreen(readable(asked), choice.shown), choice.shown).toBe(true);

    driver.answer(menu.key, menu.values![0].value);

    const beat = driver.snapshot().view.modals[0].options[0];
    expect(asking(renderToStaticMarkup(<App driver={driver} />))).toBe(true);

    driver.answer(beat.key, beat.values![0].value);
    const answered = renderToStaticMarkup(<App driver={driver} />);

    expect(asking(answered)).toBe(false);
  });

  it('renders a modal it has never heard of from the option alone', () => {
    const unheard = { key: 'heading', label: asLocalized('Which way from here'), values: [{ value: 'widdershins', shown: asLocalized('widdershins') }, { value: 'deosil', shown: asLocalized('deosil') }] };

    const html = renderToStaticMarkup(<ModalSheet option={unheard} manner={{}} onAnswer={() => undefined} />);

    expect(readable(html)).toEqual([unheard.label, ...unheard.values.map((choice) => choice.shown)]);
  });

  it('renders a free-text option as a field with no listed answer', () => {
    const html = renderToStaticMarkup(<ModalSheet option={{ key: 'name', label: asLocalized('Name'), values: null }} manner={{}} onAnswer={() => undefined} />);

    expect(readable(html), 'the field is named over it, and named again on the button that submits it').toEqual(['Name', 'Name']);
    expect(html).toContain('<input');
  });

  describe('draws every field it hands a driving agent', () => {
    it('says which floor it is showing, and offers the ones it found', () => {
      const driver = createDriver([STOREYS]);
      const view = driver.snapshot().view;

      const strip = floors(renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} {...MAPPING} />));

      expect(view.discovered.map((place) => place.z).sort()).toEqual([0, 1]);
      expect(strip.offered.sort()).toEqual([0, 1]);
      expect(view.location.id).toBe('storeys.landing');
      expect(strip.drawn).toBe(1);
    });

    it('offers a way back to the player, on the floor they are standing on', () => {
      const driver = createDriver([STOREYS]);
      const view = driver.snapshot().view;

      const html = renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} {...MAPPING} />);

      expect(html).toContain('data-drive="map.recentre"');
      expect(onScreen(readable(html), shellWord('recentre'))).toBe(true);
    });

    it('draws the sheet under the pan and the zoom it reports, and nothing else', () => {
      const driver = createDriver([SURVEYED]);
      driver.choose(position(driver, LOOK_OUT));
      const view = driver.snapshot().view;

      const under = drawnAt(renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} {...MAPPING} />));

      expect(under).toEqual({ x: MAPPING.where.pan.x, y: MAPPING.where.pan.y, zoom: MAPPING.where.zoom });
    });

    it('leaves every other place where it was when one place moves', () => {
      const driver = createDriver([SURVEYED]);
      driver.choose(position(driver, LOOK_OUT));
      const view = driver.snapshot().view;
      const shifted = { ...view, discovered: view.discovered.map((place, at) => (at === 0 ? { ...place, x: place.x + 9, y: place.y - 7 } : place)) };

      const before = renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} {...MAPPING} />);
      const after = renderToStaticMarkup(<MapPane words={shellWord} view={shifted} arrivals={[]} generation={0} {...MAPPING} />);

      expect(drawnAt(after)).toEqual(drawnAt(before));
      const stood = places(before).slice(1).map((place) => [place.id, place.left, place.top]);
      expect(places(after).slice(1).map((place) => [place.id, place.left, place.top])).toEqual(stood);
      expect(stood.length).toBeGreaterThan(0);
    });

    it('draws one skill panel per row the view publishes, each with its own level in its own ring', () => {
      const driver = createDriver([SURVEYED], { ticker: noTicks });
      driver.choose(position(driver, LOOK_OUT));
      const view = driver.snapshot().view;
      const where = toSubpage(toLayer(OPENING, 2), 2, 'skills');

      const drawn = skillPanels(renderToStaticMarkup(<App driver={driver} opening={where} />));

      expect(view.xp.length).toBeGreaterThan(0);
      expect(drawn.map((panel) => panel.id).sort()).toEqual(view.xp.map((row) => row.id).sort());
      for (const row of view.xp) {
        const panel = drawn.find((each) => each.id === row.id)!;

        expect(onScreen(panel.runs, row.title as unknown as string), `the panel does not name ${row.id}`).toBe(true);
        expect(onScreen(panel.runs, String(row.level)), `the panel does not draw the level of ${row.id}`).toBe(true);
        expect(panel.ring, `the panel for ${row.id} draws no ring`).toBe(true);
      }
    });

    it('draws the nav standing where it was opened, so a shell handing over a constant is markup that shows it', () => {
      const driver = createDriver([SURVEYED]);

      const html = renderToStaticMarkup(<App driver={driver} opening={toLayer(OPENING, 2)} />);

      const named = wordsOf(driver.localizer());
      const tabs = LAYERS[2].subpages.map((subpage) => named(subpage.id));
      const bar = html.slice(html.lastIndexOf('<nav'));

      expect(tabs.length).toBe(LAYERS[2].subpages.length);
      expect(tabs.length).toBeGreaterThan(1);
      for (const tab of tabs) expect(bar, `the tab bar does not offer ${tab}`).toContain(tab);
      for (const tab of LAYERS[OPENING.layer].subpages.map((subpage) => named(subpage.id))) {
        if (!tabs.includes(tab)) expect(bar, `the tab bar still offers ${tab}`).not.toContain(tab);
      }
    });

    it('draws a place for every node on the sheet, and disables the ones it has no way out to', () => {
      const driver = createDriver([SURVEYED]);
      driver.choose(position(driver, LOOK_OUT));
      const view = driver.snapshot().view;

      const drawn = places(renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} {...MAPPING} />));

      expect(drawn.map((node) => node.id).sort()).toEqual(view.discovered.map((place) => place.id).sort());
      expect(drawn.filter((node) => node.disabled).map((node) => node.id)).toEqual(['surveyed.workshop']);
    });
  });
});

describe('what the editing page says about a section', () => {
  const rowClass = (html: string, section: string): string => {
    const tag = new RegExp(`<button[^>]*data-section="${section}"[^>]*>`).exec(html)?.[0] ?? '';
    return /class="([^"]*)"/.exec(tag)?.[1] ?? '';
  };

  it('says what the filter takes while nothing has been typed into it', () => {
    const driver = createDriver(fixtureSources(), { ticker: noTicks });
    driver.send(devLine(true));

    const html = renderToStaticMarkup(<App driver={driver} opening={toSubpage(toLayer(OPENING, HOME_LAYER), HOME_LAYER, 'edit')} />);

    expect(html).toContain(`placeholder="${searchHint(shellWord('search-hint'))}"`);
  });

  it('tells a staged section from a shipped one by its colour rather than by a slant', () => {
    const driver = createDriver(fixtureSources(), { ticker: noTicks });
    driver.send(devLine(true));
    driver.send('/dsl entity fixture-town.keeper title: The Keeper');
    const html = renderToStaticMarkup(<App driver={driver} opening={toSubpage(toLayer(OPENING, HOME_LAYER), HOME_LAYER, 'edit')} />);
    const staged = rowClass(html, 'entity fixture-town.keeper');
    const shipped = rowClass(html, 'entity fixture-town.carter');

    expect(staged, 'the editing page drew no row for the staged section').not.toBe('');
    expect(staged).not.toBe(shipped);
    expect(staged).not.toContain('italic');
    expect(staged).toContain('warning');
  });
});

describe('what a screen wider than it is tall gets', () => {
  const strip = (columns: number): string =>
    renderToStaticMarkup(
      <Pager
        index={0}
        columns={columns}
        onIndex={() => undefined}
        panes={[<span key="a">first</span>, <span key="b">second</span>, <span key="c">third</span>]}
      />,
    );

  it('gives each pane the share of the strip its column is worth', () => {
    expect([...strip(1).matchAll(/width:100%/g)]).toHaveLength(3);
    expect([...strip(2).matchAll(/width:50%/g)]).toHaveLength(3);
  });

  it('draws every pane either way, so the one beside the open page is already there to read', () => {
    for (const columns of [1, 2]) {
      for (const pane of ['first', 'second', 'third']) expect(strip(columns), `${columns} columns`).toContain(pane);
    }
  });
});

describe('the ways out, laid out the way they lie', () => {
  const compass = (html: string): Array<{ bearing: string; runs: string[] }> =>
    [...html.matchAll(/<button([^>]*data-bearing="([^"]*)"[^>]*)>([\s\S]*?)<\/button>/g)].map(([, , bearing, inner]) => ({ bearing, runs: readable(inner) }));

  it('gives each way out its own square, and draws it nowhere else on the sheet', () => {
    const driver = createDriver(fixtureSources(), { ticker: noTicks });
    driver.send('/dev on');
    driver.send('/goto fixture-town.green');
    const view = driver.snapshot().view;

    const html = renderToStaticMarkup(<App driver={driver} />);
    const drawn = compass(html);
    const ways = sheetOf(view, null).ways.filter((way) => way.legs <= 1);

    expect(drawn.length).toBeGreaterThan(2);
    for (const square of drawn) {
      const way = ways.find((each) => String(each.label) === square.runs.join(''));
      expect(way, `${square.bearing} holds ${square.runs.join('')}`).toBeDefined();
      expect(way!.bearing).toBe(square.bearing);
    }
    const runs = readable(html);
    for (const square of drawn) expect(runs.filter((run) => run === square.runs.join('')), square.runs.join('')).toHaveLength(1);
  });

  it('puts the room the player is standing in in the middle, where no heading points', () => {
    const driver = createDriver(fixtureSources(), { ticker: noTicks });
    driver.send('/dev on');
    driver.send('/goto fixture-town.green');

    const html = renderToStaticMarkup(<App driver={driver} />);

    expect(html).toContain('data-drive="compass"');
    expect(compass(html).map((square) => square.bearing)).not.toContain('');
  });
});
