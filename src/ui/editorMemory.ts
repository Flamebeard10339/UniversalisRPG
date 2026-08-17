import { SURFACES, type SurfaceId } from './authoringSurface';
import type { Point } from './viewport';

// Where the author was, so that switching to Home and back does not change
// what is on screen. It is a slot like any other and is written by the same
// store the edits are in: one thing to be lost, and it is not lost.

export const EDITOR_SLOT = 'editor';

export interface MapWhere {
  pan: Point;
  zoom: number;
  // The floor being looked at, and null for the one the player is standing on.
  plane: number | null;
}

export interface Editing {
  surface: SurfaceId;
  // What the Global list is narrowed to, and null for every kind.
  kind: string | null;
  // The section open, keyed the way the list keys one.
  open: string | null;
  cursor: number;
  scroll: number;
  // What is in the field, which is not staged until it is sent: closing the tab
  // mid-sentence loses the sentence otherwise, and nothing here is a command.
  draft: string | null;
  map: MapWhere;
}

export const FORGOTTEN: Editing = {
  surface: 'local',
  kind: null,
  open: null,
  cursor: 0,
  scroll: 0,
  draft: null,
  map: { pan: { x: 0, y: 0 }, zoom: 1, plane: null },
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

// Field by field, and never all-or-nothing: a slot written by an older build
// says less than this one asks for, and forgetting where the map was looking
// because a field it never held is missing would be the whole memory lost for
// the newest thing in it. What it cannot make sense of, it forgets.
export function remembered(stored: string | null): Editing {
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
    open: text(from.open, FORGOTTEN.open),
    cursor: count(from.cursor, FORGOTTEN.cursor),
    scroll: count(from.scroll, FORGOTTEN.scroll),
    draft: text(from.draft, FORGOTTEN.draft),
    map: mapWhere(from.map),
  };
}

export const recorded = (where: Editing): string => JSON.stringify(where);
