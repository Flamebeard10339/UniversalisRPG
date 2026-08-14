import { DEFAULT_RNG_SEED, RngCursor } from './rng';
import type { ActiveAction } from './encounter';
import { createInstanceTable, type InstanceTable } from './instances';
import type { Populations } from './population';
import type { Journey } from './journey';
import type { ModalFrame } from './modals';
import { type BuffTable, clearBuffs } from './buffs';

export class RuntimeError extends Error {}

// Readonly because effects.ts owns every write, and with it rollover and on-empty.
export type PoolLevels = { readonly [resourceId: string]: number };

export const PLAYER = 'player';

// A fight-scoped copy's key is its type and which copy it is. No syntax anywhere
// names one — an author writes counts — so this separator never reaches a page.
// Here beside `PLAYER` because how an actor id is spelled is one question, and
// everything that asks it sits above this file.
export const FIGHT_SCOPED = '#';

export const templateOf = (actorId: string): string => actorId.split(FIGHT_SCOPED)[0];

// A copy minted for the fight stands in no location at all, so no question
// about a place can be asked of it — it is present while the fight is.
export const isFightScoped = (actorId: string): boolean => actorId !== templateOf(actorId);

export interface GameState extends RngCursor {
  flags: Record<string, boolean | number>;
  inventory: Record<string, number>;
  location: string;
  visits: Record<string, number>;
  xp: Record<string, number>;
  log: string[];
  time: number;
  activeAction: ActiveAction | null;
  // The walk under way, and null when the player is not on one. journey.ts owns
  // the route; runtime.ts owns arming each leg off it.
  journey: Journey | null;
  // Readonly because buffs.ts owns every write, and with it stacking and expiry.
  readonly buffs: BuffTable;
  resources: PoolLevels;
  resourceRateRemainders: Record<string, number>;
  equipped: Record<string, string>;
  // instances.ts owns every write, and with it minting, pruning and liveness.
  instances: InstanceTable;
  // How many of each location's population are down and when each is due back.
  // population.ts owns every write.
  populations: Populations;
  player: { name: string; race: string };
  // Readonly because modals.ts owns every write, and with it open and close.
  modals: readonly ModalFrame[];
}

export function createGameState(location = ''): GameState {
  return { flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [], time: 0, activeAction: null, journey: null, buffs: {}, resources: {}, resourceRateRemainders: {}, equipped: {}, instances: createInstanceTable(), populations: {}, rng: DEFAULT_RNG_SEED, player: { name: '', race: '' }, modals: [] };
}

// The one seam through which simulated time advances; nothing reads a real clock.
export function advanceTime(state: GameState, milliseconds: number): void {
  if (milliseconds < 0) throw new RuntimeError(`advanceTime: milliseconds must be non-negative, got ${milliseconds}`);
  if (!Number.isInteger(milliseconds)) throw new RuntimeError(`advanceTime: milliseconds must be an integer, got ${milliseconds}`);
  state.time += milliseconds;
}

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
