import type { Range } from './range';
import { DEFAULT_RNG_SEED, RngCursor } from './rng';
import type { ActiveAction } from './encounter';

export class RuntimeError extends Error {}

// Current level of each `# resource` pool, keyed by resource id. The pool's max
// is not stored — it's always derived live via statValue(resource.max), so a
// +max buff raises the ceiling without rewriting saved state.
//
// Readonly on purpose: effects.ts owns every write, and a level that moved any
// other way skipped the rollover and on-empty rules. That was a rule held by
// vigilance and it had already drifted once; here it is a type error.
export type PoolLevels = { readonly [resourceId: string]: number };

// Who a stat or a pool belongs to. Actors are addressed by entity id; the player
// is this reserved id and simply has no `# entity`, so every base it reads falls
// through to the global `# stat` defaults.
export const PLAYER = 'player';

// A timed stat modifier (from eating food, etc). `added` sums flat onto the
// stat's base and may be a range (`+3-6 attack`); `increased` sums as a
// fraction applied multiplicatively and never is (see statRange).
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
  player: { name: string; race: string };
  // Set by `open-modal`, cleared once the driver (session/play-cli) collects
  // whatever the modal needed and calls back in (e.g. submitModal).
  pendingModal?: string;
}

export function createGameState(location = ''): GameState {
  return { flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [], time: 0, activeAction: null, activeBuffs: {}, resources: {}, rng: DEFAULT_RNG_SEED, player: { name: '', race: '' } };
}

// The single seam through which simulated time advances: the pure runtime
// never reads a real clock, it only moves forward when something calls this.
export function advanceTime(state: GameState, seconds: number): void {
  if (seconds < 0) throw new RuntimeError(`advanceTime: seconds must be non-negative, got ${seconds}`);
  state.time += seconds;
}

// THE one way an action ends, so what "ending" means has a single definition
// rather than nine copies of one assignment. Ending is rarely the resolver's own
// decision — a `stop` result, an input running out, a boundary firing, a max
// shrinking to nothing, a player cancel all reach it — and each of those used to
// write the field itself.
export function endAction(state: GameState): void {
  state.activeAction = null;
}
