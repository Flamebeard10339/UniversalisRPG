import { describe, expect, it } from 'vitest';
import { slotStore } from '../runtime/store';
import { browserSlots } from './browserStore';
import { EDITOR_SLOT, FORGOTTEN, recorded, remembered, type Where } from './editorMemory';
import { pageStorage } from './pageStorage';

// One distinct value per thing the memory holds, exhaustive over the type: a
// field added to `Where` stops this compiling until it has a value here, and
// the walk below then holds the round trip to carrying it.
const MOVED: { [K in keyof Where]: Where[K] } = {
  surface: 'global',
  kind: 'entity',
  open: 'location tutorial-island.beach',
  cursor: 42,
  scroll: 317,
  draft: '# location tutorial-island.beach\nx: 4, y: 0',
  map: { pan: { x: -120.5, y: 88 }, zoom: 2.25, plane: -1 },
};

const KEYS = Object.keys(FORGOTTEN) as Array<keyof Where>;

const overStorage = (): ReturnType<typeof slotStore> => slotStore(browserSlots(((storage) => () => storage)(pageStorage())), () => 0);

describe('where the author was survives the tab (c10)', () => {
  it('remembers nothing when nothing was written', () => {
    expect(remembered(null)).toEqual(FORGOTTEN);
  });

  it('carries every field it holds, one at a time', () => {
    expect(KEYS.length).toBeGreaterThan(5);

    for (const key of KEYS) {
      const where: Where = { ...FORGOTTEN, [key]: MOVED[key] };

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
