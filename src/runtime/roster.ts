import { Action } from '../grammar/action';
import { actionAddress } from '../content/sections/action';
import { declaredId, Entity } from '../content/sections/entity';
import { Registry } from '../content/registry';
import { actionVisible, findActiveAction, findActionOwner, requiresMet } from './actions';
import { type Cadence, GameState, PLAYER, type Seat, templateOf } from './state';

export function actorEntity(registry: Registry, actorId: string): Entity | undefined {
  return actorId === PLAYER ? registry.player : registry.entities.get(templateOf(actorId));
}

export const performable = (action: Action, state: GameState, registry: Registry): boolean => requiresMet(action, state, registry) && actionVisible(action, state, registry);

export const seatOf = (id: string, action: Action, target: string): Seat => ({ ownerRef: `action.${id}`, actionSlug: actionAddress(action), target });

export interface Participant {
  self: string;
  other: string;
  action: Action;
  cadence: Cadence;
}

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
    if (action && performable(action, state, registry)) list.push({ self: actorId, other: seat.target, action, cadence });
  }
  return list;
}
