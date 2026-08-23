import { ClusterEffect, Item } from '../content/sections/item';
import { Direction, DIRECTIONS, Hex, hexKey, NEIGHBOR_DELTA, opposite, PlaneNode } from '../content/hex';
import { Registry } from '../content/registry';
import { getShape } from '../content/shapes';
import { BonusAmount, Counter } from '../grammar/tagClause';
import { carriedName } from './carriedName';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { positionPayloads } from './clusterEffect';
import { basePlane, isAllocated, neighbours, nodeKey, placementAt, Plane, planeClusters, pointsSpent, positionOnEdge, slotDirections, slotState } from './clusterPlane';
import { itemContribution, scaledAmount, StatContribution } from './itemContribution';
import { hasStackCopy, itemCopies, grownItems, isGrownCopy, itemInstance, ItemInstance, itemLevel, itemTemplate, pointsRemaining, wornCopy } from './itemInstance';
import { GameState } from './state';
import { counterLevels } from './stats';

export type Standing = 'allocated' | 'available' | 'unreached' | 'blocked';

export interface PayloadReport {
  readonly statId: Answer;
  readonly statTitle: Localized;
  readonly effective: BonusAmount;
  readonly scale: number;
  readonly perTitle?: Localized;
}

export interface ContributionReport extends StatContribution {
  readonly statTitle: Localized;
}

export interface PositionReport {
  readonly position: number;
  readonly node: Answer;
  readonly passive: Answer | null;
  readonly title: Localized | null;
  readonly standing: Standing;
  readonly free: boolean;
  readonly faces: Answer[];
  readonly payloads: PayloadReport[];
}

export interface SlotReport {
  readonly direction: Direction;
  readonly node: Answer;
  readonly standing: Standing;
  readonly toward: Answer;
  readonly beyond: Answer | null;
}

export interface ClusterReport {
  readonly hex: Answer;
  readonly jewel: Answer;
  readonly title: Localized;
  readonly examine: Localized | null;
  readonly shape: Answer;
  readonly entry: { hex: Answer; direction: Direction } | null;
  readonly effects: Array<{ id: Answer; title: Localized; statTitle: Localized; effect: ClusterEffect }>;
  readonly modSlots: number;
  readonly positions: PositionReport[];
  readonly slots: SlotReport[];
}

export interface PlaneFocus {
  readonly kind: 'plane';
  readonly instance: Answer;
  readonly hex: Answer;
}

export interface PlaneReport {
  readonly instance: Answer;
  readonly template: Answer;
  readonly title: Localized;
  readonly name: Localized;
  readonly level: number;
  readonly maxLevel: number;
  readonly spent: number;
  readonly remaining: number;
  readonly clusters: ClusterReport[];
  readonly links: Array<{ readonly from: Answer; readonly to: Answer }>;
  readonly contributions: ContributionReport[];
}

function standingOf(registry: Registry, plane: Plane, node: PlaneNode): Standing {
  if (isAllocated(registry, plane, node)) return 'allocated';
  if (node.kind === 'slot' && slotState(registry, plane, node.hex, node.direction) === 'blocked') return 'blocked';
  return neighbours(registry, plane, node).some((each) => isAllocated(registry, plane, each)) ? 'available' : 'unreached';
}

const step = (hex: Hex, direction: Direction): string => hexKey({ q: hex.q + NEIGHBOR_DELTA[direction].q, r: hex.r + NEIGHBOR_DELTA[direction].r });

function counterTitle(localizer: Localizer, per: Counter): Localized {
  return localizer.title(per.kind === 'stack' ? 'item' : 'resource', per.id);
}

function payloadsOf(registry: Registry, localizer: Localizer, plane: Plane, hex: Hex, position: number): PayloadReport[] {
  return positionPayloads(registry, plane, hex, position).map((payload) => ({
    statId: payload.statId,
    statTitle: localizer.title('stat', payload.statId),
    effective: scaledAmount(payload.bonus, payload.scale),
    scale: payload.scale,
    ...(payload.per === undefined ? {} : { perTitle: counterTitle(localizer, payload.per) }),
  }));
}

function distance(hex: Hex): number {
  return (Math.abs(hex.q) + Math.abs(hex.r) + Math.abs(hex.q + hex.r)) / 2;
}

function clusterReport(registry: Registry, localizer: Localizer, plane: Plane, hex: Hex): ClusterReport | undefined {
  const cluster = plane[hexKey(hex)];
  const placement = placementAt(registry, plane, hex);
  if (!cluster || !placement) return undefined;

  const { jewel } = placement;
  const shape = getShape(jewel.shape);
  const positions: PositionReport[] = [];
  for (let position = 1; position <= shape.positionCount; position++) {
    const passive: string | undefined = jewel.positions[position];
    const standing = standingOf(registry, plane, { hex, kind: 'position', position });
    positions.push({
      position,
      node: nodeKey({ hex, kind: 'position', position }),
      passive: passive ?? null,
      title: passive === undefined ? null : localizer.title('passive', passive),
      standing,
      free: standing === 'allocated' && !cluster.allocatedPositions.includes(position),
      faces: DIRECTIONS.filter((direction) => positionOnEdge(placement, direction) === position).map((direction) => step(hex, direction)),
      payloads: payloadsOf(registry, localizer, plane, hex, position),
    });
  }

  const open = slotDirections(placement);
  const slots: SlotReport[] = [];
  for (const direction of DIRECTIONS) {
    if (!open.includes(direction)) continue;
    const occupied = plane[step(hex, direction)] !== undefined;
    slots.push({
      direction,
      node: nodeKey({ hex, kind: 'slot', direction }),
      standing: standingOf(registry, plane, { hex, kind: 'slot', direction }),
      toward: step(hex, direction),
      beyond: occupied ? step(hex, direction) : null,
    });
  }

  const effects: ClusterReport['effects'] = [];
  for (const id of cluster.effects) {
    const item = registry.items.get(id);
    if (item?.clusterEffect) effects.push({ id, title: localizer.title('item', id), statTitle: localizer.title('stat', item.clusterEffect.statId), effect: item.clusterEffect });
  }

  const entry = cluster.entry === null ? null : { hex: step(hex, opposite(cluster.entry)), direction: cluster.entry };
  const declared = registry.clusterJewels.has(jewel.id);
  return {
    hex: hexKey(hex),
    jewel: jewel.id,
    title: declared ? localizer.title('cluster-jewel', jewel.id) : localizer.engine('engine.plane.base'),
    examine: (declared ? localizer.words('cluster-jewel', jewel.id, 'examine') : undefined) ?? null,
    shape: jewel.shape,
    entry,
    effects,
    modSlots: jewel.modSlots,
    positions,
    slots,
  };
}

function targeted(registry: Registry, state: GameState, target: string): { item: Item; template: string; grown: boolean; payload: ItemInstance } | undefined {
  const template = itemTemplate(state, target);
  const item = registry.items.get(template);
  if (!item) return undefined;

  const live = itemInstance(state, target);
  if (live) return { item, template, grown: true, payload: live };
  if (!hasStackCopy(state, target)) return undefined;

  const plane = basePlane(item);
  return plane === undefined ? undefined : { item, template, grown: false, payload: { experience: 0, plane } };
}

export function planeReport(registry: Registry, state: GameState, target: string): PlaneReport | undefined {
  const targets = targeted(registry, state, target);
  if (!targets) return undefined;
  const { item, template, grown, payload } = targets;
  const localizer = localizerOf(registry, state);

  const clusters = planeClusters(payload.plane)
    .sort((a, b) => distance(a.hex) - distance(b.hex) || a.hex.q - b.hex.q || a.hex.r - b.hex.r)
    .flatMap(({ hex }) => clusterReport(registry, localizer, payload.plane, hex) ?? []);

  return {
    instance: target,
    template,
    title: localizer.title('item', template),
    name: carriedName(localizer, 'item', template, grown ? target : null),
    level: itemLevel(payload, item),
    maxLevel: item.maxLevel,
    spent: pointsSpent(payload.plane),
    remaining: pointsRemaining(payload, item),
    clusters,
    links: linksAcross(registry, payload.plane, clusters),
    contributions: itemContribution(registry, item, payload, counterLevels(state)).map((each) => ({ ...each, statTitle: localizer.title('stat', each.statId) })),
  };
}

function linksAcross(registry: Registry, plane: Plane, clusters: readonly ClusterReport[]): PlaneReport['links'] {
  const drawn = new Set(clusters.flatMap((cluster) => [...cluster.positions.map((each) => each.node), ...cluster.slots.map((each) => each.node)]));
  const links = new Map<string, { from: Answer; to: Answer }>();
  for (const { hex } of planeClusters(plane)) {
    const placement = placementAt(registry, plane, hex);
    if (!placement) continue;
    const here: PlaneNode[] = [
      ...Array.from({ length: getShape(placement.jewel.shape).positionCount }, (_, at): PlaneNode => ({ hex, kind: 'position', position: at + 1 })),
      ...slotDirections(placement).map((direction): PlaneNode => ({ hex, kind: 'slot', direction })),
    ];
    for (const node of here) {
      const from = nodeKey(node);
      for (const other of neighbours(registry, plane, node)) {
        const to = nodeKey(other);
        if (!drawn.has(from) || !drawn.has(to)) continue;
        const pair = from < to ? `${from}|${to}` : `${to}|${from}`;
        if (!links.has(pair)) links.set(pair, from < to ? { from, to } : { from: to, to: from });
      }
    }
  }
  return [...links.values()];
}

export function planeReports(registry: Registry, state: GameState): PlaneReport[] {
  const stacks = [...itemCopies(state).keys()];
  const slots = Object.entries(state.equipped).flatMap(([slot, id]) => (isGrownCopy(state, id) ? [] : [wornCopy(slot)]));
  return [...Object.keys(grownItems(state)), ...stacks, ...slots].flatMap((id) => planeReport(registry, state, id) ?? []);
}
