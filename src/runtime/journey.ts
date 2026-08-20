import { DISCOVERED } from '../content/sections/location';
import type { Registry } from '../content/registry';
import { evaluateCondition, truthy } from './conditions';
import type { GameState } from './state';

const discovered = (state: GameState, id: string): boolean => truthy(state.flags[`${id}.${DISCOVERED}`]);

export function roadsFrom(from: string, registry: Registry, state: GameState): string[] {
  const location = registry.locations.get(from);
  if (!location) return [];
  return location.adjacent.filter((edge) => !edge.condition || evaluateCondition(edge.condition, state)).map((edge) => edge.target);
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
