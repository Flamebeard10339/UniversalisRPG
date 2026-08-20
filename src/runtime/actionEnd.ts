import { clearBuffs } from './buffs';
import { type GameState, isFightScoped } from './state';

export function endAction(state: GameState): void {
  if (state.activeAction) clearBuffs(state, Object.keys(state.activeAction.actors ?? {}).filter(isFightScoped));
  state.activeAction = null;
}

export function endJourney(state: GameState): void {
  state.journey = null;
  endAction(state);
}
