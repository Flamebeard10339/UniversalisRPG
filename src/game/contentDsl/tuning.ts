import type { Registry } from './registry';
import { RuntimeError } from './state';
import { Variable } from './variable';

const TRAVEL_SECONDS_PER_UNIT = 'travel-seconds-per-unit';
const DEFAULT_TRAVEL_SECONDS_PER_UNIT = 5;

export function travelSecondsPerUnit(registry: Registry): number {
  return registry.variables.get(TRAVEL_SECONDS_PER_UNIT)?.value ?? DEFAULT_TRAVEL_SECONDS_PER_UNIT;
}

const MIN_DAMAGE = 'min-damage';
const DEFAULT_MIN_DAMAGE = 1;

// Clamped above zero because a fight that deals no damage never depletes its
// target and never ends.
export function minDamage(registry: Registry): number {
  return Math.max(1, registry.variables.get(MIN_DAMAGE)?.value ?? DEFAULT_MIN_DAMAGE);
}

const CONTEST_SPREAD = 'contest-spread';
const DEFAULT_CONTEST_SPREAD = 100;

export function contestSpread(registry: Registry): number {
  return registry.variables.get(CONTEST_SPREAD)?.value ?? DEFAULT_CONTEST_SPREAD;
}

export function validateTuning(variables: ReadonlyMap<string, Variable>): void {
  const spread = variables.get(CONTEST_SPREAD)?.value;
  if (spread !== undefined && spread <= 0) {
    throw new RuntimeError(`# variable ${CONTEST_SPREAD} must be positive, got ${spread} — it divides the stat gap in every opposed roll`);
  }
}
