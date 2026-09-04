import { actionAddress } from '../content/sections/action';
import type { Registry } from '../content/registry';
import { endJourney } from './actionEnd';
import { RuntimeError } from './error';
import { type Localized, localizerOf } from './localized';
import { seatOf } from './roster';
import { type GameState, IMPLICIT_TARGET_FULL, newCadence, PLAYER } from './state';

export function heldByForce(state: GameState, registry: Registry): Localized | undefined {
  if (state.activeAction?.forced !== true) return undefined;
  return localizerOf(registry, state).engine('engine.forced.holds');
}

export function beginPerformNext(state: GameState, registry: Registry): boolean {
  const actionId = state.performNext;
  if (actionId === null) return false;
  state.performNext = null;
  const action = registry.actions.get(actionId);
  if (!action) throw new RuntimeError(`perform: names an unknown action: ${actionId}`);
  if (state.activeAction || state.journey) endJourney(state, localizerOf(registry, state).engine('engine.stopped.forced'));
  state.activeAction = {
    ownerRef: `action.${actionId}`,
    actionSlug: actionAddress(action),
    repeating: false,
    implicitTarget: IMPLICIT_TARGET_FULL,
    cadences: { [PLAYER]: newCadence() },
    roster: { [PLAYER]: seatOf(actionId, action, PLAYER) },
    forced: true,
  };
  return true;
}
