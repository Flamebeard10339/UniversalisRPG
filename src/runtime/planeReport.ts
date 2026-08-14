import { ClusterEffect, Item } from '../content/item';
import { Direction, DIRECTIONS, Hex, hexKey, NEIGHBOR_DELTA, opposite, PlaneNode } from '../content/hex';
import { Registry } from '../content/registry';
import { getShape } from '../content/shapes';
import { BonusAmount } from '../grammar/tagClause';
import { carriedName } from './carriedName';
import { Answer, Localized, Localizer, localizerOf } from './localized';
import { positionPayloads } from './clusterEffect';
import { basePlane, isAllocated, neighbours, placementAt, Plane, planeClusters, pointsSpent, slotDirections, slotState } from './clusterPlane';
import { itemContribution, scaledAmount, StatContribution } from './itemContribution';
import { hasStackCopy, itemCopies, grownItems, isGrownCopy, itemInstance, ItemInstance, itemLevel, itemTemplate, pointsRemaining, wornCopy } from './itemInstance';
import { GameState } from './state';
import { counterLevels } from './stats';

// Where a point may go, said once for both things a point buys. `blocked` is a
// slot alone: the hex beyond it already holds a cluster that entered another
// way, so the direction is foreclosed rather than merely unreached.
export type Standing = 'allocated' | 'available' | 'unreached' | 'blocked';

// The effective magnitude, never the declared one (c19). `scale` is carried
// beside it so a reader can say where the number came from without being asked
// to derive it back, and the stat is named as well as keyed so a surface
// drawing what a position pays spells a title rather than an id (c9).
export interface PayloadReport {
  readonly statId: Answer;
  readonly statTitle: Localized;
  readonly effective: BonusAmount;
  readonly scale: number;
}

// A stat fold as a screen draws it: the fold itself, named the same way a
// payload is.
export interface ContributionReport extends StatContribution {
  readonly statTitle: Localized;
}

export interface PositionReport {
  readonly position: number;
  readonly passive: Answer | null;
  readonly title: Localized | null;
  readonly standing: Standing;
  // Allocated without a point having been spent: the origin cluster's root.
  readonly free: boolean;
  readonly payloads: PayloadReport[];
}

export interface SlotReport {
  readonly direction: Direction;
  readonly standing: Standing;
  // The hex beyond this edge when a cluster stands in it, whether this slot let
  // it in or another one did — which is the whole difference between filled and
  // blocked, and the reason both name the same neighbour.
  readonly beyond: Answer | null;
}

export interface ClusterReport {
  readonly hex: Answer;
  readonly jewel: Answer;
  readonly title: Localized;
  readonly shape: Answer;
  // The slot this cluster was slotted through, as the hex and direction the
  // `slot:` verb named — null at the origin, which is never slotted.
  readonly entry: { hex: Answer; direction: Direction } | null;
  // `effect` is the declaration, which sits below the layer that brands a
  // localized value; `statTitle` is that declaration's stat as a player reads
  // it (c9).
  readonly effects: Array<{ id: Answer; title: Localized; statTitle: Localized; effect: ClusterEffect }>;
  readonly modSlots: number;
  readonly positions: PositionReport[];
  readonly slots: SlotReport[];
}

// Which plane a screen has in hand and which hexagon of it, as the two ids the
// growth verbs spell — never the plane itself, so a surface that draws one
// draws the report the view already publishes rather than a second copy of it.
export interface PlaneFocus {
  readonly instance: Answer;
  readonly hex: Answer;
}

export interface PlaneReport {
  // The id the four verbs address this plane by.
  readonly instance: Answer;
  readonly template: Answer;
  readonly title: Localized;
  // What a screen holding this plane calls the copy it is growing (c16).
  readonly name: Localized;
  readonly level: number;
  readonly maxLevel: number;
  readonly spent: number;
  readonly remaining: number;
  readonly clusters: ClusterReport[];
  // What wearing this copy is worth, per stat, as the stat fold itself reads it
  // — the item's own tags and its allocated payloads together, so a screen
  // states this rather than adding the clusters up again (c8).
  readonly contributions: ContributionReport[];
}

function standingOf(registry: Registry, plane: Plane, node: PlaneNode): Standing {
  if (isAllocated(registry, plane, node)) return 'allocated';
  if (node.kind === 'slot' && slotState(registry, plane, node.hex, node.direction) === 'blocked') return 'blocked';
  return neighbours(registry, plane, node).some((each) => isAllocated(registry, plane, each)) ? 'available' : 'unreached';
}

const step = (hex: Hex, direction: Direction): string => hexKey({ q: hex.q + NEIGHBOR_DELTA[direction].q, r: hex.r + NEIGHBOR_DELTA[direction].r });

function payloadsOf(registry: Registry, localizer: Localizer, plane: Plane, hex: Hex, position: number): PayloadReport[] {
  return positionPayloads(registry, plane, hex, position).map((payload) => ({
    statId: payload.statId,
    statTitle: localizer.title('stat', payload.statId),
    effective: scaledAmount(payload.bonus, payload.scale),
    scale: payload.scale,
  }));
}

// The rings out from the origin, and within a ring a settled order, so two
// readings of one plane list its hexes the same way.
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
      passive: passive ?? null,
      title: passive === undefined ? null : localizer.title('passive', passive),
      standing,
      free: standing === 'allocated' && !cluster.allocatedPositions.includes(position),
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
      standing: standingOf(registry, plane, { hex, kind: 'slot', direction }),
      beyond: occupied ? step(hex, direction) : null,
    });
  }

  const effects: ClusterReport['effects'] = [];
  for (const id of cluster.effects) {
    const item = registry.items.get(id);
    if (item?.clusterEffect) effects.push({ id, title: localizer.title('item', id), statTitle: localizer.title('stat', item.clusterEffect.statId), effect: item.clusterEffect });
  }

  const entry = cluster.entry === null ? null : { hex: step(hex, opposite(cluster.entry)), direction: cluster.entry };
  return { hex: hexKey(hex), jewel: jewel.id, title: localizer.title('cluster-jewel', jewel.id), shape: jewel.shape, entry, effects, modSlots: jewel.modSlots, positions, slots };
}

// A growth verb spells its target either way an item is carried, and both have
// a plane to report: a base still in its stack has the one growing it would
// mint, which is what a screen opened on that stack is looking at. A base the
// player is wearing is the same case — c21 took it out of the stack, and the
// plane growing it would mint is the one its equipment row opens.
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
    contributions: itemContribution(registry, item, payload, counterLevels(state)).map((each) => ({ ...each, statTitle: localizer.title('stat', each.statId) })),
  };
}

// Every plane the player has, whichever way they have it: a grown copy under its
// own id and a base under the item's, whether that base is in a stack or in a
// slot — `itemCopies` counts both sides of c21, so a worn base is among its keys
// and needs no reading of `equipped` here. All are addressable by the growth
// verbs and all are what a screen can be opened on, so publishing only the grown
// ones would leave a focus pointing at a plane no driver could find.
export function planeReports(registry: Registry, state: GameState): PlaneReport[] {
  const stacks = [...itemCopies(state).keys()];
  // A worn stack copy answers to the slot wearing it rather than to its item, so
  // its plane is published under that spelling too — it is the one an equipment
  // row opens, and a focus on it would otherwise point at a plane no driver
  // could find. A worn grown copy is already among the first list.
  const slots = Object.entries(state.equipped).flatMap(([slot, id]) => (isGrownCopy(state, id) ? [] : [wornCopy(slot)]));
  return [...Object.keys(grownItems(state)), ...stacks, ...slots].flatMap((id) => planeReport(registry, state, id) ?? []);
}
