import type { Answer } from '../../runtime/localized';
import { SURFACES, type Standing, type SurfaceId } from '../authoringSurface';
import type { Bearing, Sheet } from '../../runtime/map';
import { colourIn, draftIn, kindsIn, offeringIn, rowsIn, sectionKey, type EditHeld } from '../editControls';
import { modeNamed, type MapMode } from '../mapEdit';
import { clampZoom, type Point } from '../viewport';
import { clampIndex } from '../gesture';
import type { LabelId } from '../labels';
import { LAYERS, shellState, shownIn, toLayer, toSubpage, type ShellState, type Where } from '../nav';
import type { PlaneGraph, Plane } from '../planeGraph';
import type { JournalRow } from '../journalPanel';
import type { Arriving } from '../reveal';
import type { JournalEntry, StatRow } from '../../runtime/session';
import type { StatTab } from '../statTabs';
import { filled, type SkillPanel } from '../skillPanels';
import type { TestSurface } from '../testSurface';
import { NOTE_FIELDS, type RecordedRun, type RunNotes } from '../../runtime/runLog';
import { emptyNotes, feedbackOn } from '../playtest';
import type { PlaytestControls, ReplayControls, ReplaySnapshot } from '../driver';
import { replayLines } from '../replay';
import { modulesOff, packTurnsTo, refused, type PortalPack } from '../modPortal';

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

// The mod portal, said the way the page says it: the packs, what each is standing at, and the two
// things a click can be. Turning a pack is turning its modules, so the surface offers no third verb.
export function modsSurface(held: AgentSurfaces['mods']): TestSurface {
  const { packs, controls } = held;
  const named = (pack: string): PortalPack | undefined => packs.find((each) => each.pack === pack);
  return {
    state: () => ({
      packs: packs.map((pack) => ({
        pack: pack.pack,
        standing: pack.standing,
        modules: pack.modules.map((module) => ({ name: module.name, id: module.id, on: module.on, loaded: module.loaded })),
      })),
      off: modulesOff(packs),
      refused: refused(packs).map((module) => module.id),
    }),
    actions: {
      pack: (value) => {
        const pack = named(String(value));
        if (pack === undefined) throw new Error(`no pack called ${String(value)}`);
        controls.turn(
          pack.modules.map((module) => module.name),
          packTurnsTo(pack),
        );
      },
      module: (value) => {
        const { module, on } = (value ?? {}) as { module?: unknown; on?: unknown };
        if (typeof module !== 'string' || typeof on !== 'boolean') throw new Error('a module is a { module, on } of a name and whether it is wanted');
        controls.turn([module], on);
      },
    },
  };
}

export function playtestSurface(held: AgentSurfaces['playtest']): TestSurface {
  const { run, controls } = held;
  const log = run?.log ?? null;
  return {
    state: () => ({
      recording: run !== null,
      id: run?.id ?? null,
      turns: log?.length ?? 0,
      about: log === null ? null : feedbackOn(log),
      written: controls.written(),
      filed: controls.filed().map((each) => ({ id: each.id, sections: each.sections.map((at) => `# ${at.kind} ${at.id}`) })),
    }),
    actions: {
      recording: (value) => {
        if (value === true) controls.start();
        else controls.stop();
      },
      drop: (value) => controls.drop(String(value)),
      rename: (value) => {
        const { run, to } = (value ?? {}) as { run?: unknown; to?: unknown };
        if (typeof run !== 'string' || typeof to !== 'string') throw new Error('a rename is a { run, to } of two names');
        controls.rename(run, to);
      },
      attach: (value) => {
        if (log === null) throw new Error('no run is being recorded');
        const about = feedbackOn(log);
        if (about === null) throw new Error('nothing has been played to attach a note to');
        controls.attach(about.turn, notesFrom(value));
      },
    },
  };
}

// A run being watched, and the four ways of moving through it. What an agent reads back is what the
// bar draws: the same lines, the same cursor, the same word on whether the record still holds.
export function replaySurface(held: AgentSurfaces['replay']): TestSurface {
  const { replay, controls } = held;
  return {
    state: () => (replay === null ? { watching: null } : { watching: replay.test, at: replay.at, playing: replay.playing, delay: replay.delay, failure: replay.failure, lines: replayLines(replay.steps) }),
    actions: {
      watching: (value) => controls.watching(value === null || value === false ? null : String(value)),
      at: (value) => {
        if (typeof value !== 'number') throw new Error('a step is a number');
        controls.at(value);
      },
      playing: (value) => controls.playing(value === true),
      every: (value) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('a delay is a number of seconds above nothing');
        controls.every(value);
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
  // Which way this place lies from where the player stands, which is how a driver with no eyes asks
  // for the road going north without working the geometry out for itself.
  bearing: Bearing | null;
}

export interface MapState {
  plane: number;
  // The floor being looked at over the shoulder of the one drawn, which is a floor the author is
  // pointing at rather than one they have gone to.
  ghost: number | null;
  planes: readonly number[];
  zoom: number;
  pan: Point;
  mode: MapMode;
  from: string | null;
  // The region a gathering gesture is aimed at, as the author has it typed.
  gathering: string;
  places: MapPlace[];
}

export interface MapView {
  plane: number;
  ghost: number | null;
  zoom: number;
  pan: Point;
  mode: MapMode;
  from: string | null;
  gathering: string;
  sheet: Sheet;
}

export interface MapControls {
  settle(pan: Point, zoom: number): void;
  go(id: string): void;
  plane(at: number): void;
  ghost(at: number | null): void;
  recentre(): void;
  mode(which: MapMode): void;
  place(id: string, at: Point): void;
  link(id: string): void;
  pin(id: string): void;
  make(id: string): void;
  gather(region: string, place: string): void;
  shift(region: string, by: Point): void;
}

export function mapState(map: MapView): MapState {
  return {
    plane: map.plane,
    ghost: map.ghost,
    planes: map.sheet.planes,
    zoom: map.zoom,
    pan: map.pan,
    mode: map.mode,
    from: map.from,
    gathering: map.gathering,
    places: map.sheet.nodes.map((node) => ({ id: node.place.id, at: node.at, here: node.here, climb: node.climb, goes: node.goes, bearing: node.bearing })),
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
      ghost: (value) => controls.ghost(value === null || value === undefined ? null : planeFrom(value, map.sheet.planes)),
      recentre: () => controls.recentre(),
      mode: (value) => {
        const named = modeNamed(value);
        if (!named) throw new Error(`the map has no mode called ${String(value)}`);
        controls.mode(named);
      },
      link: (value) => controls.link(placeDrawn(map, value)),
      pin: (value) => controls.pin(placeDrawn(map, value)),
      gather: (value) => {
        const { region, place } = (value ?? {}) as { region?: unknown; place?: unknown };
        controls.gather(String(region ?? map.gathering), placeDrawn(map, place));
      },
      shift: (value) => {
        const { region, ...by } = (value ?? {}) as { region?: unknown };
        controls.shift(String(region ?? map.gathering), pointFrom(by));
      },
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
  colour: string | null;
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
    colour: colourIn(held),
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
      fill: (value) => held.controls.fill(String(value)),
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

// The character sheet's tabs, which are the groups the world's own stats belong to, and the one way
// in: pressing one, which changes nothing the engine hears about.
export function statsSurface(held: AgentSurfaces['stats']): TestSurface {
  return {
    state: () => ({ chosen: held.chosen, tabs: held.tabs.map((tab) => ({ id: tab.group?.id ?? null, title: tab.group?.title ?? null, stats: tab.rows.map((row) => row.id) })) }),
    actions: {
      tab: (value) => held.controls.tab(tabNamed(held.tabs, value)),
    },
  };
}

export function tabNamed(tabs: readonly StatTab[], value: unknown): Answer | null {
  const tab = tabs.find((each) => (each.group?.id ?? null) === (value ?? null));
  if (!tab) throw new Error(`the character sheet has no tab called ${String(value)}`);
  return tab.group?.id ?? null;
}

// The words a screen is saying, as much of them as have arrived, and the one press that carries the
// beat on. An agent reads what is on the screen rather than what the engine has said, because those
// are not the same thing while a line is still arriving.
export function beatSurface(held: AgentSurfaces['beat']): TestSurface {
  return {
    state: () => ({ shown: [...held.arriving.shown], typing: held.arriving.typing, awaits: held.arriving.awaits }),
    actions: { press: () => held.controls.press() },
  };
}

// What the breakdown screen is showing, which is read and not driven: closing it is the modal's own question, answered the way every modal is.
export function statSurface(held: AgentSurfaces['stat']): TestSurface {
  return {
    state: () => ({ stat: held.row.id, value: held.row.value, from: held.row.from.map((share) => share.title) }),
    actions: {},
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
  beat: { arriving: Arriving; controls: { press(): void } };
  quest: { entry: JournalEntry };
  stats: { tabs: readonly StatTab[]; chosen: Answer | null; controls: { tab(id: Answer | null): void } };
  stat: { row: StatRow };
  playtest: { run: RecordedRun | null; controls: PlaytestControls };
  replay: { replay: ReplaySnapshot | null; controls: ReplayControls };
  edit: EditHeld;
  mods: { packs: readonly PortalPack[]; controls: { turn(names: readonly string[], on: boolean): void } };
}

export const SURFACE_BUILDERS: { [K in keyof AgentSurfaces]: (held: AgentSurfaces[K]) => TestSurface } = {
  shell: (held) => shellSurface(held),
  map: ({ map, controls }) => mapSurface(map, controls),
  plane: (held) => planeSurface(held),
  skills: (held) => skillsSurface(held),
  journal: (held) => journalSurface(held),
  beat: (held) => beatSurface(held),
  quest: (held) => questSurface(held),
  stats: (held) => statsSurface(held),
  stat: (held) => statSurface(held),
  playtest: (held) => playtestSurface(held),
  replay: (held) => replaySurface(held),
  edit: (held) => editSurface(held),
  mods: (held) => modsSurface(held),
};
