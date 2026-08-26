import { isTwoSided, sideOf, type Action } from '../grammar/action';
import { startingLocationId, type Registry } from '../content/registry';
import { attemptDuration, hitChance, hitDamage, statValue } from './stats';
import { createGameState, PLAYER, type GameState } from './state';
import { fromMilliUnits, MS_PER_MINUTE, MS_PER_SECOND } from './units';

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

const statOf = (registry: Registry, state: GameState, statId: string, actorId: string): number => statValue(statId, state, registry, actorId);

// Damage per second one actor lands on another with one action. Every stat the sum reads is named
// by the action rather than by this file — the contest to land, the contest to hurt, the cadence,
// the pool — so a world that fights with stats of its own is scored by the ones it fights with.
export function damagePerSecond(registry: Registry, state: GameState, action: Action, attacker: string, defender: string): number {
  if (!swings(action)) return 0;
  const accuracy = action.accuracy;
  const damage = action.damage!;
  const lands =
    accuracy === undefined || accuracy.right === undefined
      ? 1
      : hitChance(statOf(registry, state, accuracy.left.id, sideOf(accuracy.left, attacker, defender)), statOf(registry, state, accuracy.right.id, sideOf(accuracy.right, attacker, defender)), registry);
  const struck = statOf(registry, state, damage.left.id, sideOf(damage.left, attacker, defender));
  const shrugged = damage.right === undefined ? 0 : statOf(registry, state, damage.right.id, sideOf(damage.right, attacker, defender));
  const perAttempt = attemptDuration(action, state, registry, attacker, defender);
  if (!Number.isFinite(perAttempt)) return 0;
  return (lands * fromMilliUnits(hitDamage(struck, shrugged, registry)) * MS_PER_SECOND) / Math.max(perAttempt, 1);
}

// What the drained pool puts back per second while the fight runs. A foe that mends faster than it
// is being cut is one nobody can finish, and the arithmetic below says so on its own.
function regainedPerSecond(registry: Registry, state: GameState, action: Action, defender: string): number {
  const resource = registry.resources.get(action.depletes!.id);
  if (resource?.rate === undefined) return 0;
  return (statOf(registry, state, resource.rate, defender) * MS_PER_SECOND) / MS_PER_MINUTE;
}

function poolMax(registry: Registry, state: GameState, action: Action, defender: string): number {
  const resource = registry.resources.get(action.depletes!.id);
  return resource === undefined ? 0 : statOf(registry, state, resource.max, defender);
}

// Seconds for one actor to put the other down with the best thing it brings, or Infinity where it
// brings nothing that ever would.
export function timeToKill(registry: Registry, state: GameState, attacker: string, defender: string): number {
  const entity = attacker === PLAYER ? registry.player : registry.entities.get(attacker);
  let soonest = Infinity;
  for (const action of attackActions(entity?.actions ?? [])) {
    const net = damagePerSecond(registry, state, action, attacker, defender) - regainedPerSecond(registry, state, action, defender);
    if (net <= 0) continue;
    soonest = Math.min(soonest, poolMax(registry, state, action, defender) / net);
  }
  return soonest;
}

// What a fight costs, as one number: how much longer this entity takes to put down than it takes to
// put the reference actor down. One is an even fight; below one dies before it hurts you. The
// reference is the world's own player, unequipped, so the scale is fixed and nothing is authored
// for the measurement's sake — only the ordering this produces is ever claimed.
export function threatOf(registry: Registry, state: GameState, entityId: string): number {
  const kills = timeToKill(registry, state, entityId, PLAYER);
  if (!Number.isFinite(kills)) return 0;
  const dies = timeToKill(registry, state, PLAYER, entityId);
  return kills <= 0 ? Infinity : dies / kills;
}

export interface Encounter extends Placement {
  entity: string;
  threat: number;
}

// Every fight the world picks rather than the player: an entity that comes unbidden, stands
// somewhere a road reaches, and brings something to swing. Nothing is listed here, so a foe added
// next month is measured by having been placed. A statted entity a player may choose to attack is
// not an encounter — walking up to a knight is the player's idea, and no progression rests on it.
export function encounters(registry: Registry): readonly Encounter[] {
  const state = createGameState();
  const where = placements(registry);
  const found: Encounter[] = [];
  for (const entity of registry.entities.values()) {
    const placement = where.get(entity.id);
    if (!entity.aggressive || placement === undefined || attackActions(entity.actions).length === 0) continue;
    found.push({ entity: entity.id, ...placement, threat: threatOf(registry, state, entity.id) });
  }
  return found.sort((one, other) => one.depth - other.depth || one.threat - other.threat);
}

// A ratio below which two encounters are not ordered at all. It is a noise floor and not a budget:
// the claim being made is ordinal, so the only thing this number decides is how far apart two
// fights have to be before their order counts as deliberate.
export const INVERSION_FACTOR = 2;

export interface Inversion {
  encounter: Encounter;
  beyond: readonly Encounter[];
}

// A fight harder than everything that comes after it. That is the whole claim — not that difficulty
// rises smoothly, which no world's does, but that no encounter is a wall with nothing but easier
// ground past it. The last fight in the world has nothing beyond it and so can never be one.
export function inversions(registry: Registry, factor: number = INVERSION_FACTOR): readonly Inversion[] {
  const all = encounters(registry);
  const found: Inversion[] = [];
  for (const encounter of all) {
    const beyond = all.filter((other) => other.depth > encounter.depth);
    if (beyond.length > 0 && beyond.every((other) => other.threat * factor < encounter.threat)) found.push({ encounter, beyond });
  }
  return found;
}

export function describeInversion({ encounter, beyond }: Inversion): string {
  const past = beyond.map((other) => `${other.entity} (${other.threat.toFixed(1)}, ${other.depth} out)`).join(', ');
  return `${encounter.entity} stands ${encounter.depth} roads out at ${encounter.at} and is harder (${encounter.threat.toFixed(1)}) than everything past it: ${past}`;
}
