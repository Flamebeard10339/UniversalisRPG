import { clampIndex, pagesIn } from './gesture';
import type { LabelId } from './labels';

export type LayerId = 'map' | 'home' | 'character';

export interface Subpage {
  id: LabelId;
  dev?: true;
}

export interface Layer {
  id: LayerId;
  subpages: readonly Subpage[];
  opens: LabelId;
}

export const LAYERS: readonly Layer[] = [
  {
    id: 'map',
    opens: 'map',
    subpages: [{ id: 'map' }],
  },
  {
    id: 'home',
    opens: 'home',
    subpages: [
      { id: 'edit', dev: true },
      { id: 'home' },
      { id: 'settings' },
    ],
  },
  {
    id: 'character',
    opens: 'stats',
    subpages: [
      { id: 'stats' },
      { id: 'skills' },
      { id: 'equipment' },
      { id: 'inventory' },
      { id: 'journal' },
    ],
  },
];

export const HOME_LAYER = LAYERS.findIndex((layer) => layer.id === 'home');

export const BOUNDARIES = LAYERS.length - 1;

export interface Where {
  layer: number;
  subpage: readonly LabelId[];
}

export const OPENING: Where = { layer: HOME_LAYER, subpage: LAYERS.map((layer) => layer.opens) };

export const shownIn = (layer: Layer, dev: boolean): readonly Subpage[] => layer.subpages.filter((subpage) => dev || subpage.dev !== true);

export const subpageOf = (where: Where): LabelId => where.subpage[where.layer];

export function toLayer(where: Where, layer: number): Where {
  return { ...where, layer: clampIndex(layer, LAYERS.length) };
}

export function toSubpage(where: Where, layer: number, id: LabelId): Where {
  const held = clampIndex(layer, LAYERS.length);
  const subpage = [...where.subpage];
  subpage[held] = LAYERS[held].subpages.some((each) => each.id === id) ? id : LAYERS[held].opens;
  return { ...where, subpage };
}

export function pageOf(where: Where, layer: number, dev: boolean): number {
  const shown = shownIn(LAYERS[layer], dev);
  const at = shown.findIndex((subpage) => subpage.id === where.subpage[layer]);
  return clampIndex(at < 0 ? shown.findIndex((subpage) => subpage.id === LAYERS[layer].opens) : at, shown.length);
}

export const pageRested = (where: Where, layer: number, dev: boolean, columns: number): number =>
  clampIndex(pageOf(where, layer, dev), pagesIn(shownIn(LAYERS[layer], dev).length, columns));

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

export interface ShellState {
  layer: LayerId;
  subpage: LabelId;
  layers: readonly LayerId[];
  subpages: readonly LabelId[];
  commandLine: boolean;
}

export function shellState(where: Where, dev: boolean, commandLine = false): ShellState {
  const layer = LAYERS[where.layer];
  const shown = shownIn(layer, dev);
  return {
    layer: layer.id,
    subpage: shown[pageOf(where, where.layer, dev)].id,
    layers: LAYERS.map((each) => each.id),
    subpages: shown.map((subpage) => subpage.id),
    commandLine,
  };
}
