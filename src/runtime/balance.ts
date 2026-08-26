import { isTwoSided, type Action } from '../grammar/action';
import { startingLocationId, type Registry } from '../content/registry';

// How far each location stands from where a game begins, in roads walked. A road held shut by a
// condition is still a road: a gate is a beat in the story rather than a distance, and treating one
// as a wall would leave everything behind the first locked door unmeasured. A location no road
// reaches is absent, which is a finding of its own.
export function roadDepths(registry: Registry): ReadonlyMap<string, number> {
  const start = startingLocationId(registry);
  const depths = new Map<string, number>();
  if (start === undefined) return depths;
  depths.set(start, 0);
  for (let frontier = [start]; frontier.length > 0; ) {
    const next: string[] = [];
    for (const at of frontier) {
      for (const edge of registry.roads.get(at) ?? []) {
        if (depths.has(edge.target)) continue;
        depths.set(edge.target, depths.get(at)! + 1);
        next.push(edge.target);
      }
    }
    frontier = next;
  }
  return depths;
}

export interface Placement {
  at: string;
  depth: number;
}

// Where each entity first stands. An entity brought along as an ally arrives wherever whoever
// brings it stands, so a foe that appears in no location's own list is placed by the one that
// summons it — which is why this settles rather than reading the lists once.
export function placements(registry: Registry): ReadonlyMap<string, Placement> {
  const depths = roadDepths(registry);
  const found = new Map<string, Placement>();
  const stand = (entityId: string, at: string): boolean => {
    const depth = depths.get(at);
    if (depth === undefined || (found.get(entityId)?.depth ?? Infinity) <= depth) return false;
    found.set(entityId, { at, depth });
    return true;
  };
  for (const location of registry.locations.values()) {
    for (const population of location.entities) stand(population.entity, location.id);
  }
  for (let moved = true; moved; ) {
    moved = false;
    for (const [entityId, placement] of [...found]) {
      for (const ally of registry.entities.get(entityId)?.allies ?? []) moved = stand(ally.entity, placement.at) || moved;
    }
  }
  return found;
}

// An action that takes something out of somebody: it says what the blow rolls against and which
// pool the blow comes out of. Anything else an entity can do is not a way it fights.
const swings = (action: Action): boolean => action.damage !== undefined && action.depletes !== undefined && isTwoSided(action);

export const attackActions = (actions: readonly Action[]): readonly Action[] => actions.filter(swings);

export interface Encounter extends Placement {
  entity: string;
}

// Every fight the world picks rather than the player: an entity that comes unbidden, stands
// somewhere a road reaches, and brings something to swing. Nothing is listed here, so a foe added
// next month is found by having been placed. A statted entity a player may choose to attack is
// not an encounter — walking up to a knight is the player's idea, and no progression rests on it.
export function encounters(registry: Registry): readonly Encounter[] {
  const where = placements(registry);
  const found: Encounter[] = [];
  for (const entity of registry.entities.values()) {
    const placement = where.get(entity.id);
    if (!entity.aggressive || placement === undefined || attackActions(entity.actions).length === 0) continue;
    found.push({ entity: entity.id, ...placement });
  }
  return found.sort((one, other) => one.depth - other.depth || one.entity.localeCompare(other.entity));
}
