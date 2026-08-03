import type { Registry } from '../content/registry';
import { CONTEST_SPREAD, DEFAULT_ACTION_DURATION, MIN_DAMAGE, TRAVEL_SECONDS_PER_UNIT } from '../content/tuningVariables';

const DEFAULT_TRAVEL_SECONDS_PER_UNIT = 5;

export function travelSecondsPerUnit(registry: Registry): number {
  return registry.variables.get(TRAVEL_SECONDS_PER_UNIT)?.value ?? DEFAULT_TRAVEL_SECONDS_PER_UNIT;
}

const DEFAULT_MIN_DAMAGE = 1;

// Clamped above zero because a fight whose hits are fully absorbed never
// depletes its target and never ends.
export function minDamage(registry: Registry): number {
  return Math.max(1, registry.variables.get(MIN_DAMAGE)?.value ?? DEFAULT_MIN_DAMAGE);
}

const DEFAULT_CONTEST_SPREAD = 100;

export function contestSpread(registry: Registry): number {
  return registry.variables.get(CONTEST_SPREAD)?.value ?? DEFAULT_CONTEST_SPREAD;
}

// Seconds a duration action takes when it names no cadence of its own. Zero is
// what the engine shipped for years as "absent time: means instant"; the kind
// carries that meaning now, so this is free to be raised by content.
const DEFAULT_DEFAULT_ACTION_DURATION = 0;

export function defaultActionDuration(registry: Registry): number {
  return registry.variables.get(DEFAULT_ACTION_DURATION)?.value ?? DEFAULT_DEFAULT_ACTION_DURATION;
}
