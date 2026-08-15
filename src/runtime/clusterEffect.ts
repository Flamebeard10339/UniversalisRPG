import { Registry } from '../content/registry';
import { BonusAmount, Counter } from '../grammar/tagClause';
import { Hex, hexKey, PlaneNode } from '../content/hex';
import { clusterAt, isAllocated, placementAt, Plane, planeClusters } from './clusterPlane';
import { Growth, growItem, ItemInstance } from './itemInstance';
import { aCount, anId, says, type Said } from './said';
import { GameState } from './state';

// One allocated payload and what the cluster it sits in makes it worth. The
// bonus is the declared one and `scale` is the factor it is folded with, so
// nothing here multiplies a BonusAmount: a payload leaves this module carrying
// its factor rather than having spent it.
export interface ScaledPayload {
  readonly node: PlaneNode;
  readonly statId: string;
  readonly bonus: BonusAmount;
  readonly scale: number;
  // What the declared magnitude is multiplied by per point held, when the
  // payload named one. It is a live fact about a character and a plane belongs
  // to an item, so it is carried out rather than spent here.
  readonly per?: Counter;
}

// Every effect on one cluster naming one stat joins one pool, so two 25%
// effects scale by 1.5 and never by 1.5625 (c16). An effect stops at the
// cluster's edge; the payload's own `+N%` does not, and is left to the single
// `increased` pool statRange keeps for the whole actor (c18).
function clusterScale(registry: Registry, effects: readonly string[], statId: string): number {
  let pooled = 0;
  for (const effect of effects) {
    const declared = registry.items.get(effect)?.clusterEffect;
    if (declared?.statId === statId) pooled += declared.percent / 100;
  }
  return 1 + pooled;
}

// What one position of one cluster carries, whether or not its point has been
// spent. A surface asking what a position would be worth reads the same entries
// the fold reads off an allocated one, so the number offered before allocating
// and the number reported after are one answer.
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
    const scale = clusterScale(registry, cluster.effects, tag.statId);
    payloads.push(tag.per === undefined ? { node, statId: tag.statId, bonus: tag, scale } : { node, statId: tag.statId, bonus: tag, scale, per: tag.per });
  }
  return payloads;
}

// Every position of a plane whose point has been spent, and the passive
// standing in it. The one walk over what a plane amounts to, so what its
// payloads are worth and what its passives answer cannot disagree about which
// positions are live.
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

// The whole of what a grown item's plane contributes, as one pure function of
// the instance (c20). Nothing is summed and nothing is rounded per payload
// (c19): a surface reads a position's effective number off the same entries
// the fold does.
export function instancePayloads(registry: Registry, instance: ItemInstance): ScaledPayload[] {
  return allocatedPositions(registry, instance.plane).flatMap(({ hex, position }) => positionPayloads(registry, instance.plane, hex, position));
}

// c15's two refusals, both of them here so the verb below and any later one
// share them. The duplicate is refused because a cluster's `effects` is a set
// in the shape a save round-trips: `isPlane` rejects a repeat, so recording
// one would mint a plane the player could not reload.
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

// c15: an effect is used on a cluster already standing in a plane, never on a
// jewel in inventory, so it goes through the one door every other verb takes
// and the item is consumed only once the plane has taken it.
export function applyClusterEffect(state: GameState, registry: Registry, target: string, effectItem: string, hex: Hex): Growth {
  if (registry.items.get(effectItem)?.clusterEffect === undefined) return { ok: false, refused: says('engine.cluster.not-an-effect', { item: anId(effectItem) }) };
  return growItem(state, registry, {
    target,
    consumes: effectItem,
    change: (payload) => recordEffect(registry, payload.plane, hex, effectItem),
  });
}
