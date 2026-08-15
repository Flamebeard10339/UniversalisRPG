import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { localizerFor } from '../runtime/localized';
import { asLocalized } from '../runtime/localizedFixture';
import { loadUniverseWithDiagnostics } from '../content/registry';
import { LIVE_TICK_MS, newContext, runLine, type Ticker } from '../runtime/command';
import { startSession, view, type PlayView } from '../runtime/session';
import { App } from './App';
import { PER_UNIT } from './discovery';
import { createDriver, type Driver } from './driver';
import { MapPane } from './MapPane';
import { ModalSheet } from './ModalSheet';
import { SHIPPED_SOURCES } from './shippedContent';
import { LABELS, type LabelId } from './labels';
import { wordsOf } from './words';
import { LAYERS, OPENING, toLayer, toSubpage } from './nav';

// A run that is under way and going nowhere, which is what a test about what
// is drawn wants: no timer, and the same frame however long the test takes.
const noTicks: Ticker = () => () => undefined;

const ROAST = 'use:entity.tutorial-island.oven.roast-chestnuts';
const TALK = 'talk:tutorial-island.miki';

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };

// Every run of text the markup would put in front of a player. An aria-label is
// one of those runs: a control named for a screen reader is prose a player
// reads, and leaving it out would exempt from the clause the one place a glyph
// control is allowed to say anything at all.
function readable(html: string): string[] {
  return html
    .replace(/aria-label="([^"]*)"/g, '\n$1\n')
    .replace(/<[^>]*>/g, '\n')
    .split('\n')
    .map((run) => run.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity]).trim())
    .filter((run) => /[A-Za-z]/.test(run));
}

// Whether a run of text is accounted for by the words a player may read,
// however this layer chose to lay them out. Consumed from the front, longest
// match first, and anything that is not a letter is layout — so a component
// putting two engine values in one element, or joining a list with a glyph,
// is a presentational change rather than a word nobody published. The
// separator list this replaces was kept in step with the components by hand
// and red'd three tests the first time `{entry.name} {entry.value}` went into
// one `<dt>`, where both halves were engine values.
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

// Whether the words are on the screen, wherever this layer chose to put the
// element boundaries. The mirror of `accountedFor`: a clause about what must be
// drawn is no more entitled to assume one value per element than a clause about
// what must not be, and a run holding an id as well as its title is a failure
// here rather than a pass on a boundary.
const onScreen = (runs: readonly string[], text: string): boolean => runs.some((run) => run.includes(text));

function published(view: PlayView): string[] {
  return [
    view.location.title,
    view.location.description ?? '',
    ...view.entities.flatMap((entity) => [entity.title, entity.examine ?? '']),
    ...view.choices.flatMap((choice) => [choice.label, choice.detail ?? '']),
    ...view.resources.map((resource) => resource.title),
    ...view.modals.flatMap((modal) => modal.options.flatMap((option) => [option.label as string, ...(option.values ?? []).map((choice) => choice.shown as string)])),
    // The map and the character sheet. Every one of these is words the engine
    // produced, and there is no id among them: under c10 a stat, a skill and a
    // slot each arrive with their own title beside their own id, so c16's "a key
    // is what the sheet may draw" has nothing left to cover and is retired.
    ...view.discovered.map((place) => place.title),
    ...view.carried.map((row) => row.name),
    ...view.stats.map((row) => row.title),
    ...view.xp.map((row) => row.title),
    ...view.equipment.flatMap((row) => [row.title, row.name]),
    ...view.said,
  ];
}

// What a walk had on its screens, so a permission above is only ever granted to
// a page the walk opened. Three of them were dead for seven passes because
// nothing that ran ever reached Skills, Equipment or the Map, and no assertion
// about what is on the screen can tell an empty page from a clean one.
function pagesDrawn(view: PlayView): Record<string, number> {
  return { stats: view.stats.length, skills: view.xp.length, equipment: view.equipment.length, carried: view.carried.length, map: view.discovered.length };
}

// Every id the view hands a driver beside the words for it. Nothing on a screen
// fails because the permitted set is longer than it needs to be, so the set is
// held against these as well: an id may never be a permitted screen word, and
// putting one back is a failure here rather than an entry nobody notices.
function idsPublished(view: PlayView): string[] {
  return [
    ...view.stats.map((row) => row.id),
    ...view.xp.map((row) => row.id),
    ...view.equipment.flatMap((row) => [row.slot, row.item]),
    ...view.carried.map((row) => row.id),
    ...view.discovered.map((place) => place.id),
  ];
}

// The driver's own vocabulary, taken whole rather than by where it is drawn,
// and read out of the localizer the way a component reads it: after c3 the
// table names keys, and what lands on the screen is the English the shipped
// engine locale gives them. Excising the <nav> region derived the expectation
// from the structure under test, so no wording could fail it; a table read as a
// set makes a word the shell puts on the screen either an engine value or one
// of these.
const shellWord = wordsOf(localizerFor(loadInEnglish(''), 'en'));

// What the two nodes take, supplied at every call so the table can be read as a
// set. A pattern that names neither is unaffected by being handed both.
const NODE = { position: 1, direction: asLocalized('ne') };

const SHELL_WORDS: readonly string[] = (Object.keys(LABELS) as LabelId[]).map((id) => shellWord(id, NODE));

// The engine's half of what is drawn, with the shell's own words taken out by
// what they are rather than by where they sit: excising a region left every
// other component free to write prose the region test never saw.
const engineRuns = (html: string): string[] => readable(html).filter((run) => !SHELL_WORDS.includes(run));

// The engine speaks in messages as well as in views, and a driver logs both.
// Taken by stopping a run against a session of its own, because typing the
// words here would be this test composing the prose it exists to refuse.
function whatStoppingSays(): string[] {
  const session = startSession(loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry);
  const opening = view(session);
  const armed = runLine(newContext(session, opening, { driving: true }), String(opening.choices.findIndex((choice) => choice.id === ROAST) + 1));
  return armed.live!.end(true).output.flatMap((output) => (output.kind === 'message' ? [output.text] : []));
}

const asking = (html: string): boolean => html.includes('role="dialog"');

// Two floors with a way between them, so the floor strip is drawn at all: it
// only appears where more than one plane has been found, and it is the whole of
// what the map draws off the plane it is showing.
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

// The floor strip, as the map wrote it: which floors it offers and which one it
// says it is drawing.
function floors(html: string): { offered: number[]; drawn: number | null } {
  const strip = [...html.matchAll(/<button([^>]*data-floor="(-?\d+)"[^>]*)>/g)];
  const drawn = strip.filter(([, attributes]) => attributes.includes('data-drawn'));
  return { offered: strip.map(([, , floor]) => Number(floor)), drawn: drawn.length === 1 ? Number(drawn[0][2]) : null };
}

// The transform the sheet is drawn under, which is the whole of what the map
// draws off its pan and its zoom.
function drawnAt(html: string): { x: number; y: number; zoom: number } | null {
  const found = html.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/);
  return found ? { x: Number(found[1]), y: Number(found[2]), zoom: Number(found[3]) } : null;
}

// The map's nodes, each as the place it stands for, where it was put and the
// runs inside it. data-place is written by MapPane and nothing else, so this
// reads the map's own markup rather than guessing at it from class names.
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

// The skills page's panels, each as the skill it stands for and the runs inside
// it. data-skill is written by SkillsPane and nothing else, and the runs are
// taken whole rather than through `readable`, because a level is digits and
// `readable` keeps only what has a letter in it.
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

function position(driver: Driver, choiceId: string): number {
  const at = driver.snapshot().view!.choices.findIndex((choice) => choice.id === choiceId);
  if (at < 0) throw new Error(`no such choice: ${choiceId}`);
  return at + 1;
}

// A line of three places with a fourth off to the side, a way to find them all,
// and something to carry: a walk has a middle to draw and the map has a road it
// is not taking, and neither depends on what the tutorial happens to hold.
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

// A session with a row on every page, reached the way a player reaches one: the
// window fills the map, the sheet and the inventory, and the carried screen's
// own verb fills the equipment page.
function everyPageFilled(): Driver {
  const driver = createDriver([engineLocale(), SURVEYED]);
  driver.choose(position(driver, LOOK_OUT));
  driver.open('surveyed.awl');
  driver.answer('verb', 'equip');
  return driver;
}

describe('what the shell puts on the screen', () => {
  // The engine's own words are gathered as it publishes them, so this is a
  // comparison against the engine and not against the log that renders it.
  it('renders nothing a player can read that the engine did not publish', () => {
    const driver = createDriver(SHIPPED_SOURCES, { ticker: noTicks });
    const engine = new Set<string>(whatStoppingSays());
    let seen = 0;

    const step = (): void => {
      const at = driver.snapshot().view!;
      for (const line of published(at)) engine.add(line);
      expect(idsPublished(at).filter((id) => engine.has(id))).toEqual([]);
      const html = renderToStaticMarkup(<App driver={driver} />);

      const runs = readable(html);
      seen += runs.length;
      for (const run of runs) {
        expect(accountedFor(run, [...engine, ...SHELL_WORDS]), `"${run}" is on the screen and no engine value produced it`).toBe(true);
      }
    };

    step();
    driver.choose(position(driver, TALK));
    step();
    const menu = driver.snapshot().view!.modals[0].options[0];
    driver.answer(menu.key, menu.values![1].value);
    step();
    driver.choose(position(driver, ROAST));
    step();
    driver.cancel();
    driver.choose(position(driver, 'use:entity.tutorial-island.mirror.look-in'));
    step();

    // A shell that rendered nothing would satisfy every line above.
    expect(seen).toBeGreaterThan(20);
  });

  // The same rule over a session with something on every page. The walk above
  // runs the shipped island, where the player has learned nothing and is wearing
  // nothing, so Skills and Equipment are blank for the whole of it and a
  // permission granted to either was answering no question (c10).
  it('renders nothing a player can read that the engine did not publish, with a row on every page', () => {
    const driver = everyPageFilled();
    const view = driver.snapshot().view!;

    expect(Object.entries(pagesDrawn(view)).filter(([, rows]) => rows === 0)).toEqual([]);

    const engine = new Set<string>(published(view));
    expect(idsPublished(view).filter((id) => engine.has(id))).toEqual([]);
    for (const run of readable(renderToStaticMarkup(<App driver={driver} />))) {
      expect(accountedFor(run, [...engine, ...SHELL_WORDS]), `"${run}" is on the screen and no engine value produced it`).toBe(true);
    }
  });

  // The clause above only refuses what should not be there, so a shell that
  // drew nothing at all would satisfy it. These two say what must be there.
  it('draws every choice the engine is offering', () => {
    const driver = createDriver(SHIPPED_SOURCES);

    const runs = readable(renderToStaticMarkup(<App driver={driver} />));

    for (const choice of driver.snapshot().view!.choices) expect(onScreen(runs, choice.label), choice.label).toBe(true);
  });

  it('draws the discovered places where they are, with the roads between them', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));
    const found = driver.snapshot().view!.discovered;

    const html = renderToStaticMarkup(<App driver={driver} />);
    const drawn = places(html);

    // By node rather than by words on the screen: every one of these titles is
    // also on Home's transcript or in the location banner, so a map drawing
    // nothing would pass a check that only asks whether the words are somewhere.
    expect(found.map((place) => place.id).sort()).toEqual(['surveyed.cove', 'surveyed.overlook', 'surveyed.shed', 'surveyed.workshop']);
    for (const place of found) {
      const node = drawn.find((entry) => entry.id === place.id);
      expect(node, `${place.title} has no node on the map`).toBeDefined();
      expect(onScreen(node!.runs, place.title), place.title).toBe(true);
    }
    // One road per pair rather than one per end, and the fixture has three.
    expect(html.match(/<line/g) ?? []).toHaveLength(3);
  });

  // The clause above finds a node per place and reads the title in it, which a
  // map that stacked every place on the origin would still pass.
  it('puts them as far apart as the engine put them, a unit of world at a time', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));
    const found = driver.snapshot().view!.discovered;

    const drawn = places(renderToStaticMarkup(<App driver={driver} />));

    const [first, second] = found.map((place) => ({ place, node: drawn.find((entry) => entry.id === place.id)! }));
    expect(second.place.x - first.place.x).not.toBe(0);
    expect(second.node.left - first.node.left).toBe((second.place.x - first.place.x) * PER_UNIT);
    expect(second.node.top - first.node.top).toBe((second.place.y - first.place.y) * PER_UNIT);
  });

  // Driven at the pane rather than through App, because the arrival is worked
  // out in an effect and a static render runs none.
  it('acknowledges the place that has just arrived, and leaves the known one alone', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));
    const view = driver.snapshot().view!;

    const drawn = places(renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={['surveyed.overlook']} generation={1} onChoose={() => undefined} />));

    expect(drawn.find((entry) => entry.id === 'surveyed.overlook')!.flashing).toBe(true);
    expect(drawn.find((entry) => entry.id === 'surveyed.workshop')!.flashing).toBe(false);
  });

  it('lights the walk up: where it ends, what it still has to cross, and the roads between', () => {
    const driver = createDriver([SURVEYED], { ticker: noTicks });
    driver.choose(position(driver, LOOK_OUT));
    // Walked the long way round, so the route has a middle to draw and the map
    // has a road it is not taking.
    driver.choose(position(driver, 'travel:surveyed.cove'));
    const view = driver.snapshot().view!;

    const html = renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} onChoose={() => undefined} />);

    expect(view.journey).toEqual({ to: 'surveyed.cove', legs: ['surveyed.overlook', 'surveyed.cove'] });
    expect(places(html).map((node) => [node.id, node.walk])).toEqual([
      ['surveyed.workshop', undefined],
      ['surveyed.overlook', 'crossing'],
      ['surveyed.cove', 'going'],
      ['surveyed.shed', undefined],
    ]);
    // Two roads on the map and one of them is not on the walk.
    expect(html.match(/<line/g) ?? []).toHaveLength(3);
    expect(html.match(/data-walk="road"/g) ?? []).toHaveLength(2);
  });

  it('lights nothing up when nobody is walking', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));

    const html = renderToStaticMarkup(<MapPane words={shellWord} view={driver.snapshot().view!} arrivals={[]} generation={0} onChoose={() => undefined} />);

    expect(driver.snapshot().view!.journey).toBeNull();
    expect(places(html).every((node) => node.walk === undefined)).toBe(true);
    expect(html).not.toContain('data-walk="road"');
  });

  it('sets off for a place when it is tapped, through the choice the engine published', () => {
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));
    const html = renderToStaticMarkup(<App driver={driver} />);

    const overlook = places(html).find((entry) => entry.id === 'surveyed.overlook')!;
    const workshop = places(html).find((entry) => entry.id === 'surveyed.workshop')!;

    // The one the engine is offering a way to is the one that can be tapped;
    // the one the player is already standing in is not.
    expect(driver.snapshot().view!.choices.some((choice) => choice.id === 'travel:surveyed.overlook')).toBe(true);
    expect(overlook.disabled).toBe(false);
    expect(workshop.disabled).toBe(true);
  });

  it('draws what the player is carrying, and what they are made of, on the sheet', () => {
    const driver = everyPageFilled();
    const view = driver.snapshot().view!;

    const runs = engineRuns(renderToStaticMarkup(<App driver={driver} />));

    expect(view.stats.map((row) => row.id)).toContain('surveyed.might');
    expect(view.carried.map((row) => row.id)).toContain('surveyed.ore');
    // c9, c10: every stat and every skill reaches the page under the title the
    // engine published on its row, and none of them under the id that title
    // travelled beside.
    expect(view.stats.find((row) => row.id === 'surveyed.might')?.title).toBe('Might');
    for (const row of [...view.stats, ...view.xp]) {
      expect(onScreen(runs, row.title), row.title).toBe(true);
      expect(onScreen(runs, row.id), row.id).toBe(false);
    }

    // c16 and c18: a carried thing reaches the page under the name the engine
    // published and beside its count, never under the id a verb addresses it by.
    for (const row of view.carried) {
      expect(onScreen(runs, row.name), row.name).toBe(true);
      expect(onScreen(runs, row.id), row.id).toBe(false);
    }
    // c10: a slot is a word with a key, so the equipment page draws its title
    // and never the id `equipment-slots:` named it by.
    expect(view.equipment.map((row) => [row.slot, row.title])).toEqual([['mainhand', 'Main Hand']]);
    for (const row of view.equipment) {
      expect(onScreen(runs, row.title), row.title).toBe(true);
      expect(onScreen(runs, row.name), row.name).toBe(true);
      expect(onScreen(runs, row.slot), row.slot).toBe(false);
    }
  });

  it('draws the run above the choices, which it does not withdraw', () => {
    const driver = createDriver(SHIPPED_SOURCES, { ticker: noTicks });
    const idle = driver.snapshot().view!.choices;
    const running = idle.find((choice) => choice.id === ROAST)!.label;
    const other = idle.find((choice) => choice.id === TALK)!.label;

    driver.choose(position(driver, ROAST));
    const under = engineRuns(renderToStaticMarkup(<App driver={driver} />));

    expect(under).toContain(running);
    expect(under).toContain(other);
    // Above them, and outside the scroller they sit in: the label the run put
    // on the screen comes before every choice, including its own.
    expect(under.indexOf(running)).toBeLessThan(under.indexOf(other));
    expect(under.indexOf(running)).toBeLessThan(under.lastIndexOf(running));

    driver.cancel();
    const stopped = engineRuns(renderToStaticMarkup(<App driver={driver} />));

    expect(stopped.indexOf(running)).toBe(stopped.lastIndexOf(running));
  });

  // The field itself is DOM wiring and is not driven here; what this holds is
  // that the pane carrying it is mounted and named, since a command route the
  // shell never draws is a route the player does not have.
  it('draws the command field on Edit, so every line the table takes has somewhere to be typed', () => {
    const driver = createDriver(SHIPPED_SOURCES, { ticker: noTicks });

    const html = renderToStaticMarkup(<App driver={driver} />);

    expect(html).toContain(`aria-label="${shellWord('command')}"`);
    expect(onScreen(readable(html), shellWord('run'))).toBe(true);
  });

  it('names its two glyph controls with the engine value each one acts on', () => {
    const driver = createDriver(SHIPPED_SOURCES, { ticker: noTicks });
    const running = driver.snapshot().view!.choices.find((choice) => choice.id === ROAST)!.label;
    driver.choose(position(driver, ROAST));

    expect(renderToStaticMarkup(<App driver={driver} />)).toContain(`aria-label="${running}"`);

    const field = { key: 'name', label: asLocalized('Name'), values: null };
    expect(renderToStaticMarkup(<ModalSheet option={field} onAnswer={() => undefined} />)).toContain(`aria-label="${field.label}"`);
  });

  it('moves a bar over exactly one tick of the cadence both drivers read', () => {
    const driver = createDriver(SHIPPED_SOURCES, { ticker: noTicks });
    driver.choose(position(driver, ROAST));

    expect(renderToStaticMarkup(<App driver={driver} />)).toContain(`transition-duration:${LIVE_TICK_MS}ms`);
  });

  it('draws the modal the engine is asking for, and stops once it is answered', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    driver.choose(position(driver, 'talk:tutorial-island.miki'));
    const menu = driver.snapshot().view!.modals[0].options[0];

    const asked = renderToStaticMarkup(<App driver={driver} />);
    expect(asking(asked)).toBe(true);
    for (const choice of menu.values!) expect(onScreen(readable(asked), choice.shown), choice.shown).toBe(true);

    driver.answer(menu.key, menu.values![0].value);
    const answered = renderToStaticMarkup(<App driver={driver} />);

    // The sheet itself, not merely the words that were on it: a shell holding
    // an answered modal up passes a check that only looks for its options.
    expect(asking(answered)).toBe(false);
  });

  it('renders a modal it has never heard of from the option alone', () => {
    const unheard = { key: 'heading', label: asLocalized('Which way from here'), values: [{ value: 'widdershins', shown: asLocalized('widdershins') }, { value: 'deosil', shown: asLocalized('deosil') }] };

    const html = renderToStaticMarkup(<ModalSheet option={unheard} onAnswer={() => undefined} />);

    expect(readable(html)).toEqual([unheard.label, ...unheard.values.map((choice) => choice.shown)]);
  });

  it('renders a free-text option as a field with no listed answer', () => {
    const html = renderToStaticMarkup(<ModalSheet option={{ key: 'name', label: asLocalized('Name'), values: null }} onAnswer={() => undefined} />);

    expect(readable(html)).toEqual(['Name']);
    expect(html).toContain('<input');
  });

  // c5, as the thing that makes it hold rather than as the registration itself:
  // the map assembles one value, draws from it and hands that same value over,
  // so every field of it is a field a render test can fail on. Each of these
  // kills a registration that says something the map is not drawing.
  describe('draws every field it hands a driving agent', () => {
    it('says which floor it is showing, and offers the ones it found', () => {
      const driver = createDriver([STOREYS]);
      const view = driver.snapshot().view!;

      const strip = floors(renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} onChoose={() => undefined} />));

      expect(view.discovered.map((place) => place.z).sort()).toEqual([0, 1]);
      expect(strip.offered.sort()).toEqual([0, 1]);
      // Standing on the landing, deliberately not the floor a map that had lost
      // track of which one it was showing would fall back to.
      expect(view.location.id).toBe('storeys.landing');
      expect(strip.drawn).toBe(1);
    });

    it('offers a way back to the player, on the floor they are standing on', () => {
      const driver = createDriver([STOREYS]);
      const view = driver.snapshot().view!;

      const html = renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} onChoose={() => undefined} />);

      expect(html).toContain('data-drive="map.recentre"');
      expect(onScreen(readable(html), shellWord('recentre'))).toBe(true);
    });

    it('draws the sheet under the pan and the zoom it reports', () => {
      const driver = createDriver([SURVEYED]);
      driver.choose(position(driver, LOOK_OUT));
      const view = driver.snapshot().view!;

      const under = drawnAt(renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} onChoose={() => undefined} />));

      // Nothing has been dragged, so the sheet sits centred on what it is
      // showing at a zoom of 1. Worked out from the places the engine
      // published rather than written down, so this is the map's own arithmetic
      // and not a number copied out of one run of it.
      const xs = view.discovered.map((place) => place.x);
      const ys = view.discovered.map((place) => place.y);
      const centre = { x: ((Math.min(...xs) + Math.max(...xs)) / 2) * PER_UNIT, y: ((Math.min(...ys) + Math.max(...ys)) / 2) * PER_UNIT };

      expect(under).toEqual({ x: -centre.x, y: -centre.y, zoom: 1 });
    });

    it('draws one skill panel per row the view publishes, each with its own level in its own ring', () => {
      const driver = createDriver([SURVEYED], { ticker: noTicks });
      driver.choose(position(driver, LOOK_OUT));
      const view = driver.snapshot().view!;
      // Where the skills page is: the character layer, on the page the nav
      // names, rather than an index this test would have to keep in step.
      const skills = LAYERS[2].subpages.findIndex((subpage) => subpage.id === 'skills');
      const where = toSubpage(toLayer(OPENING, 2), 2, skills);

      const drawn = skillPanels(renderToStaticMarkup(<App driver={driver} opening={where} />));

      expect(view.xp.length).toBeGreaterThan(0);
      expect(drawn.map((panel) => panel.id).sort()).toEqual(view.xp.map((row) => row.id).sort());
      for (const row of view.xp) {
        const panel = drawn.find((each) => each.id === row.id)!;

        expect(onScreen(panel.runs, row.title as unknown as string), `the panel does not name ${row.id}`).toBe(true);
        // The level, inside the ring that fills toward the next one.
        expect(onScreen(panel.runs, String(row.level)), `the panel does not draw the level of ${row.id}`).toBe(true);
        expect(panel.ring, `the panel for ${row.id} draws no ring`).toBe(true);
      }
    });

    it('draws the nav standing where it was opened, so a shell handing over a constant is markup that shows it', () => {
      const driver = createDriver([SURVEYED]);

      // The character layer, whose tab bar offers four pages where the opening
      // layer offers three. A shell that handed over the opening rather than
      // where it is standing would draw the opening layer's tabs.
      const html = renderToStaticMarkup(<App driver={driver} opening={toLayer(OPENING, 2)} />);

      // Read out of this shell's own localizer rather than the shipped one:
      // SURVEYED carries no engine locale, so its tabs are the keys themselves,
      // and what is under test here is which four the bar offers.
      const named = wordsOf(driver.localizer());
      const tabs = LAYERS[2].subpages.map((subpage) => named(subpage.id));
      const bar = html.slice(html.lastIndexOf('<nav'));

      expect(tabs).toHaveLength(4);
      for (const tab of tabs) expect(bar, `the tab bar does not offer ${tab}`).toContain(tab);
      for (const tab of LAYERS[OPENING.layer].subpages.map((subpage) => named(subpage.id))) {
        if (!tabs.includes(tab)) expect(bar, `the tab bar still offers ${tab}`).not.toContain(tab);
      }
    });

    it('draws a place for every node on the sheet, and disables the ones it has no way out to', () => {
      const driver = createDriver([SURVEYED]);
      driver.choose(position(driver, LOOK_OUT));
      const view = driver.snapshot().view!;

      const drawn = places(renderToStaticMarkup(<MapPane words={shellWord} view={view} arrivals={[]} generation={0} onChoose={() => undefined} />));

      expect(drawn.map((node) => node.id).sort()).toEqual(view.discovered.map((place) => place.id).sort());
      // Where the player is standing is the one with no travel out to it.
      expect(drawn.filter((node) => node.disabled).map((node) => node.id)).toEqual(['surveyed.workshop']);
    });
  });
});
