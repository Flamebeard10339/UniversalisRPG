import { clampIndex } from './gesture';

// The nav has two axes. A layer is a context and is reached vertically; a
// subpage is a page inside one layer and is reached horizontally. Between two
// layers there is one banner and not two edges: the banner a player reads to
// know where they are is the same strip they touch to go there, which is why
// the top layer needs no banner above it and the bottom none below.

export type LayerId = 'map' | 'home' | 'character';

export interface Subpage {
  id: string;
  label: string;
}

export interface Layer {
  id: LayerId;
  subpages: readonly Subpage[];
  // Which subpage the layer shows the first time it is entered.
  opens: number;
}

export const LAYERS: readonly Layer[] = [
  {
    id: 'map',
    opens: 0,
    subpages: [
      { id: 'local', label: 'Local' },
      { id: 'region', label: 'Region' },
      { id: 'world', label: 'World' },
    ],
  },
  {
    id: 'home',
    opens: 1,
    subpages: [
      { id: 'edit', label: 'Edit' },
      { id: 'home', label: 'Home' },
      { id: 'settings', label: 'Settings' },
    ],
  },
  {
    id: 'character',
    opens: 0,
    subpages: [
      { id: 'stats', label: 'Stats' },
      { id: 'equipment', label: 'Equipment' },
      { id: 'inventory', label: 'Inventory' },
    ],
  },
];

export const HOME_LAYER = LAYERS.findIndex((layer) => layer.id === 'home');

// One fewer than the layers, because each boundary is the banner two layers
// share.
export const BOUNDARIES = LAYERS.length - 1;

export interface Where {
  layer: number;
  // The subpage each layer was last left on, one entry per layer. Held for
  // every layer rather than only the current one, so returning to Character
  // comes back to Inventory instead of to wherever Character starts.
  subpage: readonly number[];
}

export const OPENING: Where = { layer: HOME_LAYER, subpage: LAYERS.map((layer) => layer.opens) };

export const subpageOf = (where: Where): number => where.subpage[where.layer];

export function toLayer(where: Where, layer: number): Where {
  return { ...where, layer: clampIndex(layer, LAYERS.length) };
}

// Named rather than implied, because a layer's pages move whether or not the
// player is standing on it and a horizontal move must not become a vertical one.
export function toSubpage(where: Where, layer: number, at: number): Where {
  const held = clampIndex(layer, LAYERS.length);
  const subpage = [...where.subpage];
  subpage[held] = clampIndex(at, LAYERS[held].subpages.length);
  return { ...where, subpage };
}

// Boundary b joins layer b and layer b + 1, so touching it goes to whichever of
// the two the player is not standing on. That is what makes one banner the
// handle in both directions.
export function across(layer: number, boundary: number): number {
  return layer === boundary ? boundary + 1 : boundary;
}

export interface Bands {
  // One layer's worth of room: the height of the window the column moves behind.
  height: number;
  // How tall each boundary's banner measured, in boundary order.
  banners: readonly number[];
}

// Where each layer comes to rest, as a distance down the column. A layer's
// window opens at the banner above it, so each step down is a screen less the
// banner that was crossed.
export function layerOffsets({ height, banners }: Bands): number[] {
  const offsets = [0];
  for (let layer = 1; layer < LAYERS.length; layer += 1) offsets.push(offsets[layer - 1] + Math.max(0, height - (banners[layer - 1] ?? 0)));
  return offsets;
}

// How much room each layer's own body gets: a screen less every banner that
// borders it. Two layers sharing one banner is the whole saving, and this is
// where it is spent.
export function bodyHeights({ height, banners }: Bands): number[] {
  return LAYERS.map((_, layer) => Math.max(0, height - (banners[layer - 1] ?? 0) - (banners[layer] ?? 0)));
}

// What a release is judged against. The layers are not evenly spaced — each
// pair sits one banner's worth closer than a whole screen — so a drag is
// measured against the distance it was actually going rather than a screen.
export function layerSpan(offsets: readonly number[], layer: number, dy: number): number {
  const toward = offsets[dy > 0 ? layer - 1 : layer + 1];
  return toward === undefined ? 0 : Math.abs(toward - offsets[layer]);
}
