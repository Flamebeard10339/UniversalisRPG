import { Action } from './entity';
import { attemptDuration, statValue } from './stats';
import { PoolDeltas, requireResource } from './effects';
import { Registry } from './registry';
import { findActiveAction, parseOwnerRef } from './actions';
import { GameState, PLAYER, RuntimeError } from './state';
import { humanize } from './values';

export interface ActiveAction {
  ownerRef: string; // "<obj>.<objId>", e.g. "entity.oven"
  actionLabel: string;
  repeating: boolean;
  healthRemaining: number;
  // Insertion order breaks ties between clocks due at the same instant.
  cadences: Record<string, Cadence>;
  // Scoped to the fight and vanish with it, where the player's pools persist.
  actors?: Record<string, ActorState>;
}

export interface Cadence {
  progress: number;
  attemptsMade: number;
}

export function newCadence(): Cadence {
  return { progress: 0, attemptsMade: 0 };
}

export interface ActorState {
  resources: Record<string, number>;
}

export function playerCadence(active: ActiveAction): Cadence {
  return active.cadences[PLAYER];
}

// The actor's own max, not initResources' `start`, a player-lifecycle concept.
export function enterEncounter(active: ActiveAction, actorId: string, state: GameState, registry: Registry): void {
  const resources: Record<string, number> = {};
  for (const resource of registry.resources.values()) {
    resources[resource.id] = statValue(resource.max, state, registry, actorId);
  }
  (active.actors ??= {})[actorId] = { resources };
  if (retaliationOf(actorId, registry)) active.cadences[actorId] = newCadence();
  else delete active.cadences[actorId];
}

export function actorInEncounter(state: GameState, actorId: string): ActorState {
  const actor = state.activeAction?.actors?.[actorId];
  if (!actor) throw new RuntimeError(`actor is not in the encounter: ${actorId}`);
  return actor;
}

// One shape, both directions: `speed`/`ability` read `self`, `target`/`dr` `other`.
export interface Participant {
  self: string;
  other: string;
  action: Action;
  cadence: Cadence;
}

export function participants(state: GameState, registry: Registry, action: Action): Participant[] {
  const active = state.activeAction!;
  const list: Participant[] = [];
  for (const [actorId, cadence] of Object.entries<Cadence>(active.cadences)) {
    if (actorId === PLAYER) {
      list.push({ self: PLAYER, other: parseOwnerRef(active.ownerRef).objId, action, cadence });
      continue;
    }
    const retaliation = retaliationOf(actorId, registry);
    if (retaliation) list.push({ self: actorId, other: PLAYER, action: retaliation, cadence });
  }
  return list;
}

export function retaliationOf(actorId: string, registry: Registry): Action | undefined {
  return registry.entities.get(actorId)?.actions.find((candidate) => candidate.retaliates);
}

export function actorTitle(actorId: string, registry: Registry): string {
  return registry.entities.get(actorId)?.title ?? humanize(actorId);
}

export interface EncounterFoe {
  id: string;
  title: string;
  resource: string;
  current: number;
  max: number;
  cadence: number | null;
}

export interface EncounterView {
  cadence: number;
  foes: EncounterFoe[];
}

export function encounterView(state: GameState, registry: Registry): EncounterView | null {
  const active = state.activeAction;
  if (!active) return null;
  const action = findActiveAction(active, registry);
  if (!action.target) return null;

  const fractionOf = (cadence: Cadence, actorId: string, swing: Action): number => {
    const duration = attemptDuration(swing, state, registry, actorId);
    return duration > 0 ? Math.min(1, cadence.progress / duration) : 1;
  };
  const resource = requireResource(registry, action.target);

  const foes: EncounterFoe[] = [];
  for (const [actorId, actor] of Object.entries<ActorState>(active.actors ?? {})) {
    const retaliation = retaliationOf(actorId, registry);
    const cadence = active.cadences[actorId];
    foes.push({
      id: actorId,
      title: actorTitle(actorId, registry),
      resource: resource.id,
      current: actor.resources[resource.id] ?? 0,
      max: statValue(resource.max, state, registry, actorId),
      cadence: cadence && retaliation ? fractionOf(cadence, actorId, retaliation) : null,
    });
  }
  return { cadence: fractionOf(playerCadence(active), PLAYER, action), foes };
}

export function logSwing(state: GameState, registry: Registry, self: string, other: string, damage: number | null): void {
  if (self === PLAYER) {
    const title = actorTitle(other, registry);
    state.log.push(damage === null ? `You miss the ${title}.` : `You hit the ${title} for ${damage}.`);
  } else {
    const title = actorTitle(self, registry);
    state.log.push(damage === null ? `The ${title} misses you.` : `The ${title} hits you for ${damage}.`);
  }
}

export function poolLevel(state: GameState, registry: Registry, actorId: string, resourceId: string): number {
  requireResource(registry, resourceId);
  if (actorId === PLAYER) return state.resources[resourceId] ?? 0;
  return actorInEncounter(state, actorId).resources[resourceId] ?? 0;
}

// An enemy's damage is written on the spot: no rate to net against. Neither path
// runs a non-player's `on empty`/`on full`, authored in the player's voice.
export function damagePool(state: GameState, registry: Registry, actorId: string, resourceId: string, amount: number, deltas: PoolDeltas): number {
  const resource = requireResource(registry, resourceId);
  if (actorId === PLAYER) {
    const pending = (deltas.get(resourceId) ?? 0) - amount;
    deltas.set(resourceId, pending);
    // Where the segment is heading; the clamped write happens at segment end.
    return Math.max(0, (state.resources[resourceId] ?? 0) + pending);
  }
  const pools = actorInEncounter(state, actorId).resources;
  const max = statValue(resource.max, state, registry, actorId);
  const level = Math.min(max, Math.max(0, (pools[resource.id] ?? 0) - amount));
  pools[resource.id] = level;
  return level;
}
