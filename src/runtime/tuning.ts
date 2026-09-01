import type { Registry } from '../content/registry';
import { CONTEST_SPREAD, DEFAULT_ACTION_DURATION, ENGAGEMENT_SECONDS, INVENTORY_SLOTS, MAP_GRID, MIN_DAMAGE, TRAVEL_SECONDS } from '../content/tuningVariables';
import { secondsToMs } from './units';

const DEFAULT_TRAVEL_SECONDS = 3;

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

export function inventorySlots(registry: Registry): number {
  return Math.max(0, registry.variables.get(INVENTORY_SLOTS)?.value ?? 0);
}

export function engagementDelay(registry: Registry): number {
  return Math.max(0, secondsToMs(registry.variables.get(ENGAGEMENT_SECONDS)?.value ?? 0));
}

const DEFAULT_MAP_GRID = 140;

export function mapGrid(registry: Registry): number {
  return Math.max(1, registry.variables.get(MAP_GRID)?.value ?? DEFAULT_MAP_GRID);
}
