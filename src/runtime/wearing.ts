import { Entity } from '../content/sections/entity';
import { Guise, stoodAs } from '../content/sections/guise';
import { populationCount } from '../content/sections/location';
import { Registry } from '../content/registry';
import { type Deficit, GameState, templateOf } from './state';

export interface Stands {
  entity: string;
  count?: number;
}

export const deficitOf = (state: GameState, locationId: string, entityId: string): Deficit | undefined => state.populations[locationId]?.[entityId];

export const stoodCount = (entry: Stands, deficit: Deficit | undefined): number => populationCount(entry) - (deficit?.down ?? 0);

export function wornWhere(state: GameState, locationId: string, entry: Stands): string | undefined {
  const deficit = deficitOf(state, locationId, entry.entity);
  const count = stoodCount(entry, deficit);
  return deficit?.wearing !== undefined && count > 0 && (deficit.until?.length ?? 0) >= count ? deficit.wearing : undefined;
}

export const wornBy = (state: GameState, registry: Registry, locationId: string, entityId: string): string | undefined => {
  const template = templateOf(entityId);
  const entry = registry.locations.get(locationId)?.entities.find((each) => each.entity === template);
  return entry === undefined ? undefined : wornWhere(state, locationId, entry);
};

export const wearing = (registry: Registry, entity: Entity, guiseId: string | undefined): Entity =>
  guiseId === undefined ? entity : stoodAs(entity, registry.guises.get(guiseId), registry.namespace.ownerOf('guise', guiseId) ?? null);

export function guiseWorn(state: GameState, registry: Registry, locationId: string, entityId: string): Guise | undefined {
  const worn = wornBy(state, registry, locationId, entityId);
  return worn === undefined ? undefined : registry.guises.get(worn);
}

export function entityAsStood(state: GameState, registry: Registry, entityId: string): Entity | undefined {
  const declared = registry.entities.get(templateOf(entityId));
  if (declared === undefined) return undefined;
  return wearing(registry, declared, wornBy(state, registry, state.location, entityId));
}
