import { Action, isTwoSided, Sided } from '../grammar/action';
import { attemptDuration, statValue } from './stats';
import { addDelta, getDelta, PoolDeltas, requireResource } from './effects';
import { actionAddress } from '../content/action';
import { declaredId, Entity } from '../content/entity';
import { hostile, Registry } from '../content/registry';
import { actionVisible, findActiveAction, findActionOwner, requiresMet } from './actions';
import { GameState, PLAYER, RuntimeError, templateOf } from './state';
import { Localized, localizerOf, Params } from './localized';
import { fromMilliUnits, toMilliUnits, MILLI_UNITS } from './units';

// Where one participant's swing comes from and who it lands on. Every
// participant has one, the player included, so nothing reads a side off an
// identity.
export interface Seat {
  ownerRef: string;
  actionSlug: string;
  target: string;
}

export interface ActiveAction {
  ownerRef: string; // "<obj>.<objId>", e.g. "entity.oven" or "action.melee-combat"
  // What addresses the action under that owner, never the label it is shown as.
  actionSlug: string;
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
    if (!performable(action, state)) continue;
    if (!hasPool(state, registry, attackerId, action.depletes.id)) continue;
    return { id, action };
  }
  return undefined;
}

// An overload governs its entity's own performance of the action, so the gates
// it writes have to be read where that entity swings — not only where the
// player is offered a choice.
export const performable = (action: Action, state: GameState): boolean => requiresMet(action, state) && actionVisible(action, state);

export const seatOf = (id: string, action: Action, target: string): Seat => ({ ownerRef: `action.${id}`, actionSlug: actionAddress(action), target });

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

// One shape for every participant: the side it reads `my` off, the side it reads
// `their` off, the action it brought, and its own clock.
export interface Participant {
  self: string;
  other: string;
  action: Action;
  cadence: Cadence;
}

// The performer's own copy first: an overload governs that entity's
// performance of the action, so reading the top-level declaration back would
// discard everything the overload said but its label.
function seatedAction(seat: Seat, registry: Registry, actorId: string): Action | undefined {
  const dot = seat.ownerRef.indexOf('.');
  const obj = seat.ownerRef.slice(0, dot);
  const objId = seat.ownerRef.slice(dot + 1);
  if (obj === 'action') {
    const own = actorEntity(registry, actorId)?.actions.find((each) => declaredId(each) === objId);
    if (own) return own;
  }
  const owner = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  return owner?.actions?.find((each) => actionAddress(each) === seat.actionSlug);
}

// What the performer of the armed action actually brings: its own copy, with
// its overload applied. `findActiveAction` answers what the ownerRef names,
// which is the declaration an overload overlays rather than the overlay.
export function armedAction(state: GameState, registry: Registry): Action {
  const active = state.activeAction!;
  const seat = active.roster?.[PLAYER];
  return (seat && seatedAction(seat, registry, PLAYER)) ?? findActiveAction(active, registry);
}

export function participants(state: GameState, registry: Registry): Participant[] {
  const active = state.activeAction!;
  const list: Participant[] = [];
  for (const [actorId, cadence] of Object.entries<Cadence>(active.cadences)) {
    const seat = active.roster?.[actorId];
    if (!seat) continue;
    const action = seatedAction(seat, registry, actorId);
    if (action && performable(action, state)) list.push({ self: actorId, other: seat.target, action, cadence });
  }
  return list;
}

// The name a swing says. An actor whose entity is no longer loaded has no
// title in any language, so its key stands in — which is what c3 asks for and
// what a humanized id was pretending not to be.
export function actorTitle(actorId: string, registry: Registry, state: GameState): Localized {
  return localizerOf(registry, state).title('entity', actorEntity(registry, actorId)?.id ?? actorId);
}

// Everyone in the fight who is hostile to this actor, which is what a fight's
// sides are: derived from factions, never declared.
export function opposes(registry: Registry, a: string, b: string): boolean {
  return hostile(registry, actorEntity(registry, a), actorEntity(registry, b));
}

export interface EncounterFoe {
  id: string;
  title: Localized;
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

// Rounded, because the log is prose: sub-unit precision belongs in the pool,
// not in a sentence reporting a hit for 4.873. Handed to the pattern as a
// number, so how a language spells one stays the pattern's business.
function spoken(milliAmount: number): number {
  return Math.round(fromMilliUnits(milliAmount) * 10) / 10;
}

// Four patterns rather than one assembled sentence: who swings decides which
// two of them there are, and a language is free to put the actor, the verb and
// the amount wherever it puts them.
export function logSwing(state: GameState, registry: Registry, self: string, other: string, damage: number | null): void {
  const localizer = localizerOf(registry, state);
  // A swing the player lands on themselves is neither of the two sides the
  // patterns name, so it is said the way one between two others is: whoever
  // swings is named, and so is whoever it lands on.
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

// Accrued for every actor alike, so where a caller splits a span cannot change
// the level reached.
export function damagePool(state: GameState, registry: Registry, actorId: string, resourceId: string, milliAmount: number, deltas: PoolDeltas): number {
  addDelta(deltas, actorId, resourceId, -milliAmount);
  // Where the segment is heading; the clamped write happens at segment end.
  return Math.max(0, poolLevel(state, registry, actorId, resourceId) + getDelta(deltas, actorId, resourceId));
}
