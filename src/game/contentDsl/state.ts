import type { Range } from './range';
import type { ActiveAction } from './runtime';

export class RuntimeError extends Error {}

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

export interface GameState {
  flags: Record<string, boolean | number>;
  inventory: Record<string, number>;
  location: string;
  visits: Record<string, number>;
  xp: Record<string, number>;
  log: string[];
  time: number;
  activeAction: ActiveAction | null;
  activeBuffs: Record<string, ActiveBuff>;
  // Current level of each `# resource` pool, keyed by resource id. The pool's
  // max is not stored — it's always derived live via statValue(resource.max),
  // so a +max buff raises the ceiling without rewriting saved state. Populated
  // from each resource's start value by initResources (createGameState leaves it
  // empty because it has no registry).
  resources: Record<string, number>;
  // Deterministic PRNG cursor, advanced only when resolving an attempt of an
  // `accuracy` action — deterministic actions never draw. Living in state (not a
  // parameter) counts draws in attempt order regardless of how a caller splits a
  // resolve() span; see the associativity invariant on resolve().
  rng: number;
  player: { name: string; race: string };
  // Set by `open-modal`, cleared once the driver (session/play-cli) collects
  // whatever the modal needed and calls back in (e.g. submitModal).
  pendingModal?: string;
}

const DEFAULT_RNG_SEED = 20260718;

export function createGameState(location = ''): GameState {
  return { flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [], time: 0, activeAction: null, activeBuffs: {}, resources: {}, rng: DEFAULT_RNG_SEED, player: { name: '', race: '' } };
}

// The single seam through which simulated time advances: the pure runtime
// never reads a real clock, it only moves forward when something calls this.
export function advanceTime(state: GameState, seconds: number): void {
  if (seconds < 0) throw new RuntimeError(`advanceTime: seconds must be non-negative, got ${seconds}`);
  state.time += seconds;
}
