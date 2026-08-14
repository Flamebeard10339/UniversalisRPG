import { Item } from '../content/item';
import { Registry } from '../content/registry';
import { addRanges, point, Range, scaleRange } from '../grammar/range';
import { BonusAmount } from '../grammar/tagClause';
import { instancePayloads } from './clusterEffect';
import { basePlane } from './clusterPlane';
import { ItemInstance } from './itemInstance';

// The one multiplication of a BonusAmount there is. A surface that shows what a
// payload is worth calls this rather than scaling for itself, so the number on
// screen and the number a fold takes cannot be two different answers.
export function scaledAmount(bonus: BonusAmount, times: number): BonusAmount {
  return bonus.percent ? { percent: true, amount: bonus.amount * times } : { percent: false, amount: scaleRange(bonus.amount, times) };
}

// How many of a counter a `per` bonus reads. It is a live fact about a
// character and an item is not one, so whoever knows the character supplies it;
// nobody is the same answer as an empty counter, which is nothing at all.
export type CounterLevel = (resourceId: string) => number;

// What one item is worth on one stat, effective rather than declared. The two
// channels are the two a bonus can land in and are never mixed: `increased` is
// in percent points, the units the bonus was authored in, so a reader states it
// without dividing and the actor fold divides once.
export interface StatContribution {
  readonly statId: string;
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

  const plane = instance?.plane ?? basePlane(item);
  if (plane) for (const payload of instancePayloads(registry, { experience: instance?.experience ?? 0, plane })) fold(payload.statId, payload.bonus, payload.scale);

  return [...byStat.entries()].sort(([a], [b]) => byName(a, b)).map(([statId, channels]) => ({ statId, ...channels }));
}
