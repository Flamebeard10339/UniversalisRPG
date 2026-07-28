import { Action } from './entity';
import { addRanges, isPoint, midpoint, point, Range, sampleRange, scaleRange } from './range';
import { findActiveAction } from './actions';
import { Registry } from './registry';
import { nextRandom } from './rng';
import { GameState, PLAYER, RuntimeError } from './state';
import { contestSpread, minDamage } from './tuning';

// Stat algebra: what a stat is worth right now, for whom, and what that buys in
// a contest. Nothing here writes state except the RNG cursor a sample consumes.

// THE opposed roll — every contested outcome in the game runs through it: a
// sword landing, a dish coming out cooked rather than burnt, a lock giving.
// A logistic curve on the gap between the two stats, so equal stats are a coin
// flip, +spread wins ~91%, +2×spread ~99%, and no gap ever reaches certainty in
// either direction.
//
// A stat is deliberately never readable as a raw probability. The chance of
// succeeding at something is always derived from that thing's difficulty
// against the actor's skill, which puts difficulty in a stat where gear, buffs
// and levels can move it — an authored 0.7 would be inert.
export function hitChance(accuracy: number, evasion: number, registry: Registry): number {
  return 1 / (1 + 10 ** ((evasion - accuracy) / contestSpread(registry)));
}

// (base + Σ(added)) × (1 + Σ(increased)), as an interval: base and the flat
// bonuses may each be a range, and they are summed endpoint-wise into a single
// interval that is sampled ONCE. Scaling the interval by the increased factor
// before sampling is the same distribution as scaling a sample of it, so this
// is exactly the authored rule `sample(base + Σadded) × (1 + Σincreased)`.
//
// Modifiers come from two sources, both flowing through the same math: timed
// buffs (eaten food / future equipment), and the currently-active action's own
// stat-bonus tags — which act as modifiers ONLY while that action runs (they
// vanish the instant activeAction clears, with no add/remove bookkeeping). This
// is how an action drains or boosts a resource: e.g. an attack tagged
// `-5 regeneration` pushes the health pool's rate stat negative for the fight's
// duration and nothing more.
//
// Note a percent bonus multiplies whatever flat bonuses are present, so `+10%
// dr` with no added dr is deliberately nothing at all (0 × 1.1 = 0).
export function statRange(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): Range {
  // An actor's own `stats:` block replaces the global default; the player names
  // nothing and so reads the default for everything.
  let added = registry.entities.get(actorId)?.stats[statId] ?? registry.stats.get(statId)?.base ?? point(0);
  let increased = 0;
  // Buffs and the active action's tags are the PLAYER's: food the player ate,
  // and the action the player is performing. A non-player actor carries neither
  // in this pass, so it reads its declared sheet and nothing else.
  if (actorId === PLAYER) {
    for (const buff of Object.values(state.activeBuffs)) {
      if (buff.statId !== statId) continue;
      if (buff.kind === 'added') added = addRanges(added, buff.amount);
      else increased += buff.amount;
    }
    if (state.activeAction) {
      const action = findActiveAction(state.activeAction, registry);
      for (const tag of action.tags ?? []) {
        if (tag.kind !== 'stat-bonus' || tag.statId !== statId) continue;
        if (tag.percent) increased += tag.amount / 100;
        else added = addRanges(added, tag.amount);
      }
    }
  }
  return scaleRange(added, 1 + increased);
}

// The stat's deterministic value: its expected value, identical to the stat
// itself whenever nothing about it is ranged. Everything that needs a number
// without consuming randomness reads this — pool maxima, rates, attempt
// durations — so a ranged stat can never make a duration or a ceiling jitter.
export function statValue(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): number {
  return midpoint(statRange(statId, state, registry, actorId));
}

// One roll of the stat, for the per-attempt uses where the range is the point
// (damage, damage reduction). RNG contract: this consumes exactly one draw when
// the stat's interval is non-degenerate and none at all when it isn't — a count
// that is a deterministic function of state, which is what keeps resolve()
// associative (see the invariant on resolve()).
export function sampleStat(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): number {
  const range = statRange(statId, state, registry, actorId);
  return isPoint(range) ? range.min : sampleRange(range, nextRandom(state));
}

// Flat damage reduction: `dr` is an ordinary stat, subtracted from the incoming
// hit, and the result truncates to an int. The floor is not balance tuning —
// `escapeAfter` defaults to Infinity, so a fight whose damage reaches 0 would
// never deplete the target and never end, locking the player in the action with
// time advancing and nothing to show for it.
export function hitDamage(attack: number, dr: number, registry: Registry): number {
  return Math.max(minDamage(registry), Math.trunc(attack - dr));
}

// The one place a duration is divided by a speed stat, and therefore the one
// place that division can go wrong. A speed of 0 is an ordinary authoring
// accident — a typo'd stat id reads 0 (statRange falls through to point(0)), and
// so does a declared `# stat` with no `base:` — and it yields Infinity, which
// every downstream `<= 0` guard happily passes. That poisons state.time and NaNs
// the whole activeAction, and NaN serializes to null, so the wreck survives a
// save round-trip instead of failing loudly. It fails loudly here instead.
//
// Zero stays legal: an action with no `time:` is instant, which is a real thing.
export function attemptDuration(action: Action, state: GameState, registry: Registry, actorId: string = PLAYER): number {
  const speed = action.speed ? statValue(action.speed, state, registry, actorId) : 1;
  const duration = (action.time ?? 0) / speed;
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RuntimeError(
      `action ${action.label} resolved an impossible attempt duration (${duration}) from time: ${action.time ?? 0} and speed stat ${action.speed ?? '1'} = ${speed}`,
    );
  }
  return duration;
}
