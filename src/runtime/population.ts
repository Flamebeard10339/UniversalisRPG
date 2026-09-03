import { entitiesStood, Location } from '../content/sections/location';
import { Guise, offeredAs } from '../content/sections/guise';
import { Action, Entity } from '../content/sections/entity';
import { Registry } from '../content/registry';
import { templateOf } from './state';
import { evaluateCondition } from './conditions';
import { Localized, localizerOf } from './localized';
import { GameState } from './state';
import { secondsToMs } from './units';
import { deficitOf, stoodCount, wearing, wornWhere } from './wearing';

const isMoments = (value: unknown): boolean => Array.isArray(value) && value.every((at) => Number.isInteger(at));

const isDeficit = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const held = value as { down?: unknown; due?: unknown; wearing?: unknown; until?: unknown };
  if (held.wearing !== undefined && typeof held.wearing !== 'string') return false;
  if (held.until !== undefined && !isMoments(held.until)) return false;
  return typeof held.down === 'number' && Number.isInteger(held.down) && held.down >= 0 && isMoments(held.due) && (held.due as number[]).length <= held.down;
};

export function isPopulations(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((byEntity) => typeof byEntity === 'object' && byEntity !== null && !Array.isArray(byEntity) && Object.values(byEntity).every(isDeficit));
}

export interface Stood {
  entity: string;
  count: number;
  guise?: string;
}

export function standing(state: GameState, registry: Registry, location: Location): Stood[] {
  return location.entities
    .filter((entry) => {
      const gate = registry.entities.get(entry.entity)?.hiddenIf;
      return !gate || !evaluateCondition(gate, state, registry);
    })
    .flatMap((entry) => {
      const count = stoodCount(entry, deficitOf(state, location.id, entry.entity));
      if (count <= 0) return [];
      const worn = wornWhere(state, location.id, entry);
      return [worn === undefined ? { entity: entry.entity, count } : { entity: entry.entity, count, guise: worn }];
    });
}

export interface StoodHere {
  id: string;
  entity: Entity;
  guise?: Guise;
  offers: { actions: Action[] };
}

export function stoodHere(state: GameState, registry: Registry, location: Location): StoodHere[] {
  return standing(state, registry, location).flatMap((entry) => {
    const declared = registry.entities.get(entry.entity);
    if (!declared) return [];
    const worn = entry.guise === undefined ? undefined : registry.guises.get(entry.guise);
    const entity = wearing(registry, declared, entry.guise);
    return [{ id: entry.entity, entity, ...(worn === undefined ? {} : { guise: worn }), offers: { actions: offeredAs(entity, worn) } }];
  });
}

export function isStanding(state: GameState, registry: Registry, location: Location, entityId: string): boolean {
  return standing(state, registry, location).some((entry) => entry.entity === templateOf(entityId));
}

export function isElsewhere(state: GameState, registry: Registry, location: Location, entityId: string): boolean {
  return entitiesStood(registry.locations).has(templateOf(entityId)) && !isStanding(state, registry, location, entityId);
}

export function downOne(state: GameState, registry: Registry, locationId: string, entityId: string): void {
  if (!registry.locations.get(locationId)?.entities.some((entry) => entry.entity === entityId)) return;
  const byEntity = (state.populations[locationId] ??= {});
  const deficit = (byEntity[entityId] ??= { down: 0, due: [] });
  deficit.down += 1;
  const after = registry.entities.get(entityId)?.respawnAfter;
  if (after !== undefined) deficit.due.push(state.time + secondsToMs(after));
}

export function wearFor(state: GameState, registry: Registry, locationId: string, entityId: string, guiseId: string, seconds: number): boolean {
  const entry = registry.locations.get(locationId)?.entities.find((each) => each.entity === entityId);
  if (entry === undefined) return false;
  const byEntity = (state.populations[locationId] ??= {});
  const deficit = (byEntity[entityId] ??= { down: 0, due: [] });
  if (deficit.wearing !== undefined && deficit.wearing !== guiseId) return false;
  if ((deficit.until?.length ?? 0) >= stoodCount(entry, deficit)) return false;
  deficit.wearing = guiseId;
  (deficit.until ??= []).push(state.time + secondsToMs(Math.max(0, seconds)));
  return true;
}

export function nextRespawn(state: GameState): number | undefined {
  let soonest: number | undefined;
  for (const byEntity of Object.values(state.populations)) {
    for (const deficit of Object.values(byEntity)) {
      for (const at of [...deficit.due, ...(deficit.until ?? [])]) if (soonest === undefined || at < soonest) soonest = at;
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
      if (deficit.until !== undefined) {
        const until = deficit.until.filter((at) => at > state.time);
        if (until.length !== deficit.until.length) changed = true;
        if (until.length === 0) {
          delete deficit.until;
          delete deficit.wearing;
        } else deficit.until = until;
      }
      if (deficit.down <= 0 && deficit.until === undefined) delete byEntity[entityId];
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
    for (const [entityId, deficit] of Object.entries(byEntity)) {
      const params = { entity: named(entityId), location: named(locationId) };
      const message = !registry.locations.has(locationId)
        ? localizer.engine('engine.prune.population.location', params)
        : !registry.entities.has(entityId)
          ? localizer.engine('engine.prune.population.entity', params)
          : undefined;
      if (message) {
        delete byEntity[entityId];
        warnings.push({ path: `populations.${locationId}.${entityId}`, id: entityId, message });
        continue;
      }
      const worn = deficit.wearing;
      if (worn === undefined || registry.guises.has(worn)) continue;
      delete deficit.wearing;
      delete deficit.until;
      if (deficit.down <= 0) delete byEntity[entityId];
      warnings.push({
        path: `populations.${locationId}.${entityId}.wearing`,
        id: worn,
        message: localizer.engine('engine.prune.population.guise', { guise: named(worn), entity: named(entityId), location: named(locationId) }),
      });
    }
    if (Object.keys(byEntity).length === 0) delete state.populations[locationId];
  }
  return warnings;
}
