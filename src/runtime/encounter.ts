import { RuntimeError } from './error';
import { Action, isTwoSided, sideOf } from '../grammar/action';
import { attemptDuration, hasPool, stalledPace, statValue } from './stats';
import { participants, performable, seatOf } from './roster';
import { actorEntity } from './actionLookup';
import { addDelta, getDelta, PoolDeltas, requireResource } from './effects';
import { declaredId } from '../content/sections/entity';
import { hostile, Registry } from '../content/registry';
import { findActiveAction } from './actions';
import { standing } from './population';
import { type ActiveAction, type ActorState, type Cadence, GameState, PLAYER, templateOf } from './state';
import { Answer, Localized, localizerOf, Params } from './localized';
import { fromMilliUnits, toMilliUnits, MILLI_UNITS } from './units';

export function newCadence(): Cadence {
  return { progress: 0, attemptsMade: 0 };
}

export function playerCadence(active: ActiveAction): Cadence {
  return (active.cadences[PLAYER] ??= newCadence());
}

// Where a clock stands, and the attempt it stands within — written together, because milliseconds
// on their own are not a reading of anything. A clock at nothing has counted nothing against
// anything, so it carries no span at all.
export function standAt(cadence: Cadence, progress: number, span?: number): void {
  cadence.progress = progress;
  if (progress > 0 && span !== undefined) cadence.span = span;
  else delete cadence.span;
}

// How far into its attempt a clock stands. A pace taken to nothing has no span to divide by, so the
// span the clock stopped on is what it is read against and the fraction holds where it stood.
export function attemptFraction(cadence: Cadence, duration: number): number {
  const stopped = stalledPace(duration);
  const span = stopped ? (cadence.span ?? 0) : duration;
  if (!(span > 0)) return stopped ? 0 : 1;
  return Math.min(1, Math.max(0, cadence.progress / span));
}

export const IMPLICIT_TARGET_FULL = MILLI_UNITS;

export function retaliation(state: GameState, registry: Registry, actorId: string, attackerId: string): { id: string; action: Action } | undefined {
  for (const action of actorEntity(registry, actorId)?.actions ?? []) {
    const id = declaredId(action);
    if (id === undefined || !isTwoSided(action) || !action.depletes) continue;
    if (!performable(action, state, registry)) continue;
    if (!hasPool(state, registry, attackerId, action.depletes.id)) continue;
    return { id, action };
  }
  return undefined;
}

// Somebody joins the fight. Said only for those coming at the player, which is what naming who they
// entered against already tells us: a foe's friends arrive against the player and the player's
// against the foe, so nobody has to keep a second list of which side anyone is on.
export function enterEncounter(active: ActiveAction, actorId: string, state: GameState, registry: Registry, attackerId: string): void {
  if (attackerId === PLAYER) state.log.push(localizerOf(registry, state).engine('engine.combat.started', { target: actorTitle(actorId, registry, state) }));
  const resources: Record<string, number> = {};
  for (const resource of registry.resources.values()) {
    resources[resource.id] = toMilliUnits(statValue(resource.max, state, registry, actorId));
  }
  (active.actors ??= {})[actorId] = { resources, rateRemainders: {} };
  const swing = retaliation(state, registry, actorId, attackerId);
  if (swing) {
    active.cadences[actorId] = newCadence();
    (active.roster ??= {})[actorId] = seatOf(swing.id, swing.action, attackerId);
  } else {
    delete active.cadences[actorId];
    delete active.roster?.[actorId];
  }
}

export function leaveFight(active: ActiveAction, actorId: string): void {
  delete active.cadences[actorId];
  if (active.roster) delete active.roster[actorId];
  if (active.actors) delete active.actors[actorId];
}

export function actorInEncounter(state: GameState, actorId: string): ActorState {
  const actor = state.activeAction?.actors?.[actorId];
  if (!actor) throw new RuntimeError(`actor is not in the encounter: ${actorId}`);
  return actor;
}

export function actorTitle(actorId: string, registry: Registry, state: GameState): Localized {
  return localizerOf(registry, state).title('entity', actorEntity(registry, actorId)?.id ?? actorId);
}

export function opposes(registry: Registry, a: string, b: string): boolean {
  return hostile(registry, actorEntity(registry, a), actorEntity(registry, b));
}

export interface EncounterFoe {
  id: Answer;
  title: Localized;
  resource: Answer;
  current: number;
  max: number;
  cadence: number | null;
  // How many of this foe's kind still stand where the player is — null for one that is no part of
  // the location's population, such as an ally called in or a fight-scoped copy of one. A location
  // holds a count and not a roster, so the rat now standing is the rat that died as far as any id
  // goes, and without this a player watching a full-health foe replace a felled one reads it as a
  // healing enemy. Two of them did.
  remaining: number | null;
}

export interface EncounterView {
  cadence: number;
  foes: EncounterFoe[];
}

export function encounterView(state: GameState, registry: Registry): EncounterView | null {
  const active = state.activeAction;
  if (!active) return null;
  const action = findActiveAction(active, registry);
  if (!action.depletes) return null;

  const fractionOf = (cadence: Cadence, actorId: string, swing: Action, other: string): number => attemptFraction(cadence, attemptDuration(swing, state, registry, actorId, other));
  const resource = requireResource(registry, action.depletes.id);
  const swinging = new Map(participants(state, registry).map((each) => [each.self, each]));
  const here = registry.locations.get(state.location);
  const alive = new Map(here ? standing(state, registry, here).map((entry) => [entry.entity, entry.count]) : []);
  const stillHere = (actorId: string): number | null => {
    const template = templateOf(actorId);
    if (!here?.entities.some((entry) => entry.entity === template)) return null;
    return alive.get(template) ?? 0;
  };

  const foes: EncounterFoe[] = [];
  for (const [actorId, actor] of Object.entries<ActorState>(active.actors ?? {})) {
    const swing = swinging.get(actorId);
    foes.push({
      id: actorId,
      title: actorTitle(actorId, registry, state),
      resource: resource.id,
      current: fromMilliUnits(actor.resources[resource.id] ?? 0),
      max: statValue(resource.max, state, registry, actorId),
      cadence: swing ? fractionOf(swing.cadence, actorId, swing.action, swing.other) : null,
      remaining: stillHere(actorId),
    });
  }
  return { cadence: fractionOf(playerCadence(active), PLAYER, action, swinging.get(PLAYER)?.other ?? PLAYER), foes };
}

export function targetLevel(state: GameState, registry: Registry, action: Action, self: string, other: string): number {
  if (!action.depletes) return state.activeAction!.implicitTarget;
  return poolLevel(state, registry, sideOf(action.depletes, self, other), action.depletes.id);
}

export function damageTarget(state: GameState, registry: Registry, action: Action, self: string, other: string, milliAmount: number, deltas: PoolDeltas): number {
  if (!action.depletes) {
    const active = state.activeAction!;
    active.implicitTarget -= milliAmount;
    return active.implicitTarget;
  }
  return damagePool(state, registry, sideOf(action.depletes, self, other), action.depletes.id, milliAmount, deltas);
}

function spoken(milliAmount: number): number {
  return Math.round(fromMilliUnits(milliAmount) * 10) / 10;
}

export function logSwing(state: GameState, registry: Registry, self: string, other: string, damage: number | null): void {
  const localizer = localizerOf(registry, state);
  const attacker = self === PLAYER && other !== PLAYER ? undefined : actorTitle(self, registry, state);
  const target = other === PLAYER && self !== PLAYER ? undefined : actorTitle(other, registry, state);
  const side = attacker === undefined ? 'player' : target === undefined ? 'foe' : 'other';
  const params: Params = { ...(attacker === undefined ? {} : { attacker }), ...(target === undefined ? {} : { target }) };
  const hit = `engine.combat.${side}.hit` as const;
  const miss = `engine.combat.${side}.miss` as const;
  state.log.push(damage === null ? localizer.engine(miss, params) : localizer.engine(hit, { ...params, damage: spoken(damage) }));
}

export function poolLevel(state: GameState, registry: Registry, actorId: string, resourceId: string): number {
  requireResource(registry, resourceId);
  if (actorId === PLAYER) return state.resources[resourceId] ?? 0;
  return actorInEncounter(state, actorId).resources[resourceId] ?? 0;
}

export function damagePool(state: GameState, registry: Registry, actorId: string, resourceId: string, milliAmount: number, deltas: PoolDeltas): number {
  addDelta(deltas, actorId, resourceId, -milliAmount);
  return Math.max(0, poolLevel(state, registry, actorId, resourceId) + getDelta(deltas, actorId, resourceId));
}
