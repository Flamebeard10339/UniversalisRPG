import type { Registry } from '../content/registry';
import { typedShare, type DamageReading } from './damageModel';
import { sampleStat, statValue } from './stats';
import type { GameState } from './state';
import { toMilliUnits } from './units';

export { typedShare, type DamageReading } from './damageModel';

export const rolledDamage = (state: GameState, registry: Registry, self: string, other: string): DamageReading => ({
  dealt: (statId) => sampleStat(statId, state, registry, self),
  scale: (statId) => statValue(statId, state, registry, self),
  resists: (statId) => statValue(statId, state, registry, other),
});

export const standingDamage = (state: GameState, registry: Registry, self: string, other: string): DamageReading => ({
  dealt: (statId) => statValue(statId, state, registry, self),
  scale: (statId) => statValue(statId, state, registry, self),
  resists: (statId) => statValue(statId, state, registry, other),
});

export function typedDamage(state: GameState, registry: Registry, self: string, other: string): number {
  return toMilliUnits(typedShare(registry, rolledDamage(state, registry, self, other)));
}
