import { clampIndex } from './gesture';
import type { LabelId } from './labels';

export type LayerId = 'map' | 'home' | 'character';

export interface Subpage {
  id: LabelId;
}

export interface Layer {
  id: LayerId;
  subpages: readonly Subpage[];
  opens: number;
}

export const LAYERS: readonly Layer[] = [
  {
    id: 'map',
    opens: 0,
    subpages: [{ id: 'map' }],
  },
  {
    id: 'home',
    opens: 1,
    subpages: [
      { id: 'edit' },
      { id: 'home' },
      { id: 'settings' },
    ],
  },
  {
    id: 'character',
    opens: 0,
    subpages: [
      { id: 'stats' },
      { id: 'skills' },
      { id: 'equipment' },
      { id: 'inventory' },
    ],
  },
];

export const HOME_LAYER = LAYERS.findIndex((layer) => layer.id === 'home');

export const BOUNDARIES = LAYERS.length - 1;

export interface Where {
  layer: number;
  subpage: readonly number[];
}

export const OPENING: Where = { layer: HOME_LAYER, subpage: LAYERS.map((layer) => layer.opens) };

export const subpageOf = (where: Where): number => where.subpage[where.layer];

export function toLayer(where: Where, layer: number): Where {
  return { ...where, layer: clampIndex(layer, LAYERS.length) };
}

export function toSubpage(where: Where, layer: number, at: number): Where {
  const held = clampIndex(layer, LAYERS.length);
  const subpage = [...where.subpage];
  subpage[held] = clampIndex(at, LAYERS[held].subpages.length);
  return { ...where, subpage };
}

export function across(layer: number, boundary: number): number {
  return layer === boundary ? boundary + 1 : boundary;
}

export interface Bands {
  height: number;
  banners: readonly number[];
}

export function layerOffsets({ height, banners }: Bands): number[] {
  const offsets = [0];
  for (let layer = 1; layer < LAYERS.length; layer += 1) offsets.push(offsets[layer - 1] + Math.max(0, height - (banners[layer - 1] ?? 0)));
  return offsets;
}

export function bodyHeights({ height, banners }: Bands): number[] {
  return LAYERS.map((_, layer) => Math.max(0, height - (banners[layer - 1] ?? 0) - (banners[layer] ?? 0)));
}

export function layerSpan(offsets: readonly number[], layer: number, dy: number): number {
  const toward = offsets[dy > 0 ? layer - 1 : layer + 1];
  return toward === undefined ? 0 : Math.abs(toward - offsets[layer]);
}
