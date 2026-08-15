import type { Answer } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import type { Point } from './viewport';

// An item's plane, laid out. The engine publishes the plane as a graph — nodes
// with keys and the pairs of them that touch — so nothing here decides what is
// joined to what. What it decides is where each node goes, which is the one
// thing about a plane that is the screen's and not the engine's.
//
// The hexagon is the plane's coordinate system and is never drawn: it survives
// here as the arithmetic that turns a published `q,r` into a point, and a
// player reads nodes and the lines between them.

export type Plane = PlayView['planes'][number];
type Cluster = Plane['clusters'][number];
type Position = Cluster['positions'][number];
type Slot = Cluster['slots'][number];

export type Standing = Position['standing'];

// How far apart two neighbouring hexagons stand, in unscaled sheet pixels.
// Everything else on the plane is a fraction of it, so the whole layout scales
// by changing this one figure.
export const HEX_SPAN = 210;

// Where a node sits inside its own hexagon, as a fraction of the span: a
// position that faces an edge, one that faces none but hangs off one that does,
// and the socket that sits on the edge itself, halfway to the next hexagon.
const OUTER = 0.3;
const INNER = 0.15;

export interface GraphNode {
  key: Answer;
  // The cluster this node belongs to, as the engine names it. Never drawn — it
  // is a hexagon, and a player reads none — but it is what a move onto this
  // cluster is published as acting on.
  hex: Answer;
  at: Point;
  standing: Standing;
  // A socket rather than a passive. The two are pressed the same way and drawn
  // differently, and only a socket can be filled.
  socket: boolean;
  // Allocated without a point having been spent: the origin cluster's root.
  free: boolean;
  // What a filled socket holds, as the cluster beyond it names itself; null for
  // a passive and for a socket with nothing through it.
  holds: Cluster['title'] | null;
  // The passive's own name, and what it pays. Null and empty for a socket, and
  // for a position the jewel left blank.
  title: Position['title'];
  payloads: Position['payloads'];
  // The number the plane calls this position, for a position the jewel left
  // unnamed — the only thing left to call it by. Zero for a socket.
  position: number;
}

export interface GraphEdge {
  key: string;
  from: Point;
  to: Point;
  // Both ends allocated, which is the path a point has already been spent along.
  live: boolean;
}

export interface PlaneGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  // Where everything stands, which is what a viewport is held against.
  points: Point[];
}

// A published `q,r` as a point. Pointy-top axial: a step east is one span along
// x, and a step to either northern neighbour is half a span across and a
// triangle's height up.
export function hexAt(key: Answer): Point {
  const [q, r] = key.split(',').map(Number);
  if (!Number.isFinite(q) || !Number.isFinite(r)) return { x: 0, y: 0 };
  return { x: HEX_SPAN * (q + r / 2), y: HEX_SPAN * (Math.sqrt(3) / 2) * r };
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const between = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// The way a position faces, as a unit vector, or null for one that faces no
// edge at all. Summed rather than picked, so a position on three edges of a
// spindle faces the way those three agree on and a position on all six — the
// whole of a point cluster — faces nowhere.
function facing(hex: Point, faces: readonly Answer[]): Point | null {
  let sum = { x: 0, y: 0 };
  for (const face of faces) {
    const toward = hexAt(face);
    sum = add(sum, { x: toward.x - hex.x, y: toward.y - hex.y });
  }
  const length = Math.hypot(sum.x, sum.y);
  return length < 1e-6 ? null : { x: sum.x / length, y: sum.y / length };
}

// Two clusters either side of one edge each publish a socket on it — one that
// let the jewel through and one the jewel blocked — and both sit at the same
// point, because it is the same edge. They are one node, and this is which key
// the pair answers to: the one a point was spent on, so a player pressing the
// edge is offered what the edge can actually do.
function socketKeys(clusters: readonly Cluster[]): Map<Answer, Answer> {
  const byEdge = new Map<string, Slot[]>();
  const owner = new Map<Answer, Answer>();
  for (const cluster of clusters) {
    for (const slot of cluster.slots) {
      const edge = [cluster.hex, slot.toward].sort().join('|');
      byEdge.set(edge, [...(byEdge.get(edge) ?? []), slot]);
    }
  }
  for (const sharing of byEdge.values()) {
    const kept = [...sharing].sort((left, right) => rank(left) - rank(right) || (left.node < right.node ? -1 : 1))[0];
    for (const slot of sharing) owner.set(slot.node, kept.node);
  }
  return owner;
}

// Which of two sockets on one edge is the one to keep. Allocated first, because
// that is the socket the jewel came through and the only one of the pair that
// has ever been paid for.
const STANDING_RANK: Record<Standing, number> = { allocated: 0, available: 1, unreached: 2, blocked: 3 };

const rank = (slot: Slot): number => STANDING_RANK[slot.standing];

export function planeGraph(plane: Plane): PlaneGraph {
  const owner = socketKeys(plane.clusters);
  const nodes: GraphNode[] = [];
  const at = new Map<Answer, Point>();

  for (const cluster of plane.clusters) {
    const hex = hexAt(cluster.hex);
    const ways = new Map(cluster.positions.map((position) => [position.position, facing(hex, position.faces)]));

    for (const position of cluster.positions) {
      const way = ways.get(position.position) ?? null;
      const spot = way
        ? { x: hex.x + way.x * OUTER * HEX_SPAN, y: hex.y + way.y * OUTER * HEX_SPAN }
        : hangingOff(plane, cluster, position, ways, hex);
      at.set(position.node, spot);
      nodes.push({
        key: position.node,
        hex: cluster.hex,
        at: spot,
        standing: position.standing,
        socket: false,
        free: position.free,
        holds: null,
        title: position.title,
        payloads: position.payloads,
        position: position.position,
      });
    }

    for (const slot of cluster.slots) {
      if (owner.get(slot.node) !== slot.node) continue;
      const spot = between(hex, hexAt(slot.toward));
      at.set(slot.node, spot);
      nodes.push({
        key: slot.node,
        hex: cluster.hex,
        at: spot,
        standing: slot.standing,
        socket: true,
        free: false,
        holds: slot.beyond === null ? null : (plane.clusters.find((each) => each.hex === slot.beyond)?.title ?? null),
        title: null,
        payloads: [],
        position: 0,
      });
    }
  }

  // The published pairs, with both ends resolved through the sockets that
  // merged: an edge onto the socket that was dropped is an edge onto the one
  // that stands in its place, and an edge that becomes a loop is the two halves
  // of one socket naming each other.
  const allocated = new Set(nodes.filter((node) => node.standing === 'allocated').map((node) => node.key));
  const drawn = new Map<string, GraphEdge>();
  for (const link of plane.links) {
    const from = owner.get(link.from) ?? link.from;
    const to = owner.get(link.to) ?? link.to;
    const ends = [at.get(from), at.get(to)];
    if (from === to || !ends[0] || !ends[1]) continue;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (!drawn.has(key)) drawn.set(key, { key, from: ends[0], to: ends[1], live: allocated.has(from) && allocated.has(to) });
  }

  return { nodes, edges: [...drawn.values()], points: nodes.map((node) => node.at) };
}

// Where a position that faces no edge goes. One that hangs off exactly one
// position that does — the inner ring of a double ring — is drawn inside it, so
// the ring reads as two. Anything else is the middle of its cluster: the hub of
// a wheel touches all six and belongs to none.
function hangingOff(plane: Plane, cluster: Cluster, position: Position, ways: ReadonlyMap<number, Point | null>, hex: Point): Point {
  const mine = plane.links.filter((link) => link.from === position.node || link.to === position.node);
  const neighbours = mine.map((link) => (link.from === position.node ? link.to : link.from));
  const facing = cluster.positions.filter((each) => neighbours.includes(each.node) && ways.get(each.position));
  if (facing.length !== 1) return hex;
  const way = ways.get(facing[0].position)!;
  return { x: hex.x + way.x * INNER * HEX_SPAN, y: hex.y + way.y * INNER * HEX_SPAN };
}

// Which nodes and edges the last drawing of this plane did not have. A jewel
// dropped into a socket brings a whole cluster at once, and this is what lets
// it arrive a node at a time rather than all in one frame.
export function newlyDrawn(before: PlaneGraph | null, after: PlaneGraph): { nodes: Answer[]; edges: string[] } {
  const nodes = new Set(before?.nodes.map((node) => node.key) ?? []);
  const edges = new Set(before?.edges.map((edge) => edge.key) ?? []);
  return {
    nodes: after.nodes.filter((node) => !nodes.has(node.key)).map((node) => node.key),
    edges: after.edges.filter((edge) => !edges.has(edge.key)).map((edge) => edge.key),
  };
}

// How long after the cluster lands each of its nodes does, in the order the
// graph lists them. A whole cluster arriving in one frame reads as the screen
// having changed; one node at a time reads as it being built.
export const ARRIVAL_STEP_MS = 90;

export const arrivalDelay = (at: number): number => at * ARRIVAL_STEP_MS;
