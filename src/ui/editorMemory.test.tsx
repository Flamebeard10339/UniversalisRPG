import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { slotStore } from '../runtime/store';
import { App } from './App';
import { pageStorage } from './agent/pageStorage';
import { browserSlots } from './browserStore';
import { createDriver } from './driver';
import { SHIPPED_SOURCES } from './shippedContent';
import { EDITOR_SLOT, FORGOTTEN, recorded, remembered, type Editing } from './editorMemory';

// One distinct value per thing the memory holds, exhaustive over the type: a
// field added to `Editing` stops this compiling until it has a value here, and
// the walk below then holds the round trip to carrying it.
const MOVED: { [K in keyof Editing]: Editing[K] } = {
  surface: 'global',
  kind: 'entity',
  open: 'location tutorial-island.beach',
  cursor: 42,
  scroll: 317,
  draft: '# location tutorial-island.beach\nx: 4, y: 0',
  map: { pan: { x: -120.5, y: 88 }, zoom: 2.25, plane: -1 },
};

const KEYS = Object.keys(FORGOTTEN) as Array<keyof Editing>;

const overStorage = (): ReturnType<typeof slotStore> => slotStore(browserSlots(((storage) => () => storage)(pageStorage())), () => 0);

describe('where the author was survives the tab (c10)', () => {
  it('remembers nothing when nothing was written', () => {
    expect(remembered(null)).toEqual(FORGOTTEN);
  });

  it('carries every field it holds, one at a time', () => {
    expect(KEYS.length).toBeGreaterThan(5);

    for (const key of KEYS) {
      const where: Editing = { ...FORGOTTEN, [key]: MOVED[key] };

      expect(remembered(recorded(where)), key).toEqual(where);
      // And the field really moved, so a round trip that dropped it would show.
      expect(remembered(recorded(where))[key], key).not.toEqual(FORGOTTEN[key]);
    }
  });

  it('carries all of them at once, through the store the edits are in', () => {
    const store = overStorage();
    store.write(EDITOR_SLOT, recorded(MOVED));

    expect(remembered(store.read(EDITOR_SLOT)!.payload)).toEqual(MOVED);
  });

  // Field by field rather than all-or-nothing: a slot an older build wrote says
  // less than this one asks for, and the newest field being absent must not
  // cost the whole memory.
  it('keeps what it can make sense of and forgets the rest', () => {
    expect(remembered('not json at all')).toEqual(FORGOTTEN);
    expect(remembered('[1, 2, 3]')).toEqual(FORGOTTEN);
    expect(remembered('{"surface":"nowhere","cursor":"seventeen"}')).toEqual(FORGOTTEN);
    expect(remembered('{"open":"entity tutorial-island.miki"}')).toEqual({ ...FORGOTTEN, open: 'entity tutorial-island.miki' });
    expect(remembered('{"map":{"zoom":3}}')).toEqual({ ...FORGOTTEN, map: { ...FORGOTTEN.map, zoom: 3 } });
    expect(remembered('{"map":{"pan":{"x":5},"plane":null}}')).toEqual({ ...FORGOTTEN, map: { ...FORGOTTEN.map, pan: { x: 5, y: 0 } } });
  });

  it('tells a floor of zero from no floor asked for', () => {
    expect(remembered(recorded({ ...FORGOTTEN, map: { ...FORGOTTEN.map, plane: 0 } })).map.plane).toBe(0);
    expect(remembered(recorded(FORGOTTEN)).map.plane).toBeNull();
  });
});

// A driver standing in a store that already holds where the author was, which
// is what reopening the tab is. `renderToStaticMarkup` runs no effect, so what
// the markup below shows is what the first frame shows: the restore is the
// value the shell opens holding, not something an effect puts back afterwards.
function reopened(where: Editing | null): string {
  const storage = pageStorage();
  const slots = browserSlots(() => storage);
  if (where) slotStore(slots, () => 0).write(EDITOR_SLOT, recorded(where));
  return renderToStaticMarkup(<App driver={createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined })} />);
}

const attribute = (html: string, name: string): string[] => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map(([, value]) => value);

// The section the tutorial opens standing next to, which is one the Local
// surface offers — found rather than named, so it survives the content moving.
const OPENED = 'entity tutorial-island.miki';

describe('where the author was is on the screen when the page opens (c10)', () => {
  it('opens on the surface it was left on, with the section it had open', () => {
    const html = reopened({ ...FORGOTTEN, surface: 'global', kind: 'item', open: 'item tutorial-island.iron-sword' });

    expect(html).toContain('data-surface="global"');
    expect(html).toContain('data-showing="yes"');
    expect(attribute(html, 'data-opened')).toEqual(['yes']);
    expect(html).toContain('data-section="item tutorial-island.iron-sword"');
    // And the filter it was narrowed to, which is what makes the list the one
    // the author left rather than the whole of it.
    expect(attribute(html, 'data-section').every((section) => section.startsWith('item '))).toBe(true);
  });

  // The pan drawn is the pan asked for held against the room the sheet has, so
  // what is asserted is the zoom and the floor as asked, and that the sheet is
  // not standing where a sheet nobody had panned would stand.
  it('opens where the map was looking, at the zoom and on the floor it was left at', () => {
    const html = reopened({ ...FORGOTTEN, map: { pan: { x: -77, y: 33 }, zoom: 2.5, plane: -1 } });

    expect(html).toContain('scale(2.5)');
    expect(html).toContain('data-floor="-1" data-drawn="yes"');
    expect(attribute(html, 'style').filter((style) => style.includes('translate'))).not.toEqual(
      attribute(reopened(null), 'style').filter((style) => style.includes('translate')),
    );
  });

  it('opens on none of it over a store that was never written', () => {
    const html = reopened(null);

    expect(attribute(html, 'data-opened')).toEqual([]);
    expect(html).toContain('data-surface="local"');
    expect(html).toContain('translate(0px, 0px) scale(1)');
    expect(html).not.toContain('data-floor="-1" data-drawn="yes"');
  });

  // The two positions a static render cannot show, carried as far as it can be
  // seen: they are fields of the same value the assertions above prove came out
  // of the store. Assigning them to a DOM node is an effect, and this suite
  // runs none — that inch is the author's to look at, and it is said here
  // rather than left to be discovered.
  it('opens holding the cursor and the scroll it was left with', () => {
    const storage = pageStorage();
    const slots = browserSlots(() => storage);
    const where: Editing = { ...FORGOTTEN, open: OPENED, cursor: 42, scroll: 317 };
    slotStore(slots, () => 0).write(EDITOR_SLOT, recorded(where));

    expect(remembered(createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined }).editorMemory.read())).toEqual(where);
  });
});
