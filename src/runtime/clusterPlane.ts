import { ClusterJewel, DEFAULT_MOD_SLOTS } from '../content/clusterJewel';
import { Direction, DIRECTIONS, Hex, hexKey, NEIGHBOR_DELTA, opposite, parseHexKey, PlaneNode, rotate, rotationOnto } from '../content/hex';
import { isBase, Item } from '../content/item';
import { Registry } from '../content/registry';
import { getShape } from '../content/shapes';
import { aCount, anId, says, type Said } from './said';

export const ORIGIN: Hex = { q: 0, r: 0 };

// What one hex of the plane holds. `entry` is the parent's slot direction this
// cluster was slotted through and is the whole of what rotation is stored as
// (c7); it is null exactly at the origin, which is never slotted. The origin's
// root is allocated by the rule in `isAllocated` rather than by a record, so
// the number of entries here is the number of points spent and nothing has to
// remember which one was free.
export interface Cluster {
  jewel: string | null;
  entry: Direction | null;
  allocatedPositions: number[];
  allocatedSlots: Direction[];
  effects: string[];
}

export type Plane = Record<string, Cluster>;

export interface Placement {
  readonly jewel: ClusterJewel;
  readonly rotation: number;
}

export type SlotState = 'none' | 'open' | 'filled' | 'blocked';

// The cluster an item base carries when it declares no `origin-cluster:` of its
// own (c9). It is not a declaration and is never registered, so no content can
// shadow it, `jewel: null` is what a save records for it, and the words a
// report draws it under are `engine.plane.base` rather than this field, which
// addresses nothing.
const BASE_CLUSTER: ClusterJewel = {
  id: 'base',
  title: 'base',
  shape: 'point',
  openConnections: ['e'],
  positions: {},
  modSlots: DEFAULT_MOD_SLOTS,
};

// A plane is keyed by string so that it saves. Every walk over one wants the
// hex back, so the key is read back here rather than at each of them, and a
// key a hand-edited save left unparseable is skipped the same way everywhere.
export function planeClusters(plane: Plane): { hex: Hex; cluster: Cluster }[] {
  const standing: { hex: Hex; cluster: Cluster }[] = [];
  for (const [key, cluster] of Object.entries(plane)) {
    const hex = parseHexKey(key);
    if (hex) standing.push({ hex, cluster });
  }
  return standing;
}

const step = (hex: Hex, direction: Direction): Hex => ({ q: hex.q + NEIGHBOR_DELTA[direction].q, r: hex.r + NEIGHBOR_DELTA[direction].r });

const isDirection = (value: string): value is Direction => (DIRECTIONS as readonly string[]).includes(value);

export function clusterAt(plane: Plane, hex: Hex): Cluster | undefined {
  return plane[hexKey(hex)];
}

function placementOf(registry: Registry, cluster: Cluster): Placement | undefined {
  const jewel = cluster.jewel === null ? BASE_CLUSTER : registry.clusterJewels.get(cluster.jewel);
  if (!jewel) return undefined;
  return { jewel, rotation: cluster.entry === null ? 0 : rotationOnto('w', opposite(cluster.entry)) };
}

export function placementAt(registry: Registry, plane: Plane, hex: Hex): Placement | undefined {
  const cluster = clusterAt(plane, hex);
  return cluster === undefined ? undefined : placementOf(registry, cluster);
}

export function rootPosition(jewel: ClusterJewel): number {
  return getShape(jewel.shape).edges.w;
}

export function slotDirections(placement: Placement): Direction[] {
  return placement.jewel.openConnections.filter(isDirection).map((authored) => rotate(authored, placement.rotation));
}

export function positionOnEdge(placement: Placement, direction: Direction): number {
  return getShape(placement.jewel.shape).edges[rotate(direction, -placement.rotation)];
}

// A node inside a sentence about it, which is a pattern the played language
// supplies like any other rather than a phrase assembled before one.
function describeNode(node: PlaneNode): Said {
  const hex = anId(hexKey(node.hex));
  return node.kind === 'slot' ? says('engine.plane.node.slot', { direction: anId(node.direction), hex }) : says('engine.plane.node.position', { position: aCount(node.position), hex });
}

export function slotState(registry: Registry, plane: Plane, hex: Hex, direction: Direction): SlotState {
  const placement = placementAt(registry, plane, hex);
  if (!placement || !slotDirections(placement).includes(direction)) return 'none';
  const beyond = clusterAt(plane, step(hex, direction));
  if (!beyond) return 'open';
  return beyond.entry === direction ? 'filled' : 'blocked';
}

// The two refusals filling a slot and allocating one share, so c8's blocked
// slot is one sentence refused in one place rather than two that can drift.
function slotProblem(state: SlotState, hex: Hex, direction: Direction): Said | undefined {
  const at = { direction: anId(direction), hex: anId(hexKey(hex)) };
  if (state === 'none') return says('engine.plane.no-slot', at);
  if (state === 'blocked') return says('engine.plane.slot-blocked', { ...at, beyond: anId(hexKey(step(hex, direction))) });
  return undefined;
}

export function isAllocated(registry: Registry, plane: Plane, node: PlaneNode): boolean {
  const cluster = clusterAt(plane, node.hex);
  if (!cluster) return false;
  if (node.kind === 'slot') return cluster.allocatedSlots.includes(node.direction);
  if (cluster.allocatedPositions.includes(node.position)) return true;
  const placement = placementOf(registry, cluster);
  return cluster.entry === null && placement !== undefined && node.position === rootPosition(placement.jewel);
}

// Undirected throughout, and never a parent relation: a shape's own adjacency,
// the slot each edge hangs off, and — across a slot that was actually filled —
// the two roots that slot joins (c8, c13).
export function neighbours(registry: Registry, plane: Plane, node: PlaneNode): PlaneNode[] {
  const cluster = clusterAt(plane, node.hex);
  const placement = cluster === undefined ? undefined : placementOf(registry, cluster);
  if (!cluster || !placement) return [];

  if (node.kind === 'slot') {
    if (!slotDirections(placement).includes(node.direction)) return [];
    const touching: PlaneNode = { hex: node.hex, kind: 'position', position: positionOnEdge(placement, node.direction) };
    const beyondHex = step(node.hex, node.direction);
    const beyond = clusterAt(plane, beyondHex);
    const beyondPlacement = beyond?.entry === node.direction ? placementOf(registry, beyond) : undefined;
    if (!beyondPlacement) return [touching];
    return [touching, { hex: beyondHex, kind: 'position', position: rootPosition(beyondPlacement.jewel) }];
  }

  const found: PlaneNode[] = [];
  for (const [one, other] of getShape(placement.jewel.shape).adjacency) {
    if (one === node.position) found.push({ hex: node.hex, kind: 'position', position: other });
    if (other === node.position) found.push({ hex: node.hex, kind: 'position', position: one });
  }
  for (const direction of slotDirections(placement)) {
    if (positionOnEdge(placement, direction) === node.position) found.push({ hex: node.hex, kind: 'slot', direction });
  }
  if (cluster.entry !== null && node.position === rootPosition(placement.jewel)) {
    found.push({ hex: step(node.hex, opposite(cluster.entry)), kind: 'slot', direction: cluster.entry });
  }
  return found;
}

export function pointsSpent(plane: Plane): number {
  return Object.values(plane).reduce((total, cluster) => total + cluster.allocatedPositions.length + cluster.allocatedSlots.length, 0);
}

export function originPlane(jewel: string | null): Plane {
  return { [hexKey(ORIGIN)]: { jewel, entry: null, allocatedPositions: [], allocatedSlots: [], effects: [] } };
}

// The plane an item starts with, and `undefined` for an item that has none: a
// jewel, an orb and a consumable are not bases, so there is nothing to grow and
// nothing for a worn stack copy to contribute (c9).
export function basePlane(item: Item): Plane | undefined {
  return isBase(item) ? originPlane(item.originCluster ?? null) : undefined;
}

// Checks and then places, so no caller holds a way to put a cluster down
// without them. The rotation is not stored: `entry` is, and it is what c7's
// rule is read back out of.
export function fillSlot(registry: Registry, plane: Plane, hex: Hex, direction: Direction, jewel: string): Said | undefined {
  const state = slotState(registry, plane, hex, direction);
  const problem = slotProblem(state, hex, direction);
  if (problem) return problem;
  const at = { direction: anId(direction), hex: anId(hexKey(hex)) };
  if (state === 'filled') return says('engine.plane.slot-filled', at);
  if (!isAllocated(registry, plane, { hex, kind: 'slot', direction })) return says('engine.plane.slot-unallocated', at);

  plane[hexKey(step(hex, direction))] = { jewel, entry: direction, allocatedPositions: [], allocatedSlots: [], effects: [] };
  return undefined;
}

export function allocateNode(registry: Registry, plane: Plane, node: PlaneNode, points: number): Said | undefined {
  const cluster = clusterAt(plane, node.hex);
  const placement = cluster === undefined ? undefined : placementOf(registry, cluster);
  if (!cluster || !placement) return says('engine.plane.no-cluster', { hex: anId(hexKey(node.hex)) });

  if (node.kind === 'position') {
    const count = getShape(placement.jewel.shape).positionCount;
    if (!Number.isInteger(node.position) || node.position < 1 || node.position > count) return says('engine.plane.no-position', { shape: anId(placement.jewel.shape), position: aCount(node.position), count: aCount(count) });
  } else {
    const problem = slotProblem(slotState(registry, plane, node.hex, node.direction), node.hex, node.direction);
    if (problem) return problem;
  }
  const at = describeNode(node);
  if (isAllocated(registry, plane, node)) return says('engine.plane.already-allocated', { node: at });
  if (points < 1) return says('engine.plane.no-points', { node: at });
  if (!neighbours(registry, plane, node).some((each) => isAllocated(registry, plane, each))) return says('engine.plane.unreachable', { node: at });

  if (node.kind === 'slot') cluster.allocatedSlots.push(node.direction);
  else cluster.allocatedPositions.push(node.position);
  return undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const hasNoRepeats = (values: readonly unknown[]): boolean => new Set(values).size === values.length;

function isCluster(value: unknown, atOrigin: boolean): value is Cluster {
  if (!isRecord(value)) return false;
  if (!(value.jewel === null || typeof value.jewel === 'string')) return false;
  if (atOrigin ? value.entry !== null : !(typeof value.entry === 'string' && isDirection(value.entry))) return false;
  if (!Array.isArray(value.allocatedPositions) || !value.allocatedPositions.every((each) => Number.isInteger(each) && each >= 1)) return false;
  if (!Array.isArray(value.allocatedSlots) || !value.allocatedSlots.every((each) => typeof each === 'string' && isDirection(each))) return false;
  if (!Array.isArray(value.effects) || !value.effects.every((each) => typeof each === 'string')) return false;
  return hasNoRepeats(value.allocatedPositions) && hasNoRepeats(value.allocatedSlots) && hasNoRepeats(value.effects);
}

export function isPlane(value: unknown): value is Plane {
  if (!isRecord(value) || !(hexKey(ORIGIN) in value)) return false;
  for (const [key, cluster] of Object.entries(value)) {
    if (!parseHexKey(key)) return false;
    if (!isCluster(cluster, key === hexKey(ORIGIN))) return false;
  }
  return true;
}

const nodeKey = (node: PlaneNode): string => (node.kind === 'slot' ? `${hexKey(node.hex)}/${node.direction}` : `${hexKey(node.hex)}/${node.position}`);

function allocatedNodes(plane: Plane): PlaneNode[] {
  const nodes: PlaneNode[] = [];
  for (const { hex, cluster } of planeClusters(plane)) {
    for (const position of cluster.allocatedPositions) nodes.push({ hex, kind: 'position', position });
    for (const direction of cluster.allocatedSlots) nodes.push({ hex, kind: 'slot', direction });
  }
  return nodes;
}

function drop(plane: Plane, node: PlaneNode): void {
  const cluster = clusterAt(plane, node.hex);
  if (!cluster) return;
  if (node.kind === 'slot') cluster.allocatedSlots = cluster.allocatedSlots.filter((each) => each !== node.direction);
  else cluster.allocatedPositions = cluster.allocatedPositions.filter((each) => each !== node.position);
}

function dropUnplaceable(registry: Registry, plane: Plane, repairs: Said[]): boolean {
  let changed = false;
  for (const [key, cluster] of Object.entries(plane)) {
    if (placementOf(registry, cluster)) continue;
    changed = true;
    if (key === hexKey(ORIGIN)) {
      repairs.push(says('engine.plane.repair.origin', { jewel: anId(String(cluster.jewel)) }));
      plane[key] = originPlane(null)[key]!;
    } else {
      repairs.push(says('engine.plane.repair.cluster', { jewel: anId(String(cluster.jewel)), hex: anId(key) }));
      delete plane[key];
    }
  }
  return changed;
}

function dropStranded(registry: Registry, plane: Plane, repairs: Said[]): boolean {
  let changed = false;
  for (const { hex, cluster } of planeClusters(plane)) {
    if (cluster.entry === null) continue;
    const parent = step(hex, opposite(cluster.entry));
    if (slotState(registry, plane, parent, cluster.entry) === 'filled') continue;
    repairs.push(says('engine.plane.repair.stranded', { jewel: anId(String(cluster.jewel)), hex: anId(hexKey(hex)), direction: anId(cluster.entry), parent: anId(hexKey(parent)) }));
    delete plane[hexKey(hex)];
    changed = true;
  }
  return changed;
}

function dropVanishedAllocations(registry: Registry, plane: Plane, repairs: Said[]): void {
  for (const node of allocatedNodes(plane)) {
    const placement = placementAt(registry, plane, node.hex);
    if (!placement) continue;
    const gone = node.kind === 'slot'
      ? !slotDirections(placement).includes(node.direction)
      : node.position > getShape(placement.jewel.shape).positionCount;
    if (!gone) continue;
    repairs.push(says('engine.plane.repair.dropped', { node: describeNode(node), jewel: anId(placement.jewel.id) }));
    drop(plane, node);
  }
}

function dropVanishedEffects(registry: Registry, plane: Plane, repairs: Said[]): void {
  for (const [key, cluster] of Object.entries(plane)) {
    for (const effect of [...cluster.effects]) {
      if (registry.items.get(effect)?.clusterEffect) continue;
      repairs.push(says('engine.plane.repair.effect', { effect: anId(effect), hex: anId(key) }));
      cluster.effects = cluster.effects.filter((each) => each !== effect);
    }
  }
}

// Every allocation is reachable from the origin's root through allocated
// nodes, and a repair that drops one may cut the path to another; walking the
// survivors is how that stays true rather than being asserted of a plane
// nothing checks.
function dropUnreachableAllocations(registry: Registry, plane: Plane, repairs: Said[]): void {
  const placement = placementAt(registry, plane, ORIGIN);
  if (!placement) return;
  const frontier: PlaneNode[] = [{ hex: ORIGIN, kind: 'position', position: rootPosition(placement.jewel) }];
  const reached = new Set<string>([nodeKey(frontier[0]!)]);
  while (frontier.length > 0) {
    const node = frontier.pop()!;
    for (const next of neighbours(registry, plane, node)) {
      if (reached.has(nodeKey(next)) || !isAllocated(registry, plane, next)) continue;
      reached.add(nodeKey(next));
      frontier.push(next);
    }
  }
  for (const node of allocatedNodes(plane)) {
    if (reached.has(nodeKey(node))) continue;
    repairs.push(says('engine.plane.repair.unreachable', { node: describeNode(node) }));
    drop(plane, node);
  }
}

// c21, from the plane's side: what a payload names may have gone, and what is
// left has to be a plane the same rules would have built. Complete in one
// call — a drop that strands a cluster beyond it is followed here rather than
// left for a second pass the substrate only makes when an instance empties.
export function repairPlane(registry: Registry, plane: Plane): Said[] {
  const repairs: Said[] = [];
  for (let settled = false; !settled; ) {
    settled = !dropUnplaceable(registry, plane, repairs);
    settled = !dropStranded(registry, plane, repairs) && settled;
  }
  dropVanishedAllocations(registry, plane, repairs);
  dropVanishedEffects(registry, plane, repairs);
  dropUnreachableAllocations(registry, plane, repairs);
  return repairs;
}
