import {
  actionStillValid,
  actionVisible,
  fightBatch,
  findActionOwner,
  findActiveAction,
  FightOutcome,
  inputLimit,
  parseOwnerRef,
  requiresMet,
  resolvesPerAttempt,
  stopsOnOutcome,
  travelAction,
} from './actions';
import {
  applyResults,
  applyResultsNow,
  captureResourceRates,
  clampResources,
  EPSILON,
  SECONDS_PER_MINUTE,
  Segment,
  settlePools,
} from './effects';
import {
  ActiveAction,
  damagePool,
  enterEncounter,
  logSwing,
  newCadence,
  Participant,
  participants,
  playerCadence,
  poolLevel,
} from './encounter';
import { Action } from './entity';
import { Item } from './item';
import { Recipe } from './recipe';
import { Registry } from './registry';
import { nextRandom } from './rng';
import { advanceTime, endAction, GameState, PLAYER, RuntimeError } from './state';
import { attemptDuration, hitChance, hitDamage, sampleStat, statValue } from './stats';
import { TagClause } from './tagClause';

// The engine's public surface is this module: the resolver and the verbs live
// here, and everything the drivers also need is re-exported from wherever it
// actually lives. The one deliberate omission is the loader — loadModule and
// Registry belong to the content pipeline, and consumers import them from
// registry.ts.
export { advanceTime, createGameState, endAction, PLAYER, RuntimeError } from './state';
export type { ActiveBuff, GameState } from './state';
export { contestSpread, minDamage, travelSecondsPerUnit } from './tuning';
export { describeCondition, evaluateCondition, renderSegments } from './conditions';
export { actionVisible, requiresMet } from './actions';
export { hitChance, hitDamage, sampleStat, statRange, statValue } from './stats';
export { applyResultsNow, initResources } from './effects';
export { encounterView } from './encounter';
export type { ActiveAction, ActorState, Cadence, EncounterFoe, EncounterView } from './encounter';
export { choose, talk } from './dialogue-runtime';
export type { DialogueSession } from './dialogue-runtime';


interface FightParams {
  duration: number; // seconds per attempt
  abilityAmount: number; // health subtracted per successful attempt
  escapeAfter: number; // raw escape-after threshold (Infinity if absent)
}

// A deterministic (no-accuracy) fight has a closed-form length and end,
// computed assuming every attempt hits. These two fields are meaningless once
// an attempt can miss, so only the deterministic path takes a DeterministicFightPlan
// — the stochastic path decides completion vs escape per attempt at runtime
// (resolveStochasticSegment) off the plain FightParams.
interface DeterministicFightPlan extends FightParams {
  attemptsToResolve: number; // attempts to end one fight
  outcome: FightOutcome; // which end the fight reaches first
}

function fightParams(action: Action, state: GameState, registry: Registry): FightParams {
  return {
    duration: attemptDuration(action, state, registry),
    abilityAmount: action.ability ? statValue(action.ability, state, registry) : 1,
    escapeAfter: action.escapeAfter ?? Infinity,
  };
}

function fightPlan(action: Action, state: GameState, registry: Registry): DeterministicFightPlan {
  const params = fightParams(action, state, registry);
  const neededForCompletion = Math.ceil((action.health ?? 1) / params.abilityAmount);
  return {
    ...params,
    attemptsToResolve: Math.min(neededForCompletion, params.escapeAfter),
    outcome: neededForCompletion <= params.escapeAfter ? 'completion' : 'escape',
  };
}


// The earliest instant in [state.time, toTime] at which something discrete
// must happen (a buff expiring, a repeating action running out of input, a
// non-repeating action completing, a draining pool with `on empty` hitting 0),
// or toTime if nothing does — what lets resolve() cross a huge idle span in one
// step.
function nextBoundary(state: GameState, registry: Registry, toTime: number): number {
  let boundary = toTime;
  for (const buff of Object.values(state.activeBuffs)) {
    if (buff.expiresAt < boundary) boundary = buff.expiresAt;
  }
  if (state.activeAction) {
    const action = findActiveAction(state.activeAction, registry);
    // A stochastic action (accuracy) has no closed-form boundary — fight length
    // is random. resolveStochasticSegment simulates it attempt-by-attempt,
    // bounded only by whatever buff-expiry/toTime already gives.
    if (!resolvesPerAttempt(action)) {
      const { duration, attemptsToResolve, outcome } = fightPlan(action, state, registry);
      const player = playerCadence(state.activeAction);
      const remainingAttempts = attemptsToResolve - player.attemptsMade;
      // An action that stops on its own outcome is, for boundary purposes, not
      // repeating: it ends at its first completion, so the segment must land
      // there. Otherwise the span would batch straight past the stop with the
      // action's stat modifiers snapshotted for the whole of it.
      if (state.activeAction.repeating && !stopsOnOutcome(action, outcome)) {
        const limit = inputLimit(action, state).completions;
        if (Number.isFinite(limit)) {
          // Time to finish the fight already in flight, plus (limit - 1)
          // more full fights after it — generalizes the old
          // `limit * duration - progress` to attempt-scoped progress.
          const runway = remainingAttempts * duration - player.progress + Math.max(0, limit - 1) * attemptsToResolve * duration;
          const limitInstant = state.time + Math.max(0, runway);
          if (limitInstant < boundary) boundary = limitInstant;
        }
      } else {
        const completionInstant = state.time + Math.max(0, remainingAttempts * duration - player.progress);
        if (completionInstant < boundary) boundary = completionInstant;
      }
    }
  }
  // A draining pool with an `on empty` handler must break the segment exactly
  // when it hits 0, so onEmpty fires once at the right instant. A pool without
  // an on-empty handler just clamps silently and needs no boundary; nor does a
  // filling pool (its rollover is closed-form and associative in-segment).
  for (const resource of registry.resources.values()) {
    if (resource.onEmpty.length === 0 || !resource.rate) continue;
    const ratePerMinute = statValue(resource.rate, state, registry);
    if (ratePerMinute >= 0) continue;
    const current = state.resources[resource.id] ?? 0;
    if (current <= EPSILON) continue;
    const drainPerSecond = -ratePerMinute / SECONDS_PER_MINUTE;
    const emptyInstant = state.time + current / drainPerSecond;
    if (emptyInstant < boundary) boundary = emptyInstant;
  }
  return boundary;
}

// Advances state.time to segEnd for a deterministic action (no accuracy —
// outcome and fight length known in closed form). Whole fights this segment
// covers are applied as one batch; the remainder is carried as
// attemptsMade/healthRemaining/progress for the fight still in flight.
function resolveDeterministicSegment(segment: Segment, action: Action, segEnd: number): void {
  const { state, registry } = segment;
  const active = state.activeAction!;
  const segLen = segEnd - state.time;
  const { duration, abilityAmount, attemptsToResolve, outcome } = fightPlan(action, state, registry);
  const health = action.health ?? 1;

  if (active.repeating && duration <= 0) {
    throw new RuntimeError(`repeating action ${active.ownerRef}.${active.actionLabel} resolved a non-positive duration (${duration}) — give it a positive time: or a positive speed stat`);
  }

  const player = playerCadence(active);
  const totalAttemptTime = player.progress + segLen;
  const attemptsThisSegment = duration > 0 ? Math.floor(totalAttemptTime / duration) : 0;
  const newProgress = totalAttemptTime - attemptsThisSegment * duration;

  if (active.repeating) {
    const totalAttempts = player.attemptsMade + attemptsThisSegment;
    const fights = Math.floor(totalAttempts / attemptsToResolve);
    const remainder = totalAttempts - fights * attemptsToResolve;
    const batch = fightBatch(action, fights, outcome);
    applyResults(segment, batch.results, batch.count);
    // The batch capped itself at one completion and that completion asked to
    // stop: the action ends here rather than carrying a remainder it will never
    // swing. nextBoundary put segEnd on this instant, so time is already right.
    if (segment.stopped) {
      endAction(state);
      return;
    }
    player.attemptsMade = remainder;
    active.healthRemaining = health - remainder * abilityAmount;
    player.progress = newProgress;
  } else {
    // A non-repeating fight fires its single outcome as a boundary event
    // (applyDueBoundaries) once attemptsMade reaches attemptsToResolve —
    // clamped here, never wrapped, so that check can still see it.
    player.attemptsMade = Math.min(player.attemptsMade + attemptsThisSegment, attemptsToResolve);
    active.healthRemaining = health - player.attemptsMade * abilityAmount;
    player.progress = newProgress;
  }
}

// Resolves one participant's attempt: the hit roll, then damage against
// whatever pool it targets. Returns whether that pool is now empty.
//
// Draws happen in a fixed order — hit roll, damage roll, reduction roll — and an
// action with no accuracy stat cannot miss and draws nothing for the first. The
// count per attempt is therefore a function of state alone, which is what lets
// per-attempt randomness live under resolve()'s associativity invariant. The
// opposed roll costs nothing extra here: both sides of the contest are read
// with statValue (no draw), so it only changes what the one uniform is compared
// against. Sampling them instead would put the range roll and the contest roll
// in the same decision, which is two sources of variance for one outcome.
function resolveAttempt(participant: Participant, segment: Segment): boolean {
  const { state, registry } = segment;
  const { self, other, action, cadence } = participant;
  cadence.progress = 0;
  cadence.attemptsMade++;

  const hit =
    action.accuracy === undefined ||
    nextRandom(state) <
      hitChance(
        statValue(action.accuracy, state, registry, self),
        action.evasion ? statValue(action.evasion, state, registry, other) : 0,
        registry,
      );

  if (!action.target) {
    if (hit) state.activeAction!.healthRemaining -= fightParams(action, state, registry).abilityAmount;
    return state.activeAction!.healthRemaining <= EPSILON;
  }

  if (hit) {
    const dealt = hitDamage(
      action.ability ? sampleStat(action.ability, state, registry, self) : 1,
      action.dr ? sampleStat(action.dr, state, registry, other) : 0,
      registry,
    );
    logSwing(state, registry, self, other, dealt);
    return damagePool(state, registry, other, action.target, dealt, segment.deltas) <= EPSILON;
  }
  logSwing(state, registry, self, other, null);
  return poolLevel(state, registry, other, action.target) <= EPSILON;
}

// Advances state.time to segEnd attempt-by-attempt, which is what an action with
// a miss chance or with sampled damage requires (neither has a closed form to
// batch). Every participant swings on its own clock, so the loop is an event
// queue: jump to whichever attempt lands soonest, credit that span to EVERY
// participant's progress, and resolve just the one that came due. A 2.4s player
// and a 3.75s rat interleave naturally out of that, with no shared tick.
//
// O(attempts) is bounded by segment length and input affordability.
function resolveStochasticSegment(segment: Segment, action: Action, segEnd: number): void {
  const { state, registry } = segment;
  const active = state.activeAction!;

  for (;;) {
    if (!actionStillValid(action, active, state)) {
      endAction(state);
      return;
    }

    const roster = participants(state, registry, action);
    let next: Participant | undefined;
    let nextAt = Infinity;
    for (const participant of roster) {
      const duration = attemptDuration(participant.action, state, registry, participant.self);
      if (duration <= 0) {
        throw new RuntimeError(`action ${active.ownerRef}.${participant.action.label} resolved a non-positive attempt duration (${duration}) — give it a positive time: or a positive speed stat`);
      }
      // Elapsed progress carries in absolute seconds, so a rate raised mid-swing
      // shortens what remains of the swing already under way. Progress accrues
      // across arbitrarily many segments and can land a hair past its duration,
      // so an overdue swing is floored at "now" rather than allowed to compute
      // an instant in the past.
      const at = state.time + Math.max(0, duration - participant.cadence.progress);
      // Strictly-sooner-by-EPSILON: a genuine tie (2.4s and 3.75s cadences do
      // collide, at t=60) falls to roster order rather than to float noise.
      if (at < nextAt - EPSILON) {
        next = participant;
        nextAt = at;
      }
    }

    if (!next || nextAt > segEnd) {
      // Nothing comes due inside this segment: credit the whole span and stop.
      // A later resolve() picks up exactly here.
      const elapsed = segEnd - state.time;
      for (const participant of roster) participant.cadence.progress += elapsed;
      advanceTime(state, elapsed);
      return;
    }

    const elapsed = nextAt - state.time;
    for (const participant of roster) participant.cadence.progress += elapsed;
    advanceTime(state, elapsed);

    const depleted = resolveAttempt(next, segment);

    // Only the player's swing decides the fight: its action owns the results,
    // the escape counter and the repeat. A retaliation is only a damage source.
    if (next.self !== PLAYER) {
      // Except when it empties the pool it drains: the segment ends right here
      // so that pool settles at the instant it ran out rather than at whatever
      // distant instant the caller's span happens to end. That is what lets its
      // `on empty:` block fire on time — and whether running out is fatal to the
      // fight is the block's call, via `stop`, not the resolver's.
      if (depleted || state.time >= segEnd) return;
      continue;
    }

    let fightOutcome: FightOutcome | null = null;
    if (depleted) fightOutcome = 'completion';
    else if (playerCadence(active).attemptsMade >= (action.escapeAfter ?? Infinity)) fightOutcome = 'escape';

    if (fightOutcome) {
      const batch = fightBatch(action, 1, fightOutcome);
      applyResults(segment, batch.results, batch.count);
      // The outcome asked to stop, so nothing rearms and this local `active`
      // goes out of scope still holding the fight it just ended. Reading the
      // flag here is what keeps it and state.activeAction from disagreeing —
      // the next participants() would dereference the null.
      if (segment.stopped) {
        endAction(state);
        return;
      }
      if (active.repeating) {
        // A fresh target steps up: pools refilled from its own stats, clock
        // restarted, so it does not inherit the dead one's half-finished swing.
        if (action.target) enterEncounter(active, next.other, state, registry);
        else active.healthRemaining = action.health ?? 1;
        playerCadence(active).attemptsMade = 0;
      } else {
        grantActionFoodBuff(state, registry);
        endAction(state);
        return;
      }
    }

    if (state.time >= segEnd) return;
  }
}

function resolveSegment(state: GameState, registry: Registry, segEnd: number): void {
  const start = state.time;
  // Snapshot resource rates now, while the active action's modifiers are still
  // in force — the stochastic path can clear the action before we integrate.
  const snapshots = captureResourceRates(state, registry);
  const segment: Segment = { state, registry, deltas: new Map(), stopped: false };

  if (!state.activeAction) {
    advanceTime(state, segEnd - start);
  } else {
    const action = findActiveAction(state.activeAction, registry);
    if (resolvesPerAttempt(action)) {
      resolveStochasticSegment(segment, action, segEnd);
    } else {
      resolveDeterministicSegment(segment, action, segEnd);
      advanceTime(state, segEnd - state.time);
    }
  }

  // Settle over the time the segment actually consumed: a stochastic action
  // that exhausts its input mid-segment stops early, and its untouched tail
  // resolves as a later action-less segment where rates are re-snapshotted (so
  // an action's drain stops the instant the action does).
  const elapsed = state.time - start;
  if (elapsed > 0 || segment.deltas.size > 0) settlePools(state, registry, snapshots, Math.max(0, elapsed), segment.deltas);
}

// Fires whatever is due exactly at `at` and keeps re-checking until nothing
// more is due at that same instant (e.g. a buff expiring the moment an
// action also completes). Also what lets a zero-duration action fire its
// completion immediately, before resolve() has consumed any segment at all.
function applyDueBoundaries(state: GameState, registry: Registry, at: number): void {
  for (;;) {
    let changed = false;

    for (const key of Object.keys(state.activeBuffs)) {
      if (state.activeBuffs[key].expiresAt <= at) {
        delete state.activeBuffs[key];
        changed = true;
      }
    }

    if (state.activeAction) {
      const action = findActiveAction(state.activeAction, registry);
      if (!actionStillValid(action, state.activeAction, state)) {
        endAction(state);
        changed = true;
      } else if (!resolvesPerAttempt(action)) {
        // A per-attempt action fires and rearms itself inside
        // resolveStochasticSegment — nothing else is due here for it.
        if (!state.activeAction.repeating) {
          const { duration, attemptsToResolve, outcome } = fightPlan(action, state, registry);
          // duration <= 0 means every attempt is instantaneous — fire
          // immediately regardless of attemptsMade. This is the only place a
          // zero-`time:` action fires: its toTime === state.time in useAction,
          // so resolveSegment's closed form never runs to advance attemptsMade.
          if (playerCadence(state.activeAction).attemptsMade >= attemptsToResolve || duration <= 0) {
            const batch = fightBatch(action, 1, outcome);
            applyResultsNow(state, registry, batch.results, batch.count);
            grantActionFoodBuff(state, registry);
            endAction(state);
            changed = true;
          }
        }
      }
    }

    if (!changed) {
      // Once the boundary has settled, re-clamp pools so a max shrunk by an
      // expired buff can't leave one above its new ceiling.
      clampResources(state, registry);
      return;
    }
  }
}

// THE single seam every driver (REPL, session, a future live loop) calls to
// advance simulated time. Core invariant (proved in resolve.test.ts):
// resolve(resolve(s, t1), t2) === resolve(s, t2) for t1 <= t2 — one big jump
// equals any sequence of smaller steps to the same target. It walks forward in
// segments bounded by the next discrete event, never fixed dt steps, so a
// deterministic segment resolves in closed form. Randomness (accuracy actions)
// is drawn only from state.rng at attempt boundaries, in strict attempt order,
// so splitting the call can't change which draw powers which attempt. Resource
// pools (Pass 2) integrate per segment at a constant per-minute rate and stay
// associative the same way — with two accepted, bounded limitations: an `on
// full` handler is assumed segment-preserving (inventory/counter/say; one that
// mutated a rate-referenced stat would be non-associative), and a stochastic
// (accuracy) action whose modifier empties a pool mid-fight fires `on empty` at
// segment granularity, not the exact fractional attempt instant (deterministic
// paths are exact — nextBoundary lands the segment on the emptying instant).
export function resolve(state: GameState, registry: Registry, toTime: number): void {
  if (toTime < state.time) throw new RuntimeError(`resolve: toTime (${toTime}) must be >= state.time (${state.time})`);
  applyDueBoundaries(state, registry, state.time);
  while (state.time < toTime) {
    const segEnd = nextBoundary(state, registry, toTime);
    resolveSegment(state, registry, segEnd);
    // Boundaries are settled at the instant the segment actually reached, not
    // at the one it was aimed at: a segment can stop short (input exhausted, a
    // pool emptied), and firing at segEnd would expire buffs that still had
    // time left on them.
    applyDueBoundaries(state, registry, state.time);
  }
}

// Turns the inert `food, +N <stat>, <duration>` item tags into live buffs:
// eating (an item action that take:s the item it's defined on) grants each
// stat-bonus tag as a timed buff whose clock starts when eating completes.
function grantFoodBuff(item: Item, state: GameState): void {
  if (!item.tags.some((tag) => tag.kind === 'keyword' && tag.value === 'food')) return;

  const durationTag = item.tags.find((tag): tag is Extract<TagClause, { kind: 'duration' }> => tag.kind === 'duration');
  const duration = durationTag?.seconds ?? 0;

  for (const tag of item.tags) {
    if (tag.kind !== 'stat-bonus') continue;
    const expiresAt = state.time + duration;
    state.activeBuffs[`${item.id}:${tag.statId}`] = tag.percent
      ? { statId: tag.statId, kind: 'increased', amount: tag.amount / 100, expiresAt }
      : { statId: tag.statId, kind: 'added', amount: tag.amount, expiresAt };
  }
}

// The action in flight, if it is an item eating itself, grants that item's food
// tags — called as the action COMPLETES, which is where the buff's clock has to
// start and, more to the point, the one moment both ways of starting an action
// pass through. Hanging it off useAction instead meant a food whose eat action
// carried a `time:` buffed correctly in instant mode and not at all in --live,
// because beginAction arms directly and never returns through useAction. Every
// food in the tutorial happens to be instant, which is the only reason that
// never showed.
function grantActionFoodBuff(state: GameState, registry: Registry): void {
  const active = state.activeAction;
  if (!active) return;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  if (obj !== 'item') return;
  const item = registry.items.get(objId);
  if (!item) return;
  // Eating is the item consuming itself. A repeating action isn't a meal.
  if (active.repeating) return;
  if (!findActiveAction(active, registry).results.some((r) => r.kind === 'take' && r.item === objId)) return;
  grantFoodBuff(item, state);
}

// Result of arming a spannable action/craft: `armed: false` means a take-gate
// failure already logged its onFailure/shortfall message (nothing to resolve);
// `armed: true` means state.activeAction is now set and `firstUnit` is the
// span (from state.time) the *first* natural unit of play covers — a caller
// that wants the instant behavior of today calls resolve() with it right
// away, a live driver instead drives `wait()` toward it over real time.
type ArmResult = { armed: true; firstUnit: number } | { armed: false };

// Everything useAction did before its resolve() call: gating (requires/
// hiddenIf throw, take-affordability failure logs and returns un-armed) and
// arming state.activeAction. Extracted so a live driver can arm a spannable
// action WITHOUT resolving its first unit instantly (see actionFirstUnit for
// the side-effect-free duration probe that decides whether to do so).
// The first natural unit of play from state.time: one full fight when it's
// closed-form (deterministic), or just the first attempt when it isn't
// (stochastic — fight length is random, so there's no fixed span to jump to).
function firstUnitSpan(action: Action, state: GameState, registry: Registry): number {
  const duration = attemptDuration(action, state, registry);
  return resolvesPerAttempt(action) ? duration : fightPlan(action, state, registry).attemptsToResolve * duration;
}

export function armAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): ArmResult {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!target) throw new RuntimeError(`unknown ${obj}: ${objId}`);

  const action = target.actions?.find((a) => a.label === actionId);
  if (!action) throw new RuntimeError(`unknown action ${JSON.stringify(actionId)} on ${obj}.${objId}`);
  if (!requiresMet(action, state)) throw new RuntimeError(`action requires unmet: ${obj}.${objId}.${actionId}`);
  if (!actionVisible(action, state)) throw new RuntimeError(`action hidden: ${obj}.${objId}.${actionId}`);

  // take: implies affordability — checked once up front for one completion's
  // worth; this only gates whether the action may START. A repeating action
  // running out of input mid-flight is handled in resolve()'s limiting math,
  // not here, and ends quietly without firing onFailure.
  const { short: shortfall } = inputLimit(action, state);
  if (shortfall !== undefined) {
    if (action.onFailure) applyResultsNow(state, registry, action.onFailure);
    else state.log.push(`You don't have enough ${registry.items.get(shortfall)?.title ?? shortfall}.`);
    return { armed: false };
  }

  const repeating = action.repeating === true;
  const duration = attemptDuration(action, state, registry);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`repeating action ${obj}.${objId}.${actionId} needs a positive time: after speed scaling`);
  }

  // The player's clock goes in first, which fixes it as the tie-break winner
  // when two cadences come due at the same instant (see participants).
  const active: ActiveAction = { ownerRef: `${obj}.${objId}`, actionLabel: actionId, repeating, healthRemaining: action.health ?? 1, cadences: { [PLAYER]: newCadence() } };
  state.activeAction = active;
  // A `target:` action opens an encounter: the thing being fought joins with its
  // own pools, filled from its own stats, and its own clock if it swings back.
  if (action.target) enterEncounter(active, objId, state, registry);
  return { armed: true, firstUnit: firstUnitSpan(action, state, registry) };
}

// Side-effect-free probe: the same firstUnit armAction would compute, without
// arming or mutating anything, so a driver can decide instant-vs-spannable
// before committing to arm. Returns 0 if the action can't be found — a
// caller then falls back to the instant path, which reproduces whatever
// error/behavior looking it up for real would have produced.
export function actionFirstUnit(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): number {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  const action = target?.actions?.find((a) => a.label === actionId);
  if (!action) return 0;
  return firstUnitSpan(action, state, registry);
}

// Arms and resolves the first unit in one call — the instant/agent path. The
// food-buff-on-eating side effect used to live here; it now hangs off the
// action's completion inside resolve() (grantActionFoodBuff), which is the one
// moment this path and beginAction's armed path both reach.
export function useAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): void {
  const armed = armAction(obj, objId, actionId, registry, state);
  if (!armed.armed) return;
  resolve(state, registry, state.time + armed.firstUnit);
}

// Travel wrappers: adapt an (origin, dest) pair to the generic action machinery
// through the synthetic `travel` owner (travelAction / findActionOwner), so
// travel gains spannable/real-time behavior with no bespoke resolver. A journey
// from an unset origin (a fresh state that has never been anywhere, e.g. a test
// that travels before startSession) is a plain placement, not a journey.

// Side-effect-free probe of a journey's span; 0 for an unset origin so callers
// route it through the instant path (which just places the player).
export function travelFirstUnit(origin: string, dest: string, registry: Registry, state: GameState): number {
  if (!origin) return 0;
  const { label } = travelAction(origin, dest, registry);
  return actionFirstUnit('travel', `${origin}.${dest}`, label, registry, state);
}

// Arms the journey without resolving it, for a live driver to advance over real
// time. Only called with a real origin (a distance-0 or unset journey takes the
// instant path instead, see beginAction).
export function armTravel(origin: string, dest: string, registry: Registry, state: GameState): void {
  const { label } = travelAction(origin, dest, registry);
  armAction('travel', `${origin}.${dest}`, label, registry, state);
}

// Arms and resolves the journey in one call (instant in real time, sim-time
// accrues) — the agent-CLI / test path, mirroring useAction/craft.
export function useTravel(origin: string, dest: string, registry: Registry, state: GameState): void {
  if (!origin) {
    state.location = dest;
    return;
  }
  const { label } = travelAction(origin, dest, registry);
  useAction('travel', `${origin}.${dest}`, label, registry, state);
}

export function recipeCraftable(recipe: Recipe, registry: Registry, state: GameState): boolean {
  // Through the compiled action, not `recipe.in`: recipeAction turns those
  // inputs into the take: results the rest of the engine bounds a craft by, so
  // reading them here again would be the same list under two owners.
  const action = registry.recipeActions.get(recipe.id);
  if (!action) throw new RuntimeError(`unknown recipe: ${recipe.id}`);
  if (inputLimit(action, state).short !== undefined) return false;
  if (recipe.requiresCapability) {
    const loc = registry.locations.get(state.location);
    if (!loc) return false;
    const provided = loc.entities.some((entityId) => registry.entities.get(entityId)?.capabilities.includes(recipe.requiresCapability!));
    if (!provided) return false;
  }
  return true;
}

// A craft is a spannable action on the synthetic `recipe` owner (see
// findActionOwner), so it arms through the generic armAction — exactly like
// travel delegates through armTravel. The only craft-specific step is the
// recipeCraftable gate (inputs + station capability), which armAction's
// take-gate doesn't cover; once that passes the compiled recipe Action already
// carries `in:`→take, so armAction's own affordability check never trips
// (this ArmResult never comes back armed: false today).
export function armCraft(recipeId: string, registry: Registry, state: GameState): ArmResult {
  const recipe = registry.recipes.get(recipeId);
  if (!recipe) throw new RuntimeError(`unknown recipe: ${recipeId}`);
  if (!recipeCraftable(recipe, registry, state)) throw new RuntimeError(`recipe not craftable: ${recipeId}`);
  const action = registry.recipeActions.get(recipeId)!;
  return armAction('recipe', recipeId, action.label, registry, state);
}

// Side-effect-free probe delegating to actionFirstUnit through the `recipe`
// owner. Returns 0 if the recipe (or its compiled action) isn't found.
export function craftFirstUnit(recipeId: string, registry: Registry, state: GameState): number {
  const action = registry.recipeActions.get(recipeId);
  if (!action) return 0;
  return actionFirstUnit('recipe', recipeId, action.label, registry, state);
}

export function craft(recipeId: string, registry: Registry, state: GameState): void {
  const armed = armCraft(recipeId, registry, state);
  if (!armed.armed) return;
  resolve(state, registry, state.time + armed.firstUnit);
}
