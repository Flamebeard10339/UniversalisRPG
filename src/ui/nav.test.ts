import { describe, expect, it } from 'vitest';
import { LABELS } from './labels';
import { across, bodyHeights, BOUNDARIES, HOME_LAYER, LAYERS, layerOffsets, layerSpan, OPENING, pageOf, pageRested, shownIn, subpageOf, toLayer, toSubpage } from './nav';

const BANDS = { height: 700, banners: [60, 40] };

describe('the layers', () => {
  it('opens in the middle, with one layer above and one below', () => {
    expect(LAYERS.map((layer) => layer.id)).toEqual(['map', 'home', 'character']);
    expect(OPENING.layer).toBe(HOME_LAYER);
    expect(HOME_LAYER).toBe(1);
  });

  it('has one banner fewer than it has layers, since each is shared', () => {
    expect(BOUNDARIES).toBe(LAYERS.length - 1);
  });

  it('crosses a banner to whichever of its two layers the player is not on', () => {
    expect(across(1, 0)).toBe(0);
    expect(across(0, 0)).toBe(1);
    expect(across(1, 1)).toBe(2);
    expect(across(2, 1)).toBe(1);
  });

  it('stops at the top and the bottom rather than wrapping round', () => {
    expect(toLayer(OPENING, -1).layer).toBe(0);
    expect(toLayer(OPENING, 9).layer).toBe(LAYERS.length - 1);
  });
});

describe('where each layer rests', () => {
  it('opens the top layer at the top, with no banner above it', () => {
    expect(layerOffsets(BANDS)[0]).toBe(0);
  });

  it('steps down by a screen less the banner it crossed, so the banner is not paid for twice', () => {
    expect(layerOffsets(BANDS)).toEqual([0, 700 - 60, 1400 - 60 - 40]);
  });

  it('gives every layer the room it is not lending to a banner', () => {
    expect(bodyHeights(BANDS)).toEqual([700 - 60, 700 - 60 - 40, 700 - 40]);
  });

  it('leaves the column flat until something has been measured', () => {
    expect(layerOffsets({ height: 0, banners: [0, 0] })).toEqual([0, 0, 0]);
    expect(bodyHeights({ height: 0, banners: [0, 0] })).toEqual([0, 0, 0]);
  });

  it('ends the column exactly one screen past where the last layer rests', () => {
    const offsets = layerOffsets(BANDS);
    const column = bodyHeights(BANDS).reduce((total, body) => total + body, 0) + BANDS.banners.reduce((total, band) => total + band, 0);

    expect(column - offsets[offsets.length - 1]).toBe(BANDS.height);
  });

  it('judges a release against the distance it was going, which is not a whole screen', () => {
    const offsets = layerOffsets(BANDS);

    expect(layerSpan(offsets, 1, -10)).toBe(700 - 40);
    expect(layerSpan(offsets, 1, 10)).toBe(700 - 60);
    expect(layerSpan(offsets, 0, 10)).toBe(0);
    expect(layerSpan(offsets, 2, -10)).toBe(0);
  });
});

const CHARACTER = LAYERS.findIndex((layer) => layer.id === 'character');

describe('the page each layer was left on', () => {
  it('opens each layer where that layer says it opens', () => {
    expect(OPENING.subpage).toEqual(LAYERS.map((layer) => layer.opens));
    expect(subpageOf(OPENING)).toBe(LAYERS[HOME_LAYER].opens);
  });

  it('comes back to the page a layer was left on rather than to where it starts', () => {
    const last = LAYERS[CHARACTER].subpages[LAYERS[CHARACTER].subpages.length - 1].id;

    const left = toSubpage(toLayer(OPENING, CHARACTER), CHARACTER, last);
    const back = toLayer(toLayer(left, HOME_LAYER), CHARACTER);

    expect(subpageOf(back)).toBe(last);
  });

  it('remembers each layer separately, so one page is never mistaken for another', () => {
    const moved = toSubpage(toSubpage(OPENING, CHARACTER, 'equipment'), HOME_LAYER, 'edit');

    expect(subpageOf(toLayer(moved, CHARACTER))).toBe('equipment');
    expect(subpageOf(toLayer(moved, HOME_LAYER))).toBe('edit');
  });

  it('moves a page without moving the layer the player is standing on', () => {
    const moved = toSubpage(OPENING, CHARACTER, 'equipment');

    expect(moved.layer).toBe(OPENING.layer);
    expect(subpageOf(moved)).toBe(subpageOf(OPENING));
    expect(moved.subpage[CHARACTER]).toBe('equipment');
  });

  it('falls back to where a layer opens rather than to a page that layer has not got', () => {
    expect(toSubpage(OPENING, HOME_LAYER, 'inventory').subpage[HOME_LAYER]).toBe(LAYERS[HOME_LAYER].opens);
    expect(toSubpage(OPENING, CHARACTER, 'edit').subpage[CHARACTER]).toBe(LAYERS[CHARACTER].opens);
  });
});

describe('the pages a session is allowed to see', () => {
  it('keeps a dev-only page out of the tab bar until the session is a developer', () => {
    const home = LAYERS[HOME_LAYER];

    expect(shownIn(home, true).map((subpage) => subpage.id)).toEqual(home.subpages.map((subpage) => subpage.id));
    expect(shownIn(home, false).map((subpage) => subpage.id)).toEqual(home.subpages.filter((subpage) => !subpage.dev).map((subpage) => subpage.id));
    expect(shownIn(home, false).length).toBeLessThan(home.subpages.length);
  });

  it('declares at least one dev-only page and never opens a layer on one', () => {
    expect(LAYERS.flatMap((layer) => layer.subpages.filter((subpage) => subpage.dev)).length).toBeGreaterThan(0);

    for (const layer of LAYERS) {
      expect(shownIn(layer, false).length, layer.id).toBeGreaterThan(0);
      expect(shownIn(layer, false).map((subpage) => subpage.id), layer.id).toContain(layer.opens);
    }
  });

  it('leaves the author on the page they were on when the mode is turned on or off', () => {
    const settings = toSubpage(OPENING, HOME_LAYER, 'settings');

    expect(shownIn(LAYERS[HOME_LAYER], true)[pageOf(settings, HOME_LAYER, true)].id).toBe('settings');
    expect(shownIn(LAYERS[HOME_LAYER], false)[pageOf(settings, HOME_LAYER, false)].id).toBe('settings');
  });

  it('never rests a layer past the last place its columns leave it to rest', () => {
    const settings = toSubpage(OPENING, HOME_LAYER, 'settings');

    expect(shownIn(LAYERS[HOME_LAYER], false).map((subpage) => subpage.id)).toEqual(['home', 'settings']);
    expect(pageOf(settings, HOME_LAYER, false)).toBe(1);
    expect(pageRested(settings, HOME_LAYER, false, 1)).toBe(1);
    expect(pageRested(settings, HOME_LAYER, false, 2)).toBe(0);
    expect(pageRested(settings, HOME_LAYER, true, 2)).toBe(1);
  });

  it('shows where a layer opens when the page it was left on is one the session cannot see', () => {
    const editing = toSubpage(OPENING, HOME_LAYER, 'edit');

    expect(shownIn(LAYERS[HOME_LAYER], true)[pageOf(editing, HOME_LAYER, true)].id).toBe('edit');
    expect(shownIn(LAYERS[HOME_LAYER], false)[pageOf(editing, HOME_LAYER, false)].id).toBe(LAYERS[HOME_LAYER].opens);
    expect(subpageOf(editing)).toBe('edit');
  });
});

describe('what the nav owes the rest of the shell', () => {
  it('lands Settings and Edit beside Home, which is where the spec leaves them', () => {
    expect(LAYERS[HOME_LAYER].subpages.map((subpage) => subpage.id)).toContain('settings');
    expect(LAYERS[HOME_LAYER].subpages.map((subpage) => subpage.id)).toContain('edit');
    expect(LAYERS[HOME_LAYER].opens).toBe('home');
  });

  it('gives every layer a page to be on and every page a word to be called', () => {
    for (const layer of LAYERS) {
      expect(layer.subpages.length).toBeGreaterThan(0);
      expect(layer.subpages.map((subpage) => subpage.id)).toContain(layer.opens);
      for (const subpage of layer.subpages) expect(LABELS[subpage.id]).toBeTruthy();
    }
  });
});
