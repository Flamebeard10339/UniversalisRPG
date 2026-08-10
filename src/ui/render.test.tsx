import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlayView } from '../runtime/session';
import { App } from './App';
import { createDriver, type Driver } from './driver';
import { ModalSheet } from './ModalSheet';
import { SHIPPED_SOURCES } from './shippedContent';
import { TABS } from './tabs';

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

function position(driver: Driver, choiceId: string): number {
  const at = driver.snapshot().view!.choices.findIndex((choice) => choice.id === choiceId);
  if (at < 0) throw new Error(`no such choice: ${choiceId}`);
  return at + 1;
}

describe('what the shell puts on the screen', () => {
  // The engine's own words are gathered as it publishes them, so this is a
  // comparison against the engine and not against the log that renders it.
  it('renders nothing a player can read that the engine did not publish', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    const engine = new Set<string>();
    let seen = 0;

    const step = (): void => {
      for (const line of published(driver.snapshot().view!)) engine.add(line);
      const runs = readable(renderToStaticMarkup(<App driver={driver} />));
      seen += runs.length;
      for (const run of runs) {
        if (TAB_LABELS.includes(run)) continue;
        expect([...engine], `"${run}" is on the screen and no engine value produced it`).toContain(run);
      }
    };

    step();
    driver.choose(position(driver, 'talk:tutorial-island.miki'));
    step();
    const menu = driver.snapshot().view!.modals[0].options[0];
    driver.answer(menu.key, menu.values![1]);
    step();
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

  it('draws the modal the engine is asking for, and stops once it is answered', () => {
    const driver = createDriver(SHIPPED_SOURCES);
    driver.choose(position(driver, 'talk:tutorial-island.miki'));
    const menu = driver.snapshot().view!.modals[0].options[0];

    const asked = readable(renderToStaticMarkup(<App driver={driver} />));
    for (const value of menu.values!) expect(asked).toContain(value);

    driver.answer(menu.key, menu.values![0]);
    const answered = readable(renderToStaticMarkup(<App driver={driver} />));
    for (const value of menu.values!) expect(answered).not.toContain(value);
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
