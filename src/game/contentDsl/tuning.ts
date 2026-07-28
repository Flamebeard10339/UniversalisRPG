import type { Registry } from './registry';
import { RuntimeError } from './state';
import { Variable } from './variable';

// Authored numeric constants (`# variable`) the engine reads as tuning dials.
// Content that omits one falls back to the default here, so a bare module still
// paces travel, damage and contested rolls sensibly.

// Seconds of travel per unit of straight-line coordinate distance. A travel
// edge's journey lasts distance × this factor (see travelAction).
const TRAVEL_SECONDS_PER_UNIT = 'travel-seconds-per-unit';
const DEFAULT_TRAVEL_SECONDS_PER_UNIT = 5;

export function travelSecondsPerUnit(registry: Registry): number {
  return registry.variables.get(TRAVEL_SECONDS_PER_UNIT)?.value ?? DEFAULT_TRAVEL_SECONDS_PER_UNIT;
}

// The least damage a landed hit can deal, however much damage reduction the
// target has (see hitDamage). Held at 1 or above because a floor of 0 makes a
// fight unwinnable and unendable.
const MIN_DAMAGE = 'min-damage';
const DEFAULT_MIN_DAMAGE = 1;

export function minDamage(registry: Registry): number {
  return Math.max(1, registry.variables.get(MIN_DAMAGE)?.value ?? DEFAULT_MIN_DAMAGE);
}

// The stat gap that buys roughly a 91% chance in hitChance's opposed roll, and
// so the dial for how sharply skill converts to success: smaller makes a small
// edge decisive, larger flattens the curve.
const CONTEST_SPREAD = 'contest-spread';
const DEFAULT_CONTEST_SPREAD = 100;

export function contestSpread(registry: Registry): number {
  return registry.variables.get(CONTEST_SPREAD)?.value ?? DEFAULT_CONTEST_SPREAD;
}

// An absent value means "leave it at the engine default" (the DSL's
// empty==absent rule), so only an authored one is worth rejecting.
export function validateTuning(variables: ReadonlyMap<string, Variable>): void {
  const spread = variables.get(CONTEST_SPREAD)?.value;
  if (spread !== undefined && spread <= 0) {
    throw new RuntimeError(`# variable ${CONTEST_SPREAD} must be positive, got ${spread} — it divides the stat gap in every opposed roll`);
  }
}
