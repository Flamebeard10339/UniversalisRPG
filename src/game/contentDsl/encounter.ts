import { Action } from './entity';
import { attemptDuration, statValue } from './stats';
import { PoolDeltas, requireResource } from './effects';
import { Registry } from './registry';
import { findActiveAction, parseOwnerRef } from './actions';
import { GameState, PLAYER, RuntimeError } from './state';
import { humanize } from './values';

// A repeating/spannable action in flight: a sequence of attempts against one
// target with `healthRemaining` (a "fight").
export interface ActiveAction {
  ownerRef: string; // "<obj>.<objId>", e.g. "entity.oven"
  actionLabel: string;
  repeating: boolean;
  healthRemaining: number;
  // Every swinger's clock, keyed by actor id. The player is an ordinary key
  // here — PLAYER — and is always present; a non-player actor gets one only if
  // it has a `retaliates` action to swing. Insertion order is the tie-break when
  // two cadences land on the same instant (see participants), and the player is
  // inserted first.
  cadences: Record<string, Cadence>;
  // The pools of the non-player actors taking part, keyed by entity id. Absent
  // for a solo action (cooking, travel, chopping); a `target:` action puts the
  // entity it fights in here. They live with the encounter and not in
  // state.resources because they are scoped to the fight — they vanish with it,
  // the player's persist.
  actors?: Record<string, ActorState>;
}

// One swinger's independent attack clock. `progress` is seconds elapsed toward
// the next attempt, not an absolute deadline, so a mid-flight rate change
// re-maps what remains rather than rewriting a deadline: a 2.4s swing 1.2s in
// that speeds up to 1.92s has 0.72s left, not 0.96s or 1.2s.
// `attemptsMade` alongside `healthRemaining` lets a split mid-fight resume
// exactly.
export interface Cadence {
  progress: number;
  attemptsMade: number;
}

export function newCadence(): Cadence {
  return { progress: 0, attemptsMade: 0 };
}

// A non-player participant's sheet. Only pool levels are stored: its stats come
// from its `# entity` block and its maxima are derived live from those stats,
// exactly as the player's are.
export interface ActorState {
  resources: Record<string, number>;
}

// The player's clock. Every fight has one, including the closed-form path that
// has no encounter at all.
export function playerCadence(active: ActiveAction): Cadence {
  return active.cadences[PLAYER];
}

// Adds an actor to the encounter with its pools filled to that ACTOR's own max,
// and a clock if it has a `retaliates` action to swing on it. Deliberately not
// initResources' rule: `start` is where a pool begins on a fresh game, a
// player-lifecycle concept with no meaning for something that stands up
// mid-fight. Honouring it made a `# resource health` with `start: 5` spawn every
// rat at 5 however much max-health its own sheet claimed.
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

// One swinger in the encounter: `self` runs `action` against `other`, on its own
// clock. `speed`/`ability`/`accuracy` read `self`; `target`/`dr` read `other`, so
// the identical action shape serves both directions and only the perspective
// flips between the player's attack and the entity's `retaliates` answer.
export interface Participant {
  self: string;
  other: string;
  action: Action;
  cadence: Cadence;
}

// One entry per clock in the encounter, in the order those clocks were added —
// which is what breaks ties when two cadences land on the same instant, so who
// goes first can never depend on where a caller split the span.
//
// The player is read out of the same map as everyone else. What still differs is
// only what a swing MEANS: the player runs the action that owns the fight and
// aims it at the thing being fought, while an actor runs its own `retaliates`
// answer and aims it back.
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

// One combatant as a driver needs to draw it. `cadence` is the fraction of the
// way to its next swing, which is the meter the CLI's 8-stage glyph renderer was
// built for and never had a source; it is null for a target that doesn't swing
// back and so keeps no clock.
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

// The fight in flight, for display only — the read-only twin of participants().
// Everything here is derived on the spot from the encounter and the actors'
// sheets; nothing is stored for the sake of being shown, so a driver that never
// calls this costs nothing. Null unless a real fight (a `target:` action) is
// running.
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

// Blow-by-blow narration, engine-side: a fight is the one place the player has
// to see every attempt as it lands, and there is nothing content could usefully
// say about a number the resolver has just rolled. Only a `target:` action
// narrates — a craft attempt is not a swing at anything.
//
// The player is always one side of a fight, so the two directions are two
// sentences rather than a general combat-log grammar.
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

// A hit landing on an actor's pool; returns the level it leaves behind.
//
// The player's damage joins the segment's deltas like any other pool write (see
// Segment). An enemy's is written on the spot instead: it has no rate
// integration to net against, and the fight's completion check has to read it
// back immediately.
//
// Neither path runs the resource's `on empty`/`on full` blocks for a non-player
// actor: those are authored in the player's voice ("You slump to the floor"), and
// a felled enemy must not borrow them. Its death is the fight completing.
export function damagePool(state: GameState, registry: Registry, actorId: string, resourceId: string, amount: number, deltas: PoolDeltas): number {
  const resource = requireResource(registry, resourceId);
  if (actorId === PLAYER) {
    const pending = (deltas.get(resourceId) ?? 0) - amount;
    deltas.set(resourceId, pending);
    // Where the segment is heading, so a caller sees the damage before it
    // settles; the clamped write itself happens once, at segment end.
    return Math.max(0, (state.resources[resourceId] ?? 0) + pending);
  }
  const pools = actorInEncounter(state, actorId).resources;
  const max = statValue(resource.max, state, registry, actorId);
  const level = Math.min(max, Math.max(0, (pools[resource.id] ?? 0) - amount));
  pools[resource.id] = level;
  return level;
}
