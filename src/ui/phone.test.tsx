import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { localizerFor } from '../runtime/localized';
import { App } from './App';
import { createDriver } from './driver';
import { SPLIT_DEFAULT } from './gesture';
import { BOUNDARIES, LAYERS, shownIn } from './nav';
import { SHIPPED_SOURCES } from './shippedContent';
import { TabBar } from './TabBar';
import { wordsOf } from './words';

const here = fileURLToPath(new URL('.', import.meta.url));

const shellWord = wordsOf(localizerFor(loadInEnglish(''), 'en'));

function modulesUnder(directory: string, prefix: string): Array<{ file: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, text: readFileSync(path, 'utf8') }];
  });
}

const SOURCES = [
  ...modulesUnder(here, 'src/ui'),
  { file: 'src/main.tsx', text: readFileSync(resolve(here, '..', 'main.tsx'), 'utf8') },
  { file: 'src/index.css', text: readFileSync(resolve(here, '..', 'index.css'), 'utf8') },
];

const NOT_A_FINGER = [/onMouse(?:Enter|Over|Leave|Out)\b/, /onContextMenu\b/, /onDoubleClick\b/, /onKey(?:Down|Up|Press)\b/, /\bhover:/, /:hover\b/, /group-hover/];

const markup = (): string => renderToStaticMarkup(<App driver={createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined })} />);

const attributes = (html: string, name: string): string[] => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map(([, value]) => value);

describe('the layout a phone is held to', () => {
  it('offers nothing that answers only to a hover, a right-click or a key', () => {
    expect(SOURCES.length).toBeGreaterThan(6);
    for (const source of SOURCES) {
      for (const affordance of NOT_A_FINGER) expect(source.text, `${source.file} reaches for ${affordance}`).not.toMatch(affordance);
    }
  });

  it('clips the shell to the window, so nothing can push the page sideways', () => {
    const root = markup().match(/^<div class="([^"]*)"/);

    expect(root, 'the shell has no root element').not.toBeNull();
    expect(root![1]).toContain('overflow-hidden');
    expect(root![1]).toContain('h-[100dvh]');
  });

  it('gives every boundary between two layers a control that is tapped rather than swiped', () => {
    const drawn = attributes(markup(), 'data-boundary');

    expect(drawn).toEqual(Array.from({ length: BOUNDARIES }, (_, at) => String(at)));
  });

  it('gives every subpage of every layer a control that is tapped rather than swiped', () => {
    for (const layer of LAYERS) {
      const bar = renderToStaticMarkup(
        <TabBar tabs={layer.subpages} active={layer.subpages.findIndex((subpage) => subpage.id === layer.opens)} onSelect={() => undefined} words={shellWord} />,
      );

      expect(attributes(bar, 'data-subpage'), layer.id).toEqual(layer.subpages.map((subpage) => subpage.id));
    }
  });

  it('puts the tab bar below everything else in the shell', () => {
    const html = markup();

    expect(html.indexOf('<nav')).toBeGreaterThan(html.indexOf('</main>'));
    expect(html.indexOf('<nav')).toBeGreaterThan(-1);
  });

  it('never gives the narration more than half of what it shares with the choices', () => {
    expect(SPLIT_DEFAULT).toBeLessThanOrEqual(0.5);
  });

  it('draws the tab bar of the layer the player is standing on, and not the whole app', () => {
    const opening = LAYERS.find((layer) => layer.id === 'home')!;

    expect(attributes(markup(), 'data-subpage')).toEqual(shownIn(opening, false).map((subpage) => subpage.id));
  });
});

describe('the tab bar of a screen showing more than one page', () => {
  const bar = (columns: number): string =>
    renderToStaticMarkup(<TabBar tabs={[{ id: 'home' }, { id: 'settings' }]} active={0} columns={columns} onSelect={() => undefined} words={shellWord} />);

  const lit = (html: string): string[] => [...html.matchAll(/data-subpage="([^"]*)" data-drawn="yes"/g)].map(([, id]) => id);

  it('lights every tab the strip is showing, not only the one it rests on', () => {
    expect(lit(bar(1))).toEqual(['home']);
    expect(lit(bar(2))).toEqual(['home', 'settings']);
  });
});
