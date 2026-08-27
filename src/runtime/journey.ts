import { DISCOVERED } from '../content/sections/location';
import type { Edge } from '../content/sections/location';
import { startingLocationId, type Registry } from '../content/registry';
import { evaluateCondition, truthy } from './conditions';
import type { GameState } from './state';

const discovered = (state: GameState, id: string): boolean => truthy(state.flags[`${id}.${DISCOVERED}`]);

// What a location is adjacent to in play: its authored edges, plus the derived return edge
// for any road the far end does not answer with an edge of its own. The one place that reads it.
export function effectiveAdjacent(registry: Registry, from: string): readonly Edge[] {
  return registry.roads.get(from) ?? [];
}

export function roadsFrom(from: string, registry: Registry, state: GameState): string[] {
  return effectiveAdjacent(registry, from)
    .filter((edge) => !edge.condition || evaluateCondition(edge.condition, state, registry))
    .map((edge) => edge.target);
}

export function routeTo(from: string, to: string, registry: Registry, state: GameState): string[] | null {
  if (from === to || !registry.locations.has(to)) return null;

  const cameFrom = new Map<string, string>();
  const seen = new Set([from]);
  let frontier = [from];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const here of frontier) {
      for (const target of roadsFrom(here, registry, state)) {
        if (seen.has(target)) continue;
        seen.add(target);
        cameFrom.set(target, here);
        if (target === to) {
          const legs = [to];
          for (let at = cameFrom.get(to)!; at !== from; at = cameFrom.get(at)!) legs.unshift(at);
          return legs;
        }
        if (discovered(state, target)) next.push(target);
      }
    }
    frontier = next;
  }

  return null;
}

export function reachable(from: string, registry: Registry, state: GameState): Map<string, number> {
  const found = new Map<string, number>();
  const seen = new Set([from]);
  let frontier = [from];
  let legs = 0;

  while (frontier.length > 0) {
    legs += 1;
    const next: string[] = [];
    for (const here of frontier) {
      for (const target of roadsFrom(here, registry, state)) {
        if (seen.has(target)) continue;
        seen.add(target);
        if (!discovered(state, target)) continue;
        found.set(target, legs);
        next.push(target);
      }
    }
    frontier = next;
  }

  return found;
}

// How far each location stands from where a game begins, in roads walked. `reachable` above asks
// about a player — where can this one walk now, given the gates they have opened and the places
// they have found. This asks about the map: where a thing sits in the world whether anybody has
// been there or not, which is why it takes no state. A road held shut by a condition is still a
// road, because a gate is a beat in the story rather than a distance, and a location no road
// reaches is absent rather than infinitely far.
export function roadDepths(registry: Registry): ReadonlyMap<string, number> {
  const start = startingLocationId(registry);
  const depths = new Map<string, number>();
  if (start === undefined) return depths;
  depths.set(start, 0);
  for (let frontier = [start]; frontier.length > 0; ) {
    const next: string[] = [];
    for (const at of frontier) {
      for (const edge of effectiveAdjacent(registry, at)) {
        if (depths.has(edge.target)) continue;
        depths.set(edge.target, depths.get(at)! + 1);
        next.push(edge.target);
      }
    }
    frontier = next;
  }
  return depths;
}
