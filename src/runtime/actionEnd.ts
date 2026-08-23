import { clearBuffs } from './buffs';
import type { Localized } from './localized';
import { type GameState, isFightScoped } from './state';

export function endAction(state: GameState, because: Localized): void {
  if (state.activeAction) clearBuffs(state, Object.keys(state.activeAction.actors ?? {}).filter(isFightScoped));
  state.activeAction = null;
  state.endedBecause = because;
}

export function endJourney(state: GameState, because: Localized): void {
  state.journey = null;
  endAction(state, because);
}
