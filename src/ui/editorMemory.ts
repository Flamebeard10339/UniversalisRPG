import { SURFACES, type SurfaceId } from './authoringSurface';
import { SPLIT_DEFAULT, splitHeld } from './gesture';
import { LAYERS, OPENING, toLayer, toSubpage, type Where } from './nav';
import type { LabelId } from './labels';
import type { Point } from './viewport';

export { EDITOR_SLOT } from '../runtime/saveSlots';

export interface MapWhere {
  pan: Point;
  zoom: number;
  plane: number | null;
}

export interface Editing {
  surface: SurfaceId;
  kind: string | null;
  query: string;
  open: string | null;
  cursor: number;
  scroll: number;
  draft: string | null;
  split: number;
  commandLine: boolean;
  map: MapWhere;
  where: Where | null;
}

export const FORGOTTEN: Editing = {
  surface: 'local',
  kind: null,
  query: '',
  open: null,
  cursor: 0,
  scroll: 0,
  draft: null,
  split: SPLIT_DEFAULT,
  commandLine: false,
  map: { pan: { x: 0, y: 0 }, zoom: 1, plane: null },
  where: null,
};

const held = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

const text = (value: unknown, fallback: string | null): string | null => (typeof value === 'string' ? value : fallback);

const count = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

const maybeCount = (value: unknown, fallback: number | null): number | null => (value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function mapWhere(value: unknown): MapWhere {
  const from = held(value);
  const pan = held(from.pan);
  return {
    pan: { x: count(pan.x, FORGOTTEN.map.pan.x), y: count(pan.y, FORGOTTEN.map.pan.y) },
    zoom: count(from.zoom, FORGOTTEN.map.zoom),
    plane: maybeCount(from.plane, FORGOTTEN.map.plane),
  };
}

function whereHeld(value: unknown, opening: Where): Where | null {
  const from = held(value);
  if (typeof from.layer !== 'number' || !Number.isFinite(from.layer) || !Array.isArray(from.subpage)) return null;
  let standing = toLayer(opening, from.layer);
  for (const [at, id] of from.subpage.entries()) {
    if (typeof id === 'string' && at < LAYERS.length) standing = toSubpage(standing, at, id as LabelId);
  }
  return standing;
}

export function remembered(stored: string | null, opening: Where = OPENING): Editing {
  if (stored === null) return FORGOTTEN;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return FORGOTTEN;
  }
  const from = held(parsed);
  const surface = SURFACES.find((each) => each === from.surface);
  return {
    surface: surface ?? FORGOTTEN.surface,
    kind: text(from.kind, FORGOTTEN.kind),
    query: text(from.query, '') ?? FORGOTTEN.query,
    open: text(from.open, FORGOTTEN.open),
    cursor: count(from.cursor, FORGOTTEN.cursor),
    scroll: count(from.scroll, FORGOTTEN.scroll),
    draft: text(from.draft, FORGOTTEN.draft),
    split: splitHeld(count(from.split, FORGOTTEN.split)),
    commandLine: from.commandLine === true,
    map: mapWhere(from.map),
    where: whereHeld(from.where, opening),
  };
}

export const recorded = (where: Editing): string => JSON.stringify(where);
