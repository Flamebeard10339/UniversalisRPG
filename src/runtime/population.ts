import { Location, populationCount } from '../content/sections/location';
import { Registry } from '../content/registry';
import { templateOf } from './state';
import { evaluateCondition } from './conditions';
import { Localized, localizerOf } from './localized';
import { type Deficit, GameState } from './state';
import { secondsToMs } from './units';

const isDeficit = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const held = value as { down?: unknown; due?: unknown };
  return typeof held.down === 'number' && Number.isInteger(held.down) && held.down >= 0 && Array.isArray(held.due) && held.due.every((at) => Number.isInteger(at)) && held.due.length <= held.down;
};

export function isPopulations(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((byEntity) => typeof byEntity === 'object' && byEntity !== null && !Array.isArray(byEntity) && Object.values(byEntity).every(isDeficit));
}

const deficitOf = (state: GameState, locationId: string, entityId: string): Deficit | undefined => state.populations[locationId]?.[entityId];

export function standing(state: GameState, registry: Registry, location: Location): { entity: string; count: number }[] {
  return location.entities
    .filter((entry) => {
      const gate = registry.entities.get(entry.entity)?.hiddenIf;
      return !gate || !evaluateCondition(gate, state);
    })
    .map((entry) => ({ entity: entry.entity, count: populationCount(entry) - (deficitOf(state, location.id, entry.entity)?.down ?? 0) }))
    .filter((entry) => entry.count > 0);
}

export function isStanding(state: GameState, registry: Registry, location: Location, entityId: string): boolean {
  return standing(state, registry, location).some((entry) => entry.entity === templateOf(entityId));
}

export function downOne(state: GameState, registry: Registry, locationId: string, entityId: string): void {
  if (!registry.locations.get(locationId)?.entities.some((entry) => entry.entity === entityId)) return;
  const byEntity = (state.populations[locationId] ??= {});
  const deficit = (byEntity[entityId] ??= { down: 0, due: [] });
  deficit.down += 1;
  const after = registry.entities.get(entityId)?.respawnAfter;
  if (after !== undefined) deficit.due.push(state.time + secondsToMs(after));
}

export function nextRespawn(state: GameState): number | undefined {
  let soonest: number | undefined;
  for (const byEntity of Object.values(state.populations)) {
    for (const deficit of Object.values(byEntity)) {
      for (const at of deficit.due) if (soonest === undefined || at < soonest) soonest = at;
    }
  }
  return soonest;
}

export function applyRespawns(state: GameState): boolean {
  let changed = false;
  for (const [locationId, byEntity] of Object.entries(state.populations)) {
    for (const [entityId, deficit] of Object.entries(byEntity)) {
      const due = deficit.due.filter((at) => at > state.time);
      if (due.length !== deficit.due.length) {
        deficit.down -= deficit.due.length - due.length;
        deficit.due = due;
        changed = true;
      }
      if (deficit.down <= 0) delete byEntity[entityId];
    }
    if (Object.keys(byEntity).length === 0) delete state.populations[locationId];
  }
  return changed;
}

export function prunePopulations(state: GameState, registry: Registry): { path: string; id: string; message: Localized }[] {
  const warnings: { path: string; id: string; message: Localized }[] = [];
  const localizer = localizerOf(registry, state);
  const named = localizer.identifier;
  for (const [locationId, byEntity] of Object.entries(state.populations)) {
    for (const entityId of Object.keys(byEntity)) {
      const params = { entity: named(entityId), location: named(locationId) };
      const message = !registry.locations.has(locationId)
        ? localizer.engine('engine.prune.population.location', params)
        : !registry.entities.has(entityId)
          ? localizer.engine('engine.prune.population.entity', params)
          : undefined;
      if (!message) continue;
      delete byEntity[entityId];
      warnings.push({ path: `populations.${locationId}.${entityId}`, id: entityId, message });
    }
    if (Object.keys(byEntity).length === 0) delete state.populations[locationId];
  }
  return warnings;
}
