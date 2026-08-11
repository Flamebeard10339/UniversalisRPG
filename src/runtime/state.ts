import type { Range } from '../grammar/range';
import { DEFAULT_RNG_SEED, RngCursor } from './rng';
import type { ActiveAction } from './encounter';
import { createInstanceTable, type InstanceTable } from './instances';
import type { Populations } from './population';
import type { Journey } from './journey';
import type { ModalFrame } from './modals';

export class RuntimeError extends Error {}

// Readonly because effects.ts owns every write, and with it rollover and on-empty.
export type PoolLevels = { readonly [resourceId: string]: number };

export const PLAYER = 'player';

interface TimedModifier {
  statId: string;
  expiresAt: number;
}
export type ActiveBuff =
  | (TimedModifier & { kind: 'added'; amount: Range })
  | (TimedModifier & { kind: 'increased'; amount: number });

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
  activeBuffs: Record<string, ActiveBuff>;
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
  return { flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [], time: 0, activeAction: null, journey: null, activeBuffs: {}, resources: {}, resourceRateRemainders: {}, equipped: {}, instances: createInstanceTable(), populations: {}, rng: DEFAULT_RNG_SEED, player: { name: '', race: '' }, modals: [] };
}

// The one seam through which simulated time advances; nothing reads a real clock.
export function advanceTime(state: GameState, milliseconds: number): void {
  if (milliseconds < 0) throw new RuntimeError(`advanceTime: milliseconds must be non-negative, got ${milliseconds}`);
  if (!Number.isInteger(milliseconds)) throw new RuntimeError(`advanceTime: milliseconds must be an integer, got ${milliseconds}`);
  state.time += milliseconds;
}

export function endAction(state: GameState): void {
  state.activeAction = null;
}

// Stopped, however it was stopped: the leg ends and the walk ends with it, so
// nothing arms the next one.
export function endJourney(state: GameState): void {
  state.journey = null;
  state.activeAction = null;
}
