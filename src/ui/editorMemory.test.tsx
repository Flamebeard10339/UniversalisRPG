import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { slotStore } from '../runtime/store';
import { App } from './App';
import { pageStorage } from './agent/pageStorage';
import { browserSlots } from './browserStore';
import { createDriver } from './driver';
import { addressable } from './authoringSurface';
import { sectionKey } from './editControls';
import { EDITOR_SLOT, FORGOTTEN, recorded, remembered, type Editing } from './editorMemory';
import { SPLIT_MAX, SPLIT_MIN } from './gesture';
import { fixtureSources } from '../content/worldFixture';

const MOVED: { [K in keyof Editing]: Editing[K] } = {
  surface: 'global',
  kind: 'entity',
  query: 'tutorial sword',
  open: 'location tulsa.beach',
  cursor: 42,
  scroll: 317,
  draft: '# location tulsa.beach\nx: 4, y: 0',
  split: 0.3,
  commandLine: true,
  map: { pan: { x: -120.5, y: 88 }, zoom: 2.25, plane: -1 },
  where: { layer: 0, subpage: ['map', 'settings', 'journal'] },
};

const KEYS = Object.keys(FORGOTTEN) as Array<keyof Editing>;

const overStorage = (): ReturnType<typeof slotStore> => slotStore(browserSlots(((storage) => () => storage)(pageStorage())), () => 0);

describe('where the author was survives the tab (c10)', () => {
  it('remembers nothing when nothing was written', () => {
    expect(remembered(null)).toEqual(FORGOTTEN);
  });

  it('pulls a remembered division back into the band the handle can reach', () => {
    expect(remembered(JSON.stringify({ split: 9 })).split).toBe(SPLIT_MAX);
    expect(remembered(JSON.stringify({ split: -1 })).split).toBe(SPLIT_MIN);
    expect(remembered(JSON.stringify({ split: 'halfway' })).split).toBe(FORGOTTEN.split);
  });

  it('carries every field it holds, one at a time', () => {
    expect(KEYS.length).toBeGreaterThan(5);

    for (const key of KEYS) {
      const where: Editing = { ...FORGOTTEN, [key]: MOVED[key] };

      expect(remembered(recorded(where)), key).toEqual(where);
      expect(remembered(recorded(where))[key], key).not.toEqual(FORGOTTEN[key]);
    }
  });

  it('carries all of them at once, through the store the edits are in', () => {
    const store = overStorage();
    store.write(EDITOR_SLOT, recorded(MOVED));

    expect(remembered(store.read(EDITOR_SLOT)!.payload)).toEqual(MOVED);
  });

  it('keeps what it can make sense of and forgets the rest', () => {
    expect(remembered('not json at all')).toEqual(FORGOTTEN);
    expect(remembered('[1, 2, 3]')).toEqual(FORGOTTEN);
    expect(remembered('{"surface":"nowhere","cursor":"seventeen"}')).toEqual(FORGOTTEN);
    expect(remembered('{"open":"entity first-steps.miki"}')).toEqual({ ...FORGOTTEN, open: 'entity first-steps.miki' });
    expect(remembered('{"map":{"zoom":3}}')).toEqual({ ...FORGOTTEN, map: { ...FORGOTTEN.map, zoom: 3 } });
    expect(remembered('{"map":{"pan":{"x":5},"plane":null}}')).toEqual({ ...FORGOTTEN, map: { ...FORGOTTEN.map, pan: { x: 5, y: 0 } } });
  });

  it('tells a floor of zero from no floor asked for', () => {
    expect(remembered(recorded({ ...FORGOTTEN, map: { ...FORGOTTEN.map, plane: 0 } })).map.plane).toBe(0);
    expect(remembered(recorded(FORGOTTEN)).map.plane).toBeNull();
  });
});

const DOWNSTAIRS = '/goto first-steps.basement';

function reopened(where: Editing | null, walk?: string): string {
  const storage = pageStorage();
  const slots = browserSlots(() => storage);
  if (where) slotStore(slots, () => 0).write(EDITOR_SLOT, recorded(where));
  const driver = createDriver(fixtureSources(), { slots, ticker: () => () => undefined });
  driver.send('/dev on');
  if (walk) driver.send(walk);
  return renderToStaticMarkup(<App driver={driver} />);
}

const attribute = (html: string, name: string): string[] => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map(([, value]) => value);

const paired = (html: string, names: string, marks: string): string[] =>
  [...html.matchAll(new RegExp(`${names}="([^"]*)"[^>]*${marks}="yes"`, 'g'))].map(([, value]) => value);

const showing = (html: string): string[] => paired(html, 'data-surface', 'data-showing');

const opened = (html: string): string[] => paired(html, 'data-section', 'data-opened');

const addressed = addressable(fixtureSources());

const found = (kind: string): string => {
  const section = addressed.find((each) => each.kind === kind);
  if (!section) throw new Error(`the shipped modules hold no # ${kind}`);
  return sectionKey(section);
};

const OPENED = found('entity');

const NARROWED = found('item');

describe('where the author was is on the screen when the page opens (c10)', () => {
  it('opens on the surface it was left on, with the section it had open', () => {
    const html = reopened({ ...FORGOTTEN, surface: 'global', kind: 'item', open: NARROWED });

    expect(showing(html)).toEqual(['global']);
    expect(opened(html)).toEqual([NARROWED]);
    expect(attribute(html, 'data-section').every((section) => section.startsWith('item '))).toBe(true);
  });

  it('opens where the map was looking, at the zoom and on the floor it was left at', () => {
    const html = reopened({ ...FORGOTTEN, map: { pan: { x: -77, y: 33 }, zoom: 2.5, plane: -1 } }, DOWNSTAIRS);

    expect(html).toContain('scale(2.5)');
    expect(html).toContain('data-floor="-1" data-drawn="yes"');
    expect(attribute(html, 'style').filter((style) => style.includes('translate'))).not.toEqual(
      attribute(reopened(null, DOWNSTAIRS), 'style').filter((style) => style.includes('translate')),
    );
  });

  it('opens on none of it over a store that was never written', () => {
    const html = reopened(null);

    expect(opened(html)).toEqual([]);
    expect(showing(html)).toEqual(['local']);
    expect(html).toContain('translate(0px, 0px) scale(1)');
    expect(html).not.toContain('data-floor="-1" data-drawn="yes"');
  });

  it('opens on the page it was left on, so a reload does not put the tab back to the start', () => {
    const held: Editing = { ...FORGOTTEN, where: { layer: 1, subpage: ['map', 'settings', 'journal'] } };

    const html = reopened(held);

    expect(html).toContain('data-subpage="settings" data-drawn="yes"');
    expect(reopened(null)).not.toContain('data-subpage="settings" data-drawn="yes"');
  });

  it('opens holding the cursor and the scroll it was left with', () => {
    const storage = pageStorage();
    const slots = browserSlots(() => storage);
    const where: Editing = { ...FORGOTTEN, open: OPENED, cursor: 42, scroll: 317 };
    slotStore(slots, () => 0).write(EDITOR_SLOT, recorded(where));

    expect(remembered(createDriver(fixtureSources(), { slots, ticker: () => () => undefined }).editorMemory.read())).toEqual(where);
  });
});
