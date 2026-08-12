import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/registry';
import { LIVE_TICK_MS, newContext, runLine, type Ticker } from '../runtime/command';
import { startSession, view, type PlayView } from '../runtime/session';
import { App } from './App';
import { PER_UNIT } from './discovery';
import { createDriver, type Driver } from './driver';
import { MapPane } from './MapPane';
import { ModalSheet } from './ModalSheet';
import { SHIPPED_SOURCES } from './shippedContent';
import { LABELS } from './labels';

// A run that is under way and going nowhere, which is what a test about what
// is drawn wants: no timer, and the same frame however long the test takes.
const noTicks: Ticker = () => () => undefined;

const ROAST = 'use:entity.tutorial-island.oven.roast chestnuts';
const TALK = 'talk:tutorial-island.miki';

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };

const JOINER = ' · ';

// Every run of text the markup would put in front of a player, with the
// separator this layer joins a list of titles with taken back apart. An
// aria-label is one of those runs: a control named for a screen reader is
// prose a player reads, and leaving it out would exempt from the clause the
// one place a glyph control is allowed to say anything at all.
function readable(html: string): string[] {
  return html
    .replace(/aria-label="([^"]*)"/g, '\n$1\n')
    .replace(/<[^>]*>/g, '\n')
    .split('\n')
    .flatMap((run) => run.split(JOINER))
    .map((run) => run.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity]).trim())
    .filter((run) => /[A-Za-z]/.test(run));
}

function published(view: PlayView): string[] {
  return [
    view.location.title,
    view.location.description,
    ...view.entities.flatMap((entity) => [entity.title, entity.examine ?? '']),
    ...view.choices.flatMap((choice) => [choice.label, choice.detail ?? '']),
    ...view.resources.map((resource) => resource.title),
    ...view.modals.flatMap((modal) => modal.options.flatMap((option) => [option.label, ...(option.values ?? [])])),
    // The map and the character sheet. The four dictionaries publish keys and
    // not titles, so a key is what the engine gave and a key is what the sheet
    // may draw.
    ...view.discovered.flatMap((place) => [place.id, place.title]),
    ...Object.keys(view.inventory),
    ...Object.keys(view.xp),
    ...Object.keys(view.stats),
    ...Object.entries(view.equipment).flat(),
    ...view.said,
  ];
}

// The driver's own vocabulary, taken whole rather than by where it is drawn.
// Excising the <nav> region derived the expectation from the structure under
// test, so no wording could fail it; a table read as a set makes a word the
// shell puts on the screen either an engine value or one of these.
const SHELL_WORDS: readonly string[] = Object.values(LABELS);

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
    '# entity window',
    'title: Window',
    'look out:',
    '  discover: workshop',
    '  discover: overlook',
    '  discover: cove',
    '  discover: shed',
    '  give: 1 ore',
    '  xp: surveying 3',
    '',
  ].join('\n'),
};

const LOOK_OUT = 'use:entity.surveyed.window.look out';

describe('what the shell puts on the screen', () => {
  // The engine's own words are gathered as it publishes them, so this is a
  // comparison against the engine and not against the log that renders it.
  it('renders nothing a player can read that the engine did not publish', () => {
    const driver = createDriver(SHIPPED_SOURCES, { ticker: noTicks });
    const engine = new Set<string>(whatStoppingSays());
    let seen = 0;

    const step = (): void => {
      for (const line of published(driver.snapshot().view!)) engine.add(line);
      const html = renderToStaticMarkup(<App driver={driver} />);

      const runs = readable(html);
      seen += runs.length;
      for (const run of runs) {
        expect([...engine, ...SHELL_WORDS], `"${run}" is on the screen and no engine value produced it`).toContain(run);
      }
    };

    step();
    driver.choose(position(driver, TALK));
    step();
    const menu = driver.snapshot().view!.modals[0].options[0];
    driver.answer(menu.key, menu.values![1]);
    step();
    driver.choose(position(driver, ROAST));
    step();
    driver.cancel();
    driver.choose(position(driver, 'use:entity.tutorial-island.mirror.look in'));
    step();

    // A shell that rendered nothing would satisfy every line above.
    expect(seen).toBeGreaterThan(20);
  });

  // The clause above only refuses what should not be there, so a shell that
  // drew nothing at all would satisfy it. These two say what must be there.
  it('draws every choice the engine is offering', () => {
    const driver = createDriver(SHIPPED_SOURCES);

    const runs = readable(renderToStaticMarkup(<App driver={driver} />));

    for (const choice of driver.snapshot().view!.choices) expect(runs).toContain(choice.label);
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
      expect(node!.runs).toContain(place.title);
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

    const drawn = places(renderToStaticMarkup(<MapPane view={view} arrivals={['surveyed.overlook']} generation={1} onChoose={() => undefined} />));

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

    const html = renderToStaticMarkup(<MapPane view={view} arrivals={[]} generation={0} onChoose={() => undefined} />);

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

    const html = renderToStaticMarkup(<MapPane view={driver.snapshot().view!} arrivals={[]} generation={0} onChoose={() => undefined} />);

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
    const driver = createDriver([SURVEYED]);
    driver.choose(position(driver, LOOK_OUT));
    const view = driver.snapshot().view!;

    const runs = engineRuns(renderToStaticMarkup(<App driver={driver} />));

    expect(Object.keys(view.stats)).toContain('surveyed.might');
    expect(Object.keys(view.inventory)).toContain('surveyed.ore');
    for (const stat of Object.keys(view.stats)) expect(runs).toContain(stat);
    for (const item of Object.keys(view.inventory)) expect(runs).toContain(item);
    for (const skill of Object.keys(view.xp)) expect(runs).toContain(skill);
    for (const [slot, item] of Object.entries(view.equipment)) {
      expect(runs).toContain(slot);
      expect(runs).toContain(item);
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

    expect(html).toContain(`aria-label="${LABELS.command}"`);
    expect(readable(html)).toContain(LABELS.run);
  });

  it('names its two glyph controls with the engine value each one acts on', () => {
    const driver = createDriver(SHIPPED_SOURCES, { ticker: noTicks });
    const running = driver.snapshot().view!.choices.find((choice) => choice.id === ROAST)!.label;
    driver.choose(position(driver, ROAST));

    expect(renderToStaticMarkup(<App driver={driver} />)).toContain(`aria-label="${running}"`);

    const field = { key: 'name', label: 'Name', values: null };
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
    for (const value of menu.values!) expect(readable(asked)).toContain(value);

    driver.answer(menu.key, menu.values![0]);
    const answered = renderToStaticMarkup(<App driver={driver} />);

    // The sheet itself, not merely the words that were on it: a shell holding
    // an answered modal up passes a check that only looks for its options.
    expect(asking(answered)).toBe(false);
  });

  it('renders a modal it has never heard of from the option alone', () => {
    const unheard = { key: 'heading', label: 'Which way from here', values: ['widdershins', 'deosil'] };

    const html = renderToStaticMarkup(<ModalSheet option={unheard} onAnswer={() => undefined} />);

    expect(readable(html)).toEqual([unheard.label, ...unheard.values]);
  });

  it('renders a free-text option as a field with no listed answer', () => {
    const html = renderToStaticMarkup(<ModalSheet option={{ key: 'name', label: 'Name', values: null }} onAnswer={() => undefined} />);

    expect(readable(html)).toEqual(['Name']);
    expect(html).toContain('<input');
  });
});
