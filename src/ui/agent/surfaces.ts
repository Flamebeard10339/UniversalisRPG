import type { Answer } from '../../runtime/localized';
import { SURFACES, type Standing, type SurfaceId } from '../authoringSurface';
import type { Sheet } from '../discovery';
import { draftIn, kindsIn, offeringIn, rowsIn, sectionKey, type EditHeld } from '../editControls';
import { modeNamed, type MapMode } from '../mapEdit';
import { clampZoom, type Point } from '../viewport';
import { clampIndex } from '../gesture';
import type { LabelId } from '../labels';
import { LAYERS, shellState, shownIn, toLayer, toSubpage, type ShellState, type Where } from '../nav';
import type { PlaneGraph, Plane } from '../planeGraph';
import type { JournalRow } from '../journalPanel';
import type { JournalEntry } from '../../runtime/session';
import { filled, type SkillPanel } from '../skillPanels';
import type { TestSurface } from '../testSurface';
import { describeRun, NOTE_FIELDS, type RunLogEntry, type RunNotes } from '../../runtime/runLog';
import { emptyNotes, feedbackOn } from '../playtest';
import type { PlaytestControls } from '../driver';

export function layerNamed(value: unknown): number {
  const at = LAYERS.findIndex((layer) => layer.id === value);
  if (at < 0) throw new Error(`no layer is named ${String(value)}`);
  return at;
}

export function subpageNamed(layer: number, dev: boolean, value: unknown): LabelId {
  const held = clampIndex(layer, LAYERS.length);
  const found = shownIn(LAYERS[held], dev).find((subpage) => subpage.id === value);
  if (!found) throw new Error(`${LAYERS[held].id} has no subpage named ${String(value)}`);
  return found.id;
}

export type { ShellState };

export function shellSurface(held: AgentSurfaces['shell']): TestSurface {
  const { where, dev, commandLine, go, showCommandLine } = held;
  return {
    state: () => shellState(where, dev, commandLine),
    actions: {
      layer: (value) => go(toLayer(where, layerNamed(value))),
      subpage: (value) => go(toSubpage(where, where.layer, subpageNamed(where.layer, dev, value))),
      'command-line': (value) => showCommandLine(value === true),
    },
  };
}

// An author's run, and the same three acts the bar offers, so an agent can play the browser and
// read back what was played in the words a playbot run is written in.
function notesFrom(value: unknown): RunNotes {
  const given = (value ?? {}) as Record<string, unknown>;
  const notes = emptyNotes() as Record<string, string>;
  for (const field of NOTE_FIELDS) {
    const said = given[field.name];
    if (said === undefined) continue;
    if (typeof said !== 'string') throw new Error(`${field.name} is said in words`);
    notes[field.name] = said;
  }
  return notes as RunNotes;
}

export function playtestSurface(held: AgentSurfaces['playtest']): TestSurface {
  const { log, controls } = held;
  return {
    state: () => ({ recording: log !== null, turns: log?.length ?? 0, about: log === null ? null : feedbackOn(log), written: describeRun(log ?? []) }),
    actions: {
      recording: (value) => (value === true ? controls.start() : controls.stop()),
      attach: (value) => {
        if (log === null) throw new Error('no run is being recorded');
        const about = feedbackOn(log);
        if (about === null) throw new Error('nothing has been played to attach a note to');
        controls.attach(about.turn, notesFrom(value));
      },
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
  mode: MapMode;
  from: string | null;
  places: MapPlace[];
}

export interface MapView {
  plane: number;
  zoom: number;
  pan: Point;
  mode: MapMode;
  from: string | null;
  sheet: Sheet;
  travels: ReadonlyMap<string, number>;
}

export interface MapControls {
  settle(pan: Point, zoom: number): void;
  go(id: string): void;
  plane(at: number): void;
  recentre(): void;
  mode(which: MapMode): void;
  place(id: string, at: Point): void;
  link(id: string): void;
  make(id: string): void;
}

export function mapState(map: MapView): MapState {
  return {
    plane: map.plane,
    planes: map.sheet.planes,
    zoom: map.zoom,
    pan: map.pan,
    mode: map.mode,
    from: map.from,
    places: map.sheet.nodes.map((node) => ({ id: node.place.id, at: node.at, here: node.here, climb: node.climb, goes: map.travels.get(node.place.id) ?? null })),
  };
}

export function placeDrawn(map: MapView, value: unknown): string {
  const named = map.sheet.nodes.find((node) => node.place.id === value);
  if (!named) throw new Error(`the map draws no place called ${String(value)}`);
  return named.place.id;
}

export function mapSurface(map: MapView, controls: MapControls): TestSurface {
  return {
    state: () => mapState(map),
    actions: {
      pan: (value) => controls.settle(pointFrom(value), map.zoom),
      zoom: (value) => controls.settle(map.pan, zoomFrom(value)),
      plane: (value) => controls.plane(planeFrom(value, map.sheet.planes)),
      recentre: () => controls.recentre(),
      mode: (value) => {
        const named = modeNamed(value);
        if (!named) throw new Error(`the map has no mode called ${String(value)}`);
        controls.mode(named);
      },
      link: (value) => controls.link(placeDrawn(map, value)),
      make: (value) => controls.make(String(value)),
      go: (value) => controls.go(placeDrawn(map, value)),
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
  query: string;
  rows: readonly string[];
  open: string | null;
  draft: string;
  cursor: number;
  offers: readonly string[];
  scroll: number;
  split: number;
  standing: Standing;
  places: readonly string[];
}

export function editState(held: EditHeld): EditState {
  return {
    surface: held.editing.surface,
    surfaces: SURFACES,
    kind: held.editing.kind,
    kinds: kindsIn(held),
    query: held.editing.query,
    rows: rowsIn(held).map(sectionKey),
    open: held.editing.open,
    draft: draftIn(held.sections, held.editing),
    cursor: held.editing.cursor,
    offers: offeringIn(held).offers.map((offer) => offer.form),
    scroll: held.editing.scroll,
    split: held.editing.split,
    standing: held.standing,
    places: held.places.map((place) => place.id),
  };
}

export function offerNamed(held: EditHeld, value: unknown): string {
  const found = offeringIn(held).offers.find((offer) => offer.form === value);
  if (found === undefined) throw new Error(`the grammar offers nothing shaped ${String(value)}`);
  return found.form;
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
      search: (value) => held.controls.search(String(value)),
      open: (value) => held.controls.open(value === null ? null : rowNamed(held, value)),
      add: () => held.controls.add(),
      text: (value) => held.controls.text(String(value), String(value).length),
      cursor: (value) => held.controls.cursor(Number(value)),
      take: (value) => held.controls.take(offerNamed(held, value)),
      'step-in': () => held.controls.stepIn(),
      'step-out': () => held.controls.stepOut(),
      scroll: (value) => held.controls.scroll(Number(value)),
      split: (value) => held.controls.split(Number(value)),
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

// The list of quests, and the one way in: opening one, which is a screen the engine opens.
export function journalSurface(held: AgentSurfaces['journal']): TestSurface {
  return {
    state: () => ({ rows: held.rows.map((row) => ({ id: row.id, title: row.title, standing: row.standing, lines: row.lines.map((line) => ({ said: line.said, struck: line.struck })) })) }),
    actions: {
      open: (value) => held.controls.open(questNamed(held.rows, value)),
    },
  };
}

// What the journal screen is showing, which is read and not driven: closing it is the modal's own question, answered the way every modal is.
export function questSurface(held: AgentSurfaces['quest']): TestSurface {
  return {
    state: () => ({ quest: held.entry.quest, standing: held.entry.standing, lines: held.entry.lines.map((line) => ({ said: line.said, struck: line.struck })) }),
    actions: {},
  };
}

export function questNamed(rows: readonly JournalRow[], value: unknown): Answer {
  const row = rows.find((each) => each.id === value);
  if (!row) throw new Error(`the journal holds no quest called ${String(value)}`);
  return row.id;
}

export interface AgentSurfaces {
  shell: { where: Where; dev: boolean; commandLine: boolean; go: (where: Where) => void; showCommandLine: (shown: boolean) => void };
  map: { map: MapView; controls: MapControls };
  skills: { panels: readonly SkillPanel[]; opened: Answer | null; greeted: readonly Answer[]; controls: { open(id: Answer | null): void } };
  plane: { plane: Plane; graph: PlaneGraph; chosen: Answer | null; picking: boolean; controls: { press(key: Answer): void; pick(open: boolean): void; settle(pan: Point, zoom: number): void } };
  journal: { rows: readonly JournalRow[]; controls: { open(id: Answer): void } };
  quest: { entry: JournalEntry };
  playtest: { log: readonly RunLogEntry[] | null; controls: PlaytestControls };
  edit: EditHeld;
}

export const SURFACE_BUILDERS: { [K in keyof AgentSurfaces]: (held: AgentSurfaces[K]) => TestSurface } = {
  shell: (held) => shellSurface(held),
  map: ({ map, controls }) => mapSurface(map, controls),
  plane: (held) => planeSurface(held),
  skills: (held) => skillsSurface(held),
  journal: (held) => journalSurface(held),
  quest: (held) => questSurface(held),
  playtest: (held) => playtestSurface(held),
  edit: (held) => editSurface(held),
};
