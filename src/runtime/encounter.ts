import { RuntimeError } from './error';
import { Action, isTwoSided, sideOf } from '../grammar/action';
import { attemptDuration, hasPool, statValue } from './stats';
import { participants, performable, seatOf } from './roster';
import { actorEntity } from './seat';
import { addDelta, getDelta, PoolDeltas, requireResource } from './effects';
import { declaredId } from '../content/sections/entity';
import { hostile, Registry } from '../content/registry';
import { findActiveAction } from './actions';
import { type ActiveAction, type ActorState, type Cadence, GameState, PLAYER } from './state';
import { Answer, Localized, localizerOf, Params } from './localized';
import { fromMilliUnits, toMilliUnits, MILLI_UNITS } from './units';

export function newCadence(): Cadence {
  return { progress: 0, attemptsMade: 0 };
}

export function playerCadence(active: ActiveAction): Cadence {
  return (active.cadences[PLAYER] ??= newCadence());
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

export function enterEncounter(active: ActiveAction, actorId: string, state: GameState, registry: Registry, attackerId: string): void {
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

  const fractionOf = (cadence: Cadence, actorId: string, swing: Action): number => {
    const duration = attemptDuration(swing, state, registry, actorId);
    return duration > 0 ? Math.min(1, cadence.progress / duration) : 1;
  };
  const resource = requireResource(registry, action.depletes.id);
  const swinging = new Map(participants(state, registry).map((each) => [each.self, each]));

  const foes: EncounterFoe[] = [];
  for (const [actorId, actor] of Object.entries<ActorState>(active.actors ?? {})) {
    const swing = swinging.get(actorId);
    foes.push({
      id: actorId,
      title: actorTitle(actorId, registry, state),
      resource: resource.id,
      current: fromMilliUnits(actor.resources[resource.id] ?? 0),
      max: statValue(resource.max, state, registry, actorId),
      cadence: swing ? fractionOf(swing.cadence, actorId, swing.action) : null,
    });
  }
  return { cadence: fractionOf(playerCadence(active), PLAYER, action), foes };
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
