import { Location, populationCount } from '../content/location';
import { Registry } from '../content/registry';
import { templateOf } from './encounter';
import { evaluateCondition } from './conditions';
import { Localized, localizerOf } from './localized';
import { GameState } from './state';
import { secondsToMs } from './units';

// How many of a type are down at a place, and when each of those is due back.
// A copy with no `respawn after:` is down and never due, which is why the two
// numbers are kept apart rather than encoded into one list of instants.
export interface Deficit {
  down: number;
  due: number[];
}

// State about the LOCATION, because how many of its five rats are standing is
// the place's fact. It is not an entry in the instance table: no copy is
// addressable, so there is nothing to keep a record of.
export type Populations = Record<string, Record<string, Deficit>>;

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

// One entry per type that still has a copy standing, with the count it is down
// to. Absent from the deficit is the whole population standing.
export function standing(state: GameState, registry: Registry, location: Location): { entity: string; count: number }[] {
  return location.entities
    .filter((entry) => {
      // `hidden if:` on an entity means it is not present, which is a different
      // sentence from an action of its own being hidden.
      const gate = registry.entities.get(entry.entity)?.hiddenIf;
      return !gate || !evaluateCondition(gate, state);
    })
    .map((entry) => ({ entity: entry.entity, count: populationCount(entry) - (deficitOf(state, location.id, entry.entity)?.down ?? 0) }))
    .filter((entry) => entry.count > 0);
}

export function isStanding(state: GameState, registry: Registry, location: Location, entityId: string): boolean {
  return standing(state, registry, location).some((entry) => entry.entity === templateOf(entityId));
}

// A copy has left the world. It is due back after the entity's `respawn after:`,
// and absent means never — so a boss omits it and zero is not a magic value.
export function downOne(state: GameState, registry: Registry, locationId: string, entityId: string): void {
  // A deficit is a fact about a place holding that population. A fight-scoped
  // copy, or one fought somewhere it does not stand, has no place to be down at.
  if (!registry.locations.get(locationId)?.entities.some((entry) => entry.entity === entityId)) return;
  const byEntity = (state.populations[locationId] ??= {});
  const deficit = (byEntity[entityId] ??= { down: 0, due: [] });
  deficit.down += 1;
  const after = registry.entities.get(entityId)?.respawnAfter;
  if (after !== undefined) deficit.due.push(state.time + secondsToMs(after));
}

// The next instant a copy is due back, so a respawn lands on its own boundary
// rather than whenever a segment happens to end.
export function nextRespawn(state: GameState): number | undefined {
  let soonest: number | undefined;
  for (const byEntity of Object.values(state.populations)) {
    for (const deficit of Object.values(byEntity)) {
      for (const at of deficit.due) if (soonest === undefined || at < soonest) soonest = at;
    }
  }
  return soonest;
}

// Draws no randomness: a due time was fixed when the copy went down, so a
// session that waits through a respawn rolls the same numbers as one that does
// not.
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

// Pruned when the entity or the location leaves the registry, which is what
// keeps a deficit from outliving the place it is a fact about.
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
