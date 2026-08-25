import { Registry } from '../content/registry';
import { isPoint, point, sampleCount } from '../grammar/range';
import { BonusAmount, Counter } from '../grammar/tagClause';
import { Hex, hexKey, PlaneNode } from '../content/hex';
import { clusterAt, isAllocated, placementAt, Plane, planeClusters } from './clusterPlane';
import { Growth, growItem, ItemInstance } from './itemInstance';
import { aCount, anId, says, type Said } from './said';
import { GameState } from './state';

export interface ScaledPayload {
  readonly node: PlaneNode;
  readonly statId: string;
  readonly bonus: BonusAmount;
  readonly scale: number;
  readonly per?: Counter;
}

function clusterScale(registry: Registry, effects: readonly string[], statId: string): number {
  let pooled = 0;
  for (const effect of effects) {
    const declared = registry.items.get(effect)?.clusterEffect;
    if (declared?.statId === statId) pooled += declared.percent / 100;
  }
  return 1 + pooled;
}

export function positionPayloads(registry: Registry, plane: Plane, hex: Hex, position: number): ScaledPayload[] {
  const cluster = clusterAt(plane, hex);
  const placement = placementAt(registry, plane, hex);
  if (!cluster || !placement) return [];
  const passiveId: string | undefined = placement.jewel.positions[position];
  if (passiveId === undefined) return [];
  const node: PlaneNode = { hex, kind: 'position', position };
  const payloads: ScaledPayload[] = [];
  for (const tag of registry.passives.get(passiveId)?.tags ?? []) {
    if (tag.kind !== 'stat-bonus') continue;
    const bonus = rolledAt(tag, cluster.roll);
    const scale = clusterScale(registry, cluster.effects, tag.statId);
    payloads.push(tag.per === undefined ? { node, statId: tag.statId, bonus, scale } : { node, statId: tag.statId, bonus, scale, per: tag.per });
  }
  return payloads;
}

// The cluster drew one number when it entered the plane, and every range its jewel's passives declare
// is read at that number. One roll a cluster and not one a payload, so a jewel is good or bad rather
// than good in places, and a save that keeps the roll keeps every payload with it.
function rolledAt(bonus: BonusAmount, roll: number): BonusAmount {
  return bonus.percent || isPoint(bonus.amount) ? bonus : { percent: false, amount: point(sampleCount(bonus.amount, roll)) };
}

export function allocatedPositions(registry: Registry, plane: Plane): { hex: Hex; position: number; passiveId: string }[] {
  const allocated: { hex: Hex; position: number; passiveId: string }[] = [];
  for (const { hex } of planeClusters(plane)) {
    const placement = placementAt(registry, plane, hex);
    if (!placement) continue;
    for (const key of Object.keys(placement.jewel.positions)) {
      const position = Number(key);
      if (!isAllocated(registry, plane, { hex, kind: 'position', position })) continue;
      allocated.push({ hex, position, passiveId: placement.jewel.positions[position] });
    }
  }
  return allocated;
}

export function instancePayloads(registry: Registry, instance: ItemInstance): ScaledPayload[] {
  return allocatedPositions(registry, instance.plane).flatMap(({ hex, position }) => positionPayloads(registry, instance.plane, hex, position));
}

function recordEffect(registry: Registry, plane: Plane, hex: Hex, effectItem: string): Said | undefined {
  const cluster = clusterAt(plane, hex);
  const placement = placementAt(registry, plane, hex);
  const at = anId(hexKey(hex));
  if (!cluster || !placement) return says('engine.plane.no-cluster', { hex: at });
  if (cluster.effects.includes(effectItem)) return says('engine.cluster.effect-repeated', { hex: at, effect: anId(effectItem) });
  if (cluster.effects.length >= placement.jewel.modSlots) return says('engine.cluster.slots-full', { hex: at, count: aCount(placement.jewel.modSlots) });
  cluster.effects.push(effectItem);
  return undefined;
}

export function applyClusterEffect(state: GameState, registry: Registry, target: string, effectItem: string, hex: Hex): Growth {
  if (registry.items.get(effectItem)?.clusterEffect === undefined) return { ok: false, refused: says('engine.cluster.not-an-effect', { item: anId(effectItem) }) };
  return growItem(state, registry, {
    target,
    consumes: effectItem,
    change: (payload) => recordEffect(registry, payload.plane, hex, effectItem),
  });
}
