import { Action } from '../grammar/action';
import { actionAddress } from '../content/sections/action';
import { Registry } from '../content/registry';
import { actionVisible, findActiveAction, requiresMet } from './actions';
import { seatedAction } from './actionLookup';
import { type Cadence, GameState, PLAYER, type Seat } from './state';

export const performable = (action: Action, state: GameState, registry: Registry): boolean => requiresMet(action, state, registry) && actionVisible(action, state, registry);

export const seatOf = (id: string, action: Action, target: string): Seat => ({ ownerRef: `action.${id}`, actionSlug: actionAddress(action), target });

export interface Participant {
  self: string;
  other: string;
  action: Action;
  cadence: Cadence;
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
