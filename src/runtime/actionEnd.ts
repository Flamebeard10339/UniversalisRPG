import { clearBuffs } from './buffs';
import { type GameState, isFightScoped } from './state';

// Ending the active action is two modules' business at once -- `activeAction`
// is a field state.ts declares, and whether a holder keeps what buffs it is
// under is a rule buffs.ts owns -- so it belongs above both rather than inside
// either. It was in state.ts, which is what made the state shape import the
// buff engine.
export function endAction(state: GameState): void {
  // A copy minted for the fight vanishes with it, so what was buffing it has
  // nobody left to buff. A standing entity that fought keeps what it holds,
  // because the fight ending is not it leaving the world.
  if (state.activeAction) clearBuffs(state, Object.keys(state.activeAction.actors ?? {}).filter(isFightScoped));
  state.activeAction = null;
}

// Stopped, however it was stopped: the leg ends and the walk ends with it, so
// nothing arms the next one.
export function endJourney(state: GameState): void {
  state.journey = null;
  endAction(state);
}
