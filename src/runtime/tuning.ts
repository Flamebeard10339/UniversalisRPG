import type { Registry } from '../content/registry';
import { CONTEST_SPREAD, DEFAULT_ACTION_DURATION, INVENTORY_SLOTS, MIN_DAMAGE, TRAVEL_SECONDS } from '../content/tuningVariables';

const DEFAULT_TRAVEL_SECONDS = 3;

// What walking one road costs, wherever it runs to. Nothing here reads a map: two places a world
// draws far apart are as far apart as the author wanted them to look, and charging the player for
// the drawing made the world worse to walk the more of it there was.
export function travelSeconds(registry: Registry): number {
  return Math.max(0, registry.variables.get(TRAVEL_SECONDS)?.value ?? DEFAULT_TRAVEL_SECONDS);
}

const DEFAULT_MIN_DAMAGE = 1;

export function minDamage(registry: Registry): number {
  return Math.max(1, registry.variables.get(MIN_DAMAGE)?.value ?? DEFAULT_MIN_DAMAGE);
}

const DEFAULT_CONTEST_SPREAD = 100;

export function contestSpread(registry: Registry): number {
  return registry.variables.get(CONTEST_SPREAD)?.value ?? DEFAULT_CONTEST_SPREAD;
}

const DEFAULT_ACTION_SECONDS = 0;

export function defaultActionDuration(registry: Registry): number {
  return registry.variables.get(DEFAULT_ACTION_DURATION)?.value ?? DEFAULT_ACTION_SECONDS;
}

// How many things the player's pack holds. Nothing here names a number: a world that declares no
// limit has none, and one that writes zero has said the same thing, so the count the shipped world
// plays at is `content/core.dsl`'s to say and nobody else's.
export function inventorySlots(registry: Registry): number {
  return Math.max(0, registry.variables.get(INVENTORY_SLOTS)?.value ?? 0);
}
