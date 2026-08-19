import { Action } from '../grammar/action';
import { actionAddress } from '../content/action';
import { declaredId, Entity } from '../content/entity';
import { Registry } from '../content/registry';
import { actionVisible, findActiveAction, findActionOwner, requiresMet } from './actions';
import { type Cadence, GameState, PLAYER, type Seat, templateOf } from './state';

// The sheet an actor is measured by. `player` is a well-known id rather than a
// privileged one: what it names declares its stats the way a rat does.
export function actorEntity(registry: Registry, actorId: string): Entity | undefined {
  return actorId === PLAYER ? registry.player : registry.entities.get(templateOf(actorId));
}

// An overload governs its entity's own performance of the action, so the gates
// it writes have to be read where that entity swings — not only where the
// player is offered a choice.
export const performable = (action: Action, state: GameState): boolean => requiresMet(action, state) && actionVisible(action, state);

export const seatOf = (id: string, action: Action, target: string): Seat => ({ ownerRef: `action.${id}`, actionSlug: actionAddress(action), target });

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
