import { Action, isTwoSided, Sided } from '../grammar/action';
import { attemptDuration, statValue } from './stats';
import { addDelta, getDelta, PoolDeltas, requireResource } from './effects';
import { declaredId, Entity } from '../content/entity';
import { hostile, Registry } from '../content/registry';
import { findActiveAction, findActionOwner } from './actions';
import { GameState, PLAYER, RuntimeError } from './state';
import { humanize } from '../grammar/values';
import { fromMilliUnits, toMilliUnits, MILLI_UNITS } from './units';

// Where one participant's swing comes from and who it lands on. Every
// participant has one, the player included, so nothing reads a side off an
// identity.
export interface Seat {
  ownerRef: string;
  actionLabel: string;
  target: string;
}

export interface ActiveAction {
  ownerRef: string; // "<obj>.<objId>", e.g. "entity.oven" or "action.melee-combat"
  actionLabel: string;
  repeating: boolean;
  implicitTarget: number;
  // Insertion order breaks ties between clocks due at the same instant.
  cadences: Record<string, Cadence>;
  // Scoped to the fight and vanish with it, where the player's pools persist.
  actors?: Record<string, ActorState>;
  roster?: Record<string, Seat>;
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
  rateRemainders: Record<string, number>;
}

// Installed rather than defaulted, because callers write attemptsMade and
// progress back through this. An action can reach here without one: a `# save`
// carries `cadences` as authored JSON and nothing before now required a clock
// in it.
export function playerCadence(active: ActiveAction): Cadence {
  return (active.cadences[PLAYER] ??= newCadence());
}

export const IMPLICIT_TARGET_FULL = MILLI_UNITS;

// A fight-scoped copy's key is its type and which copy it is. No syntax anywhere
// names one — an author writes counts — so this separator never reaches a page.
export const FIGHT_SCOPED = '#';

export const templateOf = (actorId: string): string => actorId.split(FIGHT_SCOPED)[0];

// The sheet an actor is measured by. `player` is a well-known id rather than a
// privileged one: what it names declares its stats the way a rat does.
export function actorEntity(registry: Registry, actorId: string): Entity | undefined {
  return actorId === PLAYER ? registry.player : registry.entities.get(templateOf(actorId));
}

// Which participant a marked name is read off. The marker is written down, so
// this is a lookup rather than a rule about who is swinging.
export const sideOf = (field: Sided, self: string, other: string): string => (field.side === 'their' ? other : self);

// Whether an actor carries the pool at all, which is what makes it a valid
// target: there is no list of permitted types anywhere.
export function hasPool(state: GameState, registry: Registry, actorId: string, resourceId: string): boolean {
  const resource = registry.resources.get(resourceId);
  return resource !== undefined && statValue(resource.max, state, registry, actorId) > 0;
}

// Unconditional and unauthored: the first two-sided action in the entity's
// `uses:` whose `depletes:` names a pool its attacker has. `uses:` order is the
// one place an entity says which attack it prefers.
export function retaliation(state: GameState, registry: Registry, actorId: string, attackerId: string): { id: string; action: Action } | undefined {
  for (const action of actorEntity(registry, actorId)?.actions ?? []) {
    const id = declaredId(action);
    if (id === undefined || !isTwoSided(action) || !action.depletes) continue;
    if (!hasPool(state, registry, attackerId, action.depletes.id)) continue;
    return { id, action };
  }
  return undefined;
}

export const seatOf = (id: string, action: Action, target: string): Seat => ({ ownerRef: `action.${id}`, actionLabel: action.label, target });

// The actor's own max, not initResources' `start`, a player-lifecycle concept.
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

export function actorInEncounter(state: GameState, actorId: string): ActorState {
  const actor = state.activeAction?.actors?.[actorId];
  if (!actor) throw new RuntimeError(`actor is not in the encounter: ${actorId}`);
  return actor;
}

// One shape for every participant: the side it reads `my` off, the side it reads
// `their` off, the action it brought, and its own clock.
export interface Participant {
  self: string;
  other: string;
  action: Action;
  cadence: Cadence;
}

function seatedAction(seat: Seat, registry: Registry): Action | undefined {
  const dot = seat.ownerRef.indexOf('.');
  const owner = findActionOwner(seat.ownerRef.slice(0, dot), seat.ownerRef.slice(dot + 1), registry) as { actions?: Action[] } | undefined;
  return owner?.actions?.find((each) => each.label === seat.actionLabel);
}

export function participants(state: GameState, registry: Registry): Participant[] {
  const active = state.activeAction!;
  const list: Participant[] = [];
  for (const [actorId, cadence] of Object.entries<Cadence>(active.cadences)) {
    const seat = active.roster?.[actorId];
    if (!seat) continue;
    const action = seatedAction(seat, registry);
    if (action) list.push({ self: actorId, other: seat.target, action, cadence });
  }
  return list;
}

export function actorTitle(actorId: string, registry: Registry): string {
  return actorEntity(registry, actorId)?.title ?? humanize(actorId);
}

// Everyone in the fight who is hostile to this actor, which is what a fight's
// sides are: derived from factions, never declared.
export function opposes(registry: Registry, a: string, b: string): boolean {
  return hostile(registry, actorEntity(registry, a), actorEntity(registry, b));
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
      title: actorTitle(actorId, registry),
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

// Rounded, because the log is prose: sub-unit precision belongs in the pool,
// not in a sentence reporting a hit for 4.873.
function spoken(milliAmount: number): string {
  return String(Math.round(fromMilliUnits(milliAmount) * 10) / 10);
}

export function logSwing(state: GameState, registry: Registry, self: string, other: string, damage: number | null): void {
  if (self === PLAYER) {
    const title = actorTitle(other, registry);
    state.log.push(damage === null ? `You miss the ${title}.` : `You hit the ${title} for ${spoken(damage)}.`);
  } else {
    const title = actorTitle(self, registry);
    state.log.push(damage === null ? `The ${title} misses you.` : `The ${title} hits you for ${spoken(damage)}.`);
  }
}

export function poolLevel(state: GameState, registry: Registry, actorId: string, resourceId: string): number {
  requireResource(registry, resourceId);
  if (actorId === PLAYER) return state.resources[resourceId] ?? 0;
  return actorInEncounter(state, actorId).resources[resourceId] ?? 0;
}

// Accrued for every actor alike, so where a caller splits a span cannot change
// the level reached.
export function damagePool(state: GameState, registry: Registry, actorId: string, resourceId: string, milliAmount: number, deltas: PoolDeltas): number {
  addDelta(deltas, actorId, resourceId, -milliAmount);
  // Where the segment is heading; the clamped write happens at segment end.
  return Math.max(0, poolLevel(state, registry, actorId, resourceId) + getDelta(deltas, actorId, resourceId));
}
