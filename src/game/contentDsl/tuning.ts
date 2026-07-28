import type { Registry } from './registry';
import { CONTEST_SPREAD, MIN_DAMAGE, TRAVEL_SECONDS_PER_UNIT } from './tuningVariables';

const DEFAULT_TRAVEL_SECONDS_PER_UNIT = 5;

export function travelSecondsPerUnit(registry: Registry): number {
  return registry.variables.get(TRAVEL_SECONDS_PER_UNIT)?.value ?? DEFAULT_TRAVEL_SECONDS_PER_UNIT;
}

const DEFAULT_MIN_DAMAGE = 1;

// Clamped above zero because a fight that deals no damage never depletes its
// target and never ends.
export function minDamage(registry: Registry): number {
  return Math.max(1, registry.variables.get(MIN_DAMAGE)?.value ?? DEFAULT_MIN_DAMAGE);
}

const DEFAULT_CONTEST_SPREAD = 100;

export function contestSpread(registry: Registry): number {
  return registry.variables.get(CONTEST_SPREAD)?.value ?? DEFAULT_CONTEST_SPREAD;
}
