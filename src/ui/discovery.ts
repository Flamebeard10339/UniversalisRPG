import type { PlayView } from '../runtime/session';
import { bounds, type Box, type Point } from './viewport';

export type Place = PlayView['discovered'][number];

export interface Node {
  place: Place;
  here: boolean;
  // How many planes up or down from the one being looked at; 0 for on it.
  climb: number;
  // Where it is drawn, which is where it is unless it is off the plane.
  at: Point;
}

export interface Road {
  from: Node;
  to: Node;
  open: boolean;
}

export interface Sheet {
  nodes: Node[];
  roads: Road[];
  planes: number[];
}

// A place on another floor sits at the same x and y as the stairs down to it —
// the tutorial's cellar and landing are both (0, 0) under the guide house — so
// drawing it where it is would put it exactly under the room the player is
// standing in. Nudged along the diagonal instead, up for a floor above and down
// for one below, which is the direction a player already reads as height.
//
// One nudge per floor and not one per direction: looking at the landing puts
// the guide house one floor down and the cellar two, and a nudge that read only
// which way drew the second under the first.
export const CLIMB_NUDGE = 0.42;

export function drawnAt(place: Place, plane: number): Point {
  const climb = place.z - plane;
  return { x: place.x + climb * CLIMB_NUDGE, y: place.y - climb * CLIMB_NUDGE };
}

// Where a place is, from where it was drawn. The nudge above is a drawing and
// not a position, so a gesture that moved the drawing has to come back through
// it before anything says where the place now is.
export const placedAt = (at: Point, climb: number): Point => ({ x: at.x - climb * CLIMB_NUDGE, y: at.y + climb * CLIMB_NUDGE });

// What is drawn on one z-plane: everything standing on it, plus anywhere off it
// the player could step to from where they are, plus anywhere the view is
// offering a way out to. A staircase is a place on another floor, and a floor
// plan that hid it would hide the way out of the room the player is in; a
// destination the player can set off for now is one the map has to be able to
// show, or the offer sits nowhere a finger can reach it.
export function sheetAt(discovered: readonly Place[], here: string, plane: number, offered: ReadonlyMap<string, number> = new Map()): Sheet {
  const standing = discovered.find((place) => place.id === here);
  const reachable = new Set(standing?.adjacent.map((edge) => edge.to) ?? []);
  const shown = discovered.filter((place) => place.z === plane || place.id === here || reachable.has(place.id) || offered.has(place.id));
  const nodes = shown.map((place) => ({ place, here: place.id === here, climb: place.z - plane, at: drawnAt(place, plane) }));
  const byId = new Map(nodes.map((node) => [node.place.id, node]));

  const roads: Road[] = [];
  for (const node of nodes) {
    for (const edge of node.place.adjacent) {
      const other = byId.get(edge.to);
      if (!other) continue;
      // One road, not two: a pair of places that each name the other would draw
      // the same line twice. A one-way road is still one line.
      const mutual = other.place.adjacent.some((back) => back.to === node.place.id);
      if (mutual && node.place.id > edge.to) continue;
      roads.push({ from: node, to: other, open: edge.open });
    }
  }

  return { nodes, roads, planes: [...new Set(discovered.map((place) => place.z))].sort((low, high) => low - high) };
}

// Which of the offers on the table is the way to each place, by the position a
// driver dispatches it at. Read off leadsTo and not off the choice's kind: a
// staircase aliases a road and publishes an action, so a map that matched on
// `travel:` would leave every floor of a building untappable. Two ways to one
// place keep the first, which is the order the engine offered them in.
export function waysOut(choices: readonly PlayView['choices'][number][]): Map<string, number> {
  const ways = new Map<string, number>();
  choices.forEach((choice, index) => {
    if (choice.leadsTo === undefined || ways.has(choice.leadsTo)) return;
    ways.set(choice.leadsTo, index + 1);
  });
  return ways;
}

export interface Drawn {
  // The plane being looked at: the one asked for, or the one the player is
  // standing on until they ask for another.
  plane: number;
  here: string;
  sheet: Sheet;
  travels: ReadonlyMap<string, number>;
}

// The whole of what the map draws for one view. Composed here rather than in
// the component, because the two halves have to agree — a place is drawn on the
// strength of the offer that leads to it — and a composition inside a render is
// one no test in this suite can reach.
export function drawnFor(view: PlayView, asked: number | null): Drawn {
  const discovered = view.discovered;
  const here = view.location.id;
  const plane = asked ?? discovered.find((place) => place.id === here)?.z ?? 0;
  const travels = waysOut(view.choices);

  return { plane, here, sheet: sheetAt(discovered, here, plane, travels), travels };
}

// One authored unit of the world, in CSS pixels, before any zoom. The tutorial
// island's places sit a unit apart, so this is what turns "east of the guide
// house" into a gap a thumb can aim between. It is the whole of the conversion
// between where the engine says a place is and where the sheet draws it.
export const PER_UNIT = 104;

export const spotOf = (node: Node): Point => ({ x: node.at.x * PER_UNIT, y: node.at.y * PER_UNIT });

// The room the map takes up, in the sheet pixels a viewport is held against.
export const mapBox = (nodes: readonly Node[]): Box => bounds(nodes.map(spotOf));

// The line a walk takes, from where the player is standing to where they are
// going. The engine publishes the legs still to cross and not the place they
// are leaving, so the player's own place is put at the head of it — which is
// what makes a road on the route a pair of neighbours in one list, and what
// keeps the map from working the route out for itself.
export function walkLine(here: string, journey: PlayView['journey']): string[] {
  if (!journey || journey.legs.length === 0) return [];
  return [here, ...journey.legs];
}

// Whether the road between two places is one the walk will take. Either way
// round, because a road is drawn once for the pair and neither end is its own.
export function onWalk(line: readonly string[], from: string, to: string): boolean {
  const at = line.indexOf(from);
  return at >= 0 && (line[at + 1] === to || line[at - 1] === to);
}

// Which places arrived between one view and the next. The map's own reading of
// the same event the engine already published, so nothing has to be remembered
// beyond the last list.
export function newlyFound(before: readonly Place[], after: readonly Place[]): string[] {
  const known = new Set(before.map((place) => place.id));
  return after.map((place) => place.id).filter((id) => !known.has(id));
}
