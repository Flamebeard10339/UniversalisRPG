import { Item } from '../content/sections/item';
import { Registry } from '../content/registry';
import { addRanges, point, Range, scaleRange } from '../grammar/range';
import { BonusAmount, Counter } from '../grammar/tagClause';
import { allocatedPositions, instancePayloads } from './clusterEffect';
import { ItemInstance } from './itemInstance';
import type { Answer } from './localized';

export function scaledAmount(bonus: BonusAmount, times: number): BonusAmount {
  return bonus.percent ? { percent: true, amount: bonus.amount * times } : { percent: false, amount: scaleRange(bonus.amount, times) };
}

export function carriedPassives(registry: Registry, instance?: ItemInstance): string[] {
  return instance === undefined ? [] : allocatedPositions(registry, instance.plane).map((each) => each.passiveId);
}

export type CounterLevel = (counter: Counter) => number;

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

  if (instance) {
    for (const payload of instancePayloads(registry, instance)) {
      fold(payload.statId, payload.bonus, payload.scale * (payload.per === undefined ? 1 : counter(payload.per)));
    }
  }

  return [...byStat.entries()].sort(([a], [b]) => byName(a, b)).map(([statId, channels]) => ({ statId, ...channels }));
}
