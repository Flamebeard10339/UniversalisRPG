import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/registry';
import { newContext, runLine } from '../runtime/command';
import { startSession, view, type PlayView } from '../runtime/session';
import { App } from './App';
import { createDriver, type Driver } from './driver';
import type { Ticker } from './live';
import { ModalSheet } from './ModalSheet';
import { SHIPPED_SOURCES } from './shippedContent';
import { TABS } from './tabs';

// A run that is under way and going nowhere, which is what a test about what
// is drawn wants: no timer, and the same frame however long the test takes.
const noTicks: Ticker = () => () => undefined;

const ROAST = 'use:entity.tutorial-island.oven.roast chestnuts';
const TALK = 'talk:tutorial-island.miki';

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };

const JOINER = ' · ';

// Every run of text the markup would put in front of a player, with the
// separator this layer joins a list of titles with taken back apart.
function readable(html: string): string[] {
  return html
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
    ...view.said,
  ];
}

const TAB_LABELS = TABS.map((tab) => tab.label);

// The engine speaks in messages as well as in views, and a driver logs both.
// Taken by stopping a run against a session of its own, because typing the
// words here would be this test composing the prose it exists to refuse.
function whatStoppingSays(): string[] {
  const session = startSession(loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry);
  const opening = view(session);
  const armed = runLine(newContext(session, opening, { driving: true }), String(opening.choices.findIndex((choice) => choice.id === ROAST) + 1));
  return armed.live!.end(true).output.flatMap((output) => (output.kind === 'message' ? [output.text] : []));
}

// The nav is the one region whose words this layer owns, so it is taken out by
// where it is rather than by what it says. Skipping the five labels wherever
// they appeared let a narration header the clause does enumerate be replaced
// with the word Character and pass.
const NAV = /<nav[\s\S]*?<\/nav>/g;
const asking = (html: string): boolean => html.includes('role="dialog"');

function position(driver: Driver, choiceId: string): number {
  const at = driver.snapshot().view!.choices.findIndex((choice) => choice.id === choiceId);
  if (at < 0) throw new Error(`no such choice: ${choiceId}`);
  return at + 1;
}

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
      expect(readable(html.match(NAV)?.join('') ?? '')).toEqual(TAB_LABELS);

      const runs = readable(html.replace(NAV, ''));
      seen += runs.length;
      for (const run of runs) {
        expect([...engine], `"${run}" is on the screen and no engine value produced it`).toContain(run);
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

  it('draws the run in place of the choices while it lasts, and hands them back when it stops', () => {
    const driver = createDriver(SHIPPED_SOURCES, { ticker: noTicks });
    const idle = driver.snapshot().view!.choices;
    const running = idle.find((choice) => choice.id === ROAST)!.label;
    const other = idle.find((choice) => choice.id === TALK)!.label;

    driver.choose(position(driver, ROAST));
    const under = readable(renderToStaticMarkup(<App driver={driver} />).replace(NAV, ''));

    expect(under).toContain(running);
    // The world's choices resolve against a world the next tick is about to
    // move, so none of them is on the screen while one is under way.
    expect(under).not.toContain(other);

    driver.cancel();
    const stopped = readable(renderToStaticMarkup(<App driver={driver} />).replace(NAV, ''));

    expect(stopped).toContain(other);
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
