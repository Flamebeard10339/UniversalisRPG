import type { Range } from '../grammar/range';
import { DEFAULT_RNG_SEED, RngCursor } from './rng';
import type { ActiveAction } from './encounter';

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
  activeBuffs: Record<string, ActiveBuff>;
  resources: PoolLevels;
  resourceRateRemainders: Record<string, number>;
  equipped: Record<string, string>;
  player: { name: string; race: string };
  pendingModal?: string;
}

export function createGameState(location = ''): GameState {
  return { flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [], time: 0, activeAction: null, activeBuffs: {}, resources: {}, resourceRateRemainders: {}, equipped: {}, rng: DEFAULT_RNG_SEED, player: { name: '', race: '' } };
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
