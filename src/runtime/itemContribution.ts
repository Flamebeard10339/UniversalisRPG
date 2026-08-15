import { Item } from '../content/item';
import { Registry } from '../content/registry';
import { addRanges, point, Range, scaleRange } from '../grammar/range';
import { BonusAmount, Counter } from '../grammar/tagClause';
import { allocatedPositions, instancePayloads } from './clusterEffect';
import { basePlane, Plane } from './clusterPlane';
import { ItemInstance } from './itemInstance';
import type { Answer } from './localized';

// The one multiplication of a BonusAmount there is. A surface that shows what a
// payload is worth calls this rather than scaling for itself, so the number on
// screen and the number a fold takes cannot be two different answers.
export function scaledAmount(bonus: BonusAmount, times: number): BonusAmount {
  return bonus.percent ? { percent: true, amount: bonus.amount * times } : { percent: false, amount: scaleRange(bonus.amount, times) };
}

// Which plane a carried copy stands on: the one it grew, or the default its
// base declares for a copy still in its stack. One answer, so a reader of what
// a copy carries never has to know which of the two it was handed.
export function carriedPlane(item: Item, instance?: ItemInstance): Plane | undefined {
  return instance?.plane ?? basePlane(item);
}

// The passives a carried copy's spent points stand on, which is what makes an
// allocated one answer a moment for whoever wears the copy.
export function carriedPassives(registry: Registry, item: Item, instance?: ItemInstance): string[] {
  const plane = carriedPlane(item, instance);
  return plane === undefined ? [] : allocatedPositions(registry, plane).map((each) => each.passiveId);
}

// How many of a counter a `per` bonus reads. It is a live fact about a
// character and an item is not one, so whoever knows the character supplies it;
// nobody is the same answer as an empty counter, which is nothing at all.
export type CounterLevel = (counter: Counter) => number;

// What one item is worth on one stat, effective rather than declared. The two
// channels are the two a bonus can land in and are never mixed: `increased` is
// in percent points, the units the bonus was authored in, so a reader states it
// without dividing and the actor fold divides once.
export interface StatContribution {
  readonly statId: Answer;
  readonly added: Range;
  readonly increased: number;
}

interface Channels {
  added: Range;
  increased: number;
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// The whole of what carrying one item is worth, per stat, assembled here and
// nowhere else (c8): its own tags and every allocated payload of the plane it
// carries, each scaled by what its cluster made it worth. A stack copy has no
// instance and stands on the item's default plane, which is this same fold with
// a degenerate argument rather than a second path that could answer differently.
export function itemContribution(registry: Registry, item: Item, instance?: ItemInstance, counter: CounterLevel = () => 0): StatContribution[] {
  const byStat = new Map<string, Channels>();
  const fold = (statId: string, bonus: BonusAmount, times: number): void => {
    const channels = byStat.get(statId) ?? { added: point(0), increased: 0 };
    const scaled = scaledAmount(bonus, times);
    if (scaled.percent) channels.increased += scaled.amount;
    else channels.added = addRanges(channels.added, scaled.amount);
    byStat.set(statId, channels);
  };

  for (const tag of item.tags) if (tag.kind === 'stat-bonus') fold(tag.statId, tag, tag.per === undefined ? 1 : counter(tag.per));

  // A plane payload reads its counter exactly as the item's own tags do, and
  // multiplies what its cluster made it worth: the two factors are independent,
  // because one is a fact about the item and the other about the character.
  const plane = carriedPlane(item, instance);
  if (plane) {
    for (const payload of instancePayloads(registry, { experience: instance?.experience ?? 0, plane })) {
      fold(payload.statId, payload.bonus, payload.scale * (payload.per === undefined ? 1 : counter(payload.per)));
    }
  }

  return [...byStat.entries()].sort(([a], [b]) => byName(a, b)).map(([statId, channels]) => ({ statId, ...channels }));
}
