import { DISCOVERED } from '../content/location';
import type { Registry } from '../content/registry';
import { evaluateCondition, truthy } from './conditions';
import type { GameState } from './state';

// A walk under way, held on the state because it outlives the leg it is on and
// has to survive a save. The place the player is standing in is never in
// `legs`: a leg is crossed by arriving, and arriving takes it off the front.
export interface Journey {
  to: string;
  legs: string[];
}

const discovered = (state: GameState, id: string): boolean => truthy(state.flags[`${id}.${DISCOVERED}`]);

// Every place a road leads to from here that the player could walk today. A
// shut edge is a road they know about and cannot take, which is why the
// condition is evaluated rather than the edge merely counted.
export function roadsFrom(from: string, registry: Registry, state: GameState): string[] {
  const location = registry.locations.get(from);
  if (!location) return [];
  return location.adjacent.filter((edge) => !edge.condition || evaluateCondition(edge.condition, state)).map((edge) => edge.target);
}

// The way there, as the places still to cross ending at the destination, or
// null when the roads do not reach. Breadth-first, so the route is the one with
// the fewest legs; ties fall to the order the content wrote its edges in, which
// is the only order either end of this has.
//
// A route is walked through places the player has already found and may end in
// one they have not: stepping into the unknown is how a neighbour is
// discovered, but routing through the unknown would make the shape of the
// unfound map readable off a journey, which is exactly what `publishDiscovered`
// refuses to give away.
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

// Every discovered place the roads reach from here, each with how many legs
// away it is. What a driver needs to know which places it may set off for, and
// how far, without walking the graph itself.
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
        found.set(target, legs);
        if (discovered(state, target)) next.push(target);
      }
    }
    frontier = next;
  }

  return found;
}
