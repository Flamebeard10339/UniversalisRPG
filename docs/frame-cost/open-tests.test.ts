import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureSources } from '../../src/content/worldFixture';
import { App } from '../../src/ui/App';
import { createDriver } from '../../src/ui/driver';
import { LAYERS, OPENING, toLayer, toSubpage, type Where } from '../../src/ui/nav';
import type { Ticker } from '../../src/runtime/command';

const noTicks: Ticker = () => () => undefined;

const CHARACTER = LAYERS.findIndex((layer) => layer.id === 'character');

const drawnAt = (opening: Where): string => {
  const driver = createDriver(fixtureSources(), { ticker: noTicks });
  return renderToStaticMarkup(createElement(App, { driver, opening }));
};

const onTheJournal = (): Where => toSubpage(toLayer(OPENING, CHARACTER), CHARACTER, 'journal');

const JOURNAL_ROW = 'data-standing';

describe('a-frame-draws-only-what-a-swipe-can-reach', () => {
  it('draws the journal when the player is standing on it, so the claim below is not vacuous', () => {
    expect(drawnAt(onTheJournal())).toContain(JOURNAL_ROW);
  });

  it('draws the home screen the player opened on', () => {
    expect(drawnAt(OPENING)).toContain('data-drive="choose"');
  });

  it('does not draw the journal while the player stands on the home screen, four pages and a layer away', () => {
    expect(drawnAt(OPENING)).not.toContain(JOURNAL_ROW);
  });
});
