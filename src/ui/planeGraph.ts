import type { Answer } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import { TOUCH_FLOOR, type Point } from './viewport';

export type Plane = PlayView['planes'][number];
type Cluster = Plane['clusters'][number];
type Position = Cluster['positions'][number];
type Slot = Cluster['slots'][number];

export type Standing = Position['standing'];

export const NODE_SIZE = TOUCH_FLOOR;
export const NODE_REACH = NODE_SIZE / 2;
export const SOCKET_REACH = (NODE_SIZE * Math.SQRT2) / 2;

export const NODE_CLEARANCE = 4;

export const reachOf = (node: { socket: boolean }): number => (node.socket ? SOCKET_REACH : NODE_REACH);

export const HEX_SPAN = 360;

const OUTER = 0.3;
const INNER = OUTER / 2;

export interface GraphNode {
  key: Answer;
  hex: Answer;
  at: Point;
  standing: Standing;
  socket: boolean;
  free: boolean;
  holds: Cluster['title'] | null;
  title: Position['title'];
  payloads: Position['payloads'];
  position: number;
}

export interface GraphEdge {
  key: string;
  from: Point;
  to: Point;
  live: boolean;
}

export interface PlaneGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  points: Point[];
}

export function hexAt(key: Answer): Point {
  const [q, r] = key.split(',').map(Number);
  if (!Number.isFinite(q) || !Number.isFinite(r)) return { x: 0, y: 0 };
  return { x: HEX_SPAN * (q + r / 2), y: HEX_SPAN * (Math.sqrt(3) / 2) * r };
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const between = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function facing(hex: Point, faces: readonly Answer[]): Point | null {
  let sum = { x: 0, y: 0 };
  for (const face of faces) {
    const toward = hexAt(face);
    sum = add(sum, { x: toward.x - hex.x, y: toward.y - hex.y });
  }
  const length = Math.hypot(sum.x, sum.y);
  return length < 1e-6 ? null : { x: sum.x / length, y: sum.y / length };
}

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

function hangingOff(plane: Plane, cluster: Cluster, position: Position, ways: ReadonlyMap<number, Point | null>, hex: Point): Point {
  const mine = plane.links.filter((link) => link.from === position.node || link.to === position.node);
  const neighbours = mine.map((link) => (link.from === position.node ? link.to : link.from));
  const facing = cluster.positions.filter((each) => neighbours.includes(each.node) && ways.get(each.position));
  if (facing.length !== 1) return hex;
  const way = ways.get(facing[0].position)!;
  return { x: hex.x + way.x * INNER * HEX_SPAN, y: hex.y + way.y * INNER * HEX_SPAN };
}

export function newlyDrawn(before: PlaneGraph | null, after: PlaneGraph): { nodes: Answer[]; edges: string[] } {
  const nodes = new Set(before?.nodes.map((node) => node.key) ?? []);
  const edges = new Set(before?.edges.map((edge) => edge.key) ?? []);
  return {
    nodes: after.nodes.filter((node) => !nodes.has(node.key)).map((node) => node.key),
    edges: after.edges.filter((edge) => !edges.has(edge.key)).map((edge) => edge.key),
  };
}

export const ARRIVAL_STEP_MS = 90;

export const arrivalDelay = (at: number): number => at * ARRIVAL_STEP_MS;
