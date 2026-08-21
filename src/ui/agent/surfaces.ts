import type { Answer } from '../../runtime/localized';
import { SURFACES, type Standing, type SurfaceId } from '../authoringSurface';
import type { Sheet } from '../discovery';
import { draftIn, kindsIn, rowsIn, sectionKey, type EditHeld } from '../editControls';
import { clampZoom, type Point } from '../viewport';
import { clampIndex } from '../gesture';
import type { LabelId } from '../labels';
import { LAYERS, subpageOf, toLayer, toSubpage, type LayerId, type Where } from '../nav';
import type { PlaneGraph, Plane } from '../planeGraph';
import { filled, type SkillPanel } from '../skillPanels';
import type { TestSurface } from '../testSurface';

export function layerNamed(value: unknown): number {
  const at = LAYERS.findIndex((layer) => layer.id === value);
  if (at < 0) throw new Error(`no layer is named ${String(value)}`);
  return at;
}

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

export function pointFrom(value: unknown): Point {
  const { x, y } = (value ?? {}) as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) throw new Error('a pan is an { x, y } of finite numbers');
  return { x, y };
}

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
  goes: number | null;
}

export interface MapState {
  plane: number;
  planes: readonly number[];
  zoom: number;
  pan: Point;
  moving: boolean;
  places: MapPlace[];
}

export interface MapView {
  plane: number;
  zoom: number;
  pan: Point;
  moving: boolean;
  sheet: Sheet;
  travels: ReadonlyMap<string, number>;
}

export interface MapControls {
  settle(pan: Point, zoom: number): void;
  go(id: string): void;
  plane(at: number): void;
  recentre(): void;
  moving(on: boolean): void;
  place(id: string, at: Point): void;
}

export function mapState(map: MapView): MapState {
  return {
    plane: map.plane,
    planes: map.sheet.planes,
    zoom: map.zoom,
    pan: map.pan,
    moving: map.moving,
    places: map.sheet.nodes.map((node) => ({ id: node.place.id, at: node.at, here: node.here, climb: node.climb, goes: map.travels.get(node.place.id) ?? null })),
  };
}

export function mapSurface(map: MapView, controls: MapControls): TestSurface {
  return {
    state: () => mapState(map),
    actions: {
      pan: (value) => controls.settle(pointFrom(value), map.zoom),
      zoom: (value) => controls.settle(map.pan, zoomFrom(value)),
      plane: (value) => controls.plane(planeFrom(value, map.sheet.planes)),
      recentre: () => controls.recentre(),
      moving: (value) => controls.moving(value === true),
      go: (value) => {
        const named = map.sheet.nodes.find((node) => node.place.id === value);
        if (!named) throw new Error(`the map draws no place called ${String(value)}`);
        controls.go(named.place.id);
      },
      place: (value) => {
        const { place, ...at } = (value ?? {}) as { place?: unknown };
        const named = map.sheet.nodes.find((node) => node.place.id === place);
        if (!named) throw new Error(`the map draws no place called ${String(place)}`);
        controls.place(named.place.id, pointFrom(at));
      },
    },
  };
}

export interface EditState {
  surface: SurfaceId;
  surfaces: readonly SurfaceId[];
  kind: string | null;
  kinds: readonly string[];
  rows: readonly string[];
  open: string | null;
  draft: string;
  cursor: number;
  scroll: number;
  standing: Standing;
  places: readonly string[];
}

export function editState(held: EditHeld): EditState {
  return {
    surface: held.editing.surface,
    surfaces: SURFACES,
    kind: held.editing.kind,
    kinds: kindsIn(held),
    rows: rowsIn(held).map(sectionKey),
    open: held.editing.open,
    draft: draftIn(held.sections, held.editing),
    cursor: held.editing.cursor,
    scroll: held.editing.scroll,
    standing: held.standing,
    places: held.places.map((place) => place.id),
  };
}

export function surfaceNamed(value: unknown): SurfaceId {
  const found = SURFACES.find((each) => each === value);
  if (!found) throw new Error(`no editing surface is named ${String(value)}`);
  return found;
}

export function rowNamed(held: EditHeld, value: unknown): string {
  const found = rowsIn(held).map(sectionKey).find((key) => key === value);
  if (!found) throw new Error(`the editing page is not offering ${String(value)}`);
  return found;
}

export function placeNamed(held: EditHeld, value: unknown): string {
  const found = held.places.find((place) => place.id === value);
  if (!found) throw new Error(`no location is called ${String(value)}`);
  return found.id;
}

export function editSurface(held: EditHeld): TestSurface {
  return {
    state: () => editState(held),
    actions: {
      surface: (value) => held.controls.surface(surfaceNamed(value)),
      kind: (value) => held.controls.kind(value === null ? null : String(value)),
      open: (value) => held.controls.open(value === null ? null : rowNamed(held, value)),
      add: () => held.controls.add(),
      text: (value) => held.controls.text(String(value)),
      cursor: (value) => held.controls.cursor(Number(value)),
      scroll: (value) => held.controls.scroll(Number(value)),
      stage: () => held.controls.stage(),
      unstage: () => held.controls.unstage(),
      copy: () => held.controls.copy(),
      stand: (value) => held.controls.stand(placeNamed(held, value)),
    },
  };
}

export function planeState(held: AgentSurfaces['plane']): PlaneState {
  return {
    instance: held.plane.instance,
    chosen: held.chosen,
    picking: held.picking,
    nodes: held.graph.nodes.map((node) => ({ key: node.key, at: node.at, standing: node.standing, socket: node.socket, holds: node.holds !== null })),
    edges: held.graph.edges.map((edge) => edge.key),
  };
}

export interface PlaneState {
  instance: Answer;
  chosen: Answer | null;
  picking: boolean;
  nodes: Array<{ key: Answer; at: Point; standing: string; socket: boolean; holds: boolean }>;
  edges: string[];
}

export function nodeNamed(graph: PlaneGraph, value: unknown): Answer {
  const node = graph.nodes.find((each) => each.key === value);
  if (!node) throw new Error(`the plane draws no node called ${String(value)}`);
  return node.key;
}

export function planeSurface(held: AgentSurfaces['plane']): TestSurface {
  return {
    state: () => planeState(held),
    actions: {
      press: (value) => held.controls.press(nodeNamed(held.graph, value)),
      pick: (value) => held.controls.pick(value === true),
      pan: (value) => held.controls.settle(pointFrom(value), 1),
    },
  };
}

export function skillsSurface(held: AgentSurfaces['skills']): TestSurface {
  return {
    state: () => ({
      opened: held.opened,
      greeted: held.greeted,
      panels: held.panels.map((panel) => ({ id: panel.id, level: panel.level, total: panel.total, into: panel.into, span: panel.span, toNext: panel.toNext, filled: filled(panel) })),
    }),
    actions: {
      open: (value) => held.controls.open(value === null ? null : skillNamed(held.panels, value)),
    },
  };
}

export function skillNamed(panels: readonly SkillPanel[], value: unknown): Answer {
  const panel = panels.find((each) => each.id === value);
  if (!panel) throw new Error(`the character has no skill called ${String(value)}`);
  return panel.id;
}

export interface AgentSurfaces {
  shell: { where: Where; go: (where: Where) => void };
  map: { map: MapView; controls: MapControls };
  skills: { panels: readonly SkillPanel[]; opened: Answer | null; greeted: readonly Answer[]; controls: { open(id: Answer | null): void } };
  plane: { plane: Plane; graph: PlaneGraph; chosen: Answer | null; picking: boolean; controls: { press(key: Answer): void; pick(open: boolean): void; settle(pan: Point, zoom: number): void } };
  edit: EditHeld;
}

export const SURFACE_BUILDERS: { [K in keyof AgentSurfaces]: (held: AgentSurfaces[K]) => TestSurface } = {
  shell: ({ where, go }) => shellSurface(where, go),
  map: ({ map, controls }) => mapSurface(map, controls),
  plane: (held) => planeSurface(held),
  skills: (held) => skillsSurface(held),
  edit: (held) => editSurface(held),
};
