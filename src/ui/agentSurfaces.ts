import { clampZoom, type Point, type Sheet } from './discovery';
import { clampIndex } from './gesture';
import type { LabelId } from './labels';
import { LAYERS, subpageOf, toLayer, toSubpage, type LayerId, type Where } from './nav';
import type { TestSurface } from './testSurface';

// Everything here exists to be driven and nothing here is drawn, so the whole
// module is reached by one dynamic import inside a branch the DEV constant
// folds away. A component hands over the plain values it already holds and
// names none of this; that is what keeps a release from carrying it.

// A driving agent names a layer and a subpage the way the model does, so an
// index it would have had to count to is never the thing it says. A name no
// layer answers to is refused rather than clamped: an agent that asked for
// somewhere that does not exist has to be told, where a player's drag past the
// last layer is a gesture to hold at the edge.
export function layerNamed(value: unknown): number {
  const at = LAYERS.findIndex((layer) => layer.id === value);
  if (at < 0) throw new Error(`no layer is named ${String(value)}`);
  return at;
}

// Within one layer, because a tab bar only ever offers the layer's own: an
// agent reaching another layer's page would be doing something no player can.
export function subpageNamed(layer: number, value: unknown): number {
  const held = clampIndex(layer, LAYERS.length);
  const at = LAYERS[held].subpages.findIndex((subpage) => subpage.id === value);
  if (at < 0) throw new Error(`${LAYERS[held].id} has no subpage named ${String(value)}`);
  return at;
}

export interface ShellState {
  layer: LayerId;
  subpage: LabelId;
  layers: readonly LayerId[];
  // The current layer's, which is what the tab bar is offering.
  subpages: readonly LabelId[];
}

export function shellState(where: Where): ShellState {
  const layer = LAYERS[where.layer];
  return {
    layer: layer.id,
    subpage: layer.subpages[subpageOf(where)].id,
    layers: LAYERS.map((each) => each.id),
    subpages: layer.subpages.map((subpage) => subpage.id),
  };
}

export function shellSurface(where: Where, go: (where: Where) => void): TestSurface {
  return {
    state: () => shellState(where),
    actions: {
      layer: (value) => go(toLayer(where, layerNamed(value))),
      subpage: (value) => go(toSubpage(where, where.layer, subpageNamed(where.layer, value))),
    },
  };
}

// What a driving agent may hand the map, checked before anything moves. A
// finger cannot pass a map a string or a plane it is not drawing; an agent can,
// and being told which is a better answer than a map that has quietly gone to
// NaN.
export function pointFrom(value: unknown): Point {
  const { x, y } = (value ?? {}) as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) throw new Error('a pan is an { x, y } of finite numbers');
  return { x, y };
}

// Clamped rather than refused, because the pinch it stands in for is clamped
// too: asking for more zoom than there is is a legal gesture that ends at the
// stop.
export function zoomFrom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('a zoom is a finite number');
  return clampZoom(value);
}

export function planeFrom(value: unknown, planes: readonly number[]): number {
  if (typeof value !== 'number' || !planes.includes(value)) throw new Error(`no plane is drawn at ${String(value)}`);
  return value;
}

export interface MapPlace {
  id: string;
  at: Point;
  here: boolean;
  climb: number;
  // The position a driver dispatches to set off for it, and null where there is
  // no way out to it — which is the whole of what the bubble's disabled state
  // says, read as a value instead of off the markup.
  goes: number | null;
}

export interface MapState {
  plane: number;
  planes: readonly number[];
  zoom: number;
  pan: Point;
  places: MapPlace[];
}

export interface MapView {
  plane: number;
  zoom: number;
  pan: Point;
  sheet: Sheet;
  travels: ReadonlyMap<string, number>;
}

export interface MapControls {
  settle(pan: Point, zoom: number): void;
  plane(at: number): void;
}

export function mapState(map: MapView): MapState {
  return {
    plane: map.plane,
    planes: map.sheet.planes,
    zoom: map.zoom,
    pan: map.pan,
    places: map.sheet.nodes.map((node) => ({ id: node.place.id, at: node.at, here: node.here, climb: node.climb, goes: map.travels.get(node.place.id) ?? null })),
  };
}

// The three things the map holds that the session does not, offered by their
// own names. Each goes through the same settling a gesture does, so a pan an
// agent asks for and a pan a finger asks for come to rest in the same place.
export function mapSurface(map: MapView, controls: MapControls): TestSurface {
  return {
    state: () => mapState(map),
    actions: {
      pan: (value) => controls.settle(pointFrom(value), map.zoom),
      zoom: (value) => controls.settle(map.pan, zoomFrom(value)),
      plane: (value) => controls.plane(planeFrom(value, map.sheet.planes)),
    },
  };
}

// What each component hands over: the values it already holds and the callbacks
// it already has, with no surface built at the call site.
export interface AgentSurfaces {
  shell: { where: Where; go: (where: Where) => void };
  map: { map: MapView; controls: MapControls };
}

export const SURFACE_BUILDERS: { [K in keyof AgentSurfaces]: (held: AgentSurfaces[K]) => TestSurface } = {
  shell: ({ where, go }) => shellSurface(where, go),
  map: ({ map, controls }) => mapSurface(map, controls),
};
