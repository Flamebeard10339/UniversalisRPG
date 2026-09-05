import type { Registry } from '../content/registry';
import type { Conversion } from '../content/sections/stat';

interface Converter extends Conversion {
  stat: string;
}

interface DamageModel {
  dealt: ReadonlyMap<string, readonly string[]>;
  resisted: ReadonlyMap<string, readonly string[]>;
  converters: readonly Converter[];
  order: readonly string[];
}

const models = new WeakMap<Registry, DamageModel>();

const byType = (into: Map<string, string[]>, type: string, statId: string): void => {
  into.set(type, [...(into.get(type) ?? []), statId]);
};

function ordered(types: ReadonlySet<string>, converters: readonly Converter[]): string[] {
  const waiting = new Map([...types].map((type) => [type, 0]));
  for (const each of converters) waiting.set(each.to, (waiting.get(each.to) ?? 0) + 1);
  const ready = [...waiting].filter(([, count]) => count === 0).map(([type]) => type);
  const order: string[] = [];
  while (ready.length > 0) {
    const type = ready.shift()!;
    order.push(type);
    for (const each of converters) {
      if (each.from !== type) continue;
      const left = waiting.get(each.to)! - 1;
      waiting.set(each.to, left);
      if (left === 0) ready.push(each.to);
    }
  }
  return order;
}

function modelOf(registry: Registry): DamageModel {
  const held = models.get(registry);
  if (held) return held;
  const dealt = new Map<string, string[]>();
  const resisted = new Map<string, string[]>();
  const converters: Converter[] = [];
  const types = new Set<string>();
  for (const stat of registry.stats.values()) {
    if (stat.deals !== undefined) {
      byType(dealt, stat.deals, stat.id);
      types.add(stat.deals);
    }
    if (stat.resists !== undefined) {
      byType(resisted, stat.resists, stat.id);
      types.add(stat.resists);
    }
    if (stat.converts !== undefined) {
      converters.push({ ...stat.converts, stat: stat.id });
      types.add(stat.converts.from);
      types.add(stat.converts.to);
    }
  }
  const model: DamageModel = { dealt, resisted, converters, order: ordered(types, converters) };
  models.set(registry, model);
  return model;
}

export interface DamageReading {
  dealt(statId: string): number;
  scale(statId: string): number;
  resists(statId: string): number;
}

export const resistanceTo = (registry: Registry, type: string | undefined, read: (statId: string) => number): number =>
  type === undefined ? 0 : (modelOf(registry).resisted.get(type) ?? []).reduce((sum, statId) => sum + read(statId), 0);

export function typedShare(registry: Registry, read: DamageReading): number {
  const model = modelOf(registry);
  if (model.dealt.size === 0) return 0;

  const amounts = new Map<string, number>();
  for (const [type, stats] of model.dealt) {
    amounts.set(type, stats.reduce((sum, statId) => sum + read.dealt(statId), 0));
  }

  for (const type of model.order) {
    const held = amounts.get(type) ?? 0;
    if (held <= 0) continue;
    const outgoing = model.converters.filter((each) => each.from === type).map((each) => ({ to: each.to, percent: Math.max(0, read.scale(each.stat)) }));
    const asked = outgoing.reduce((sum, each) => sum + each.percent, 0);
    if (asked <= 0) continue;
    const share = asked > 100 ? 100 / asked : 1;
    let moved = 0;
    for (const each of outgoing) {
      const part = (held * each.percent * share) / 100;
      amounts.set(each.to, (amounts.get(each.to) ?? 0) + part);
      moved += part;
    }
    amounts.set(type, held - moved);
  }

  let total = 0;
  for (const [type, amount] of amounts) {
    if (amount <= 0) continue;
    const resistance = resistanceTo(registry, type, read.resists);
    total += Math.max(0, amount * (1 - resistance / 100));
  }
  return total;
}
