import { endAction } from './actionEnd';
import { RuntimeError } from './error';
import {
  actionStillValid,
  actionVisible,
  fightBatch,
  findActionOwner,
  FightOutcome,
  inputLimit,
  outcomeResults,
  parseOwnerRef,
  requiresMet,
  resolvesPerAttempt,
  stopsOnOutcome,
  travelAction,
  travelPair,
} from './actions';
import {
  applyResults,
  applyResultsNow,
  captureResourceRates,
  clampResources,
  clearActorDeltas,
  emptyPoolNow,
  eventsFor,
  fireEvents,
  getDelta,
  newSegment,
  Segment,
  relocateTo,
  settlePools,
} from './effects';
import { actorEntity, armedAction, damageTarget, enterEncounter, IMPLICIT_TARGET_FULL, logSwing, newCadence, hasPool, opposes, Participant, participants, leaveFight, playerCadence, poolLevel, retaliation, seatOf, sideOf, targetLevel } from './encounter';
import { applyRespawns, downOne, isStanding, nextRespawn, standing } from './population';
import { actionAddress } from '../content/action';
import { Action, declaredId } from '../content/entity';
import { actionKind, isTwoSided } from '../grammar/action';
import { fireHooks } from './hooks';
import { ActionResult, nestedResults } from '../grammar/actionResult';
import { isPoint } from '../grammar/range';
import { Boundary, BoundarySource, requireBoundaryNotPast, requireForwardProgress } from './forwardProgress';
import { Item } from '../content/item';
import { Recipe } from '../content/recipe';
import { Registry } from '../content/registry';
import { BASE_LANGUAGE, Localized, localizerFor, localizerOf } from './localized';
import { nextRandom } from './rng';
import { roadsFrom, routeTo } from './journey';
import { applyDeclared, expireBuffs, nextBuffExpiry } from './buffs';
import { type ActiveAction, advanceTime, FIGHT_SCOPED, GameState, isFightScoped, PLAYER } from './state';
import { clearBuffs } from './buffs';
import { attemptDuration, hitChance, hitDamage, sampleStat, statValue } from './stats';
import { msUntilEmpty, toMilliUnits, fromMilliUnits } from './units';

export { advanceTime, createGameState, PLAYER } from './state';
export { endAction, endJourney } from './actionEnd';
export { RuntimeError } from './error';
export type { ActiveAction, ActorState, BuffInstance, BuffTable, Cadence, DialogueCursor, GameState, ModalFrame } from './state';
export { buffsOf, grantBuff, stackCount } from './buffs';
export { contestSpread, minDamage, travelSecondsPerUnit } from './tuning';
export { describeCondition, evaluateCondition, renderSegments } from './conditions';
export { actionVisible, requiresMet } from './actions';
export { hitChance, hitDamage, sampleStat, statRange, statValue } from './stats';
export { applyResultsNow, initResources } from './effects';
export { encounterView } from './encounter';
export { equip, unequip } from './equipment';
export type { EncounterFoe, EncounterView } from './encounter';
export { choose, talk } from './dialogue-runtime';
export { answerModal, openModal, publishModal, topModal } from './modals';
export type { Modal, ModalOption } from './modals';


// A pool a result drained must settle at the instant it ran out, the same way a
// hit that empties one already ends its segment.
function drainedAPool(segment: Segment): boolean {
  const { state, registry } = segment;
  for (const resource of registry.resources.values()) {
    if (eventsFor(registry, resource.id, 'on empty').length === 0) continue;
    const delta = getDelta(segment.deltas, PLAYER, resource.id);
    if (delta >= 0) continue;
    if ((state.resources[resource.id] ?? 0) + delta <= 0) return true;
  }
  return false;
}

interface FightParams {
  duration: number; // milliseconds per attempt
  abilityAmount: number; // milli-health subtracted per successful attempt
  attempts: number; // what bounds the action (Infinity if absent)
}

interface DeterministicFightPlan extends FightParams {
  attemptsToResolve: number; // attempts to end one fight
  outcome: FightOutcome; // which end the fight reaches first
}

function fightParams(action: Action, state: GameState, registry: Registry): FightParams {
  return {
    duration: attemptDuration(action, state, registry),
    abilityAmount: hitDamage(action.damage ? statValue(action.damage.left.id, state, registry) : 1, 0, registry),
    attempts: action.attempts ?? Infinity,
  };
}

function fightPlan(action: Action, state: GameState, registry: Registry): DeterministicFightPlan {
  const params = fightParams(action, state, registry);
  const neededForCompletion = Math.ceil(IMPLICIT_TARGET_FULL / params.abilityAmount);
  return {
    ...params,
    attemptsToResolve: Math.min(neededForCompletion, params.attempts),
    outcome: neededForCompletion <= params.attempts ? 'completion' : 'unfinished',
  };
}


// The pools with an `on empty:` that a completion's results drain. A drain
// written plainly among them takes the same amount every completion and can be
// planned ahead; one drawn from a range or reached through a wrapper cannot,
// and caps the batch at a single completion instead.
interface DrainSites {
  milliPerCompletion: Map<string, number>;
  unplannable: Set<string>;
}

function collectDrainSites(results: readonly ActionResult[], registry: Registry, sites: DrainSites, nested: boolean, tables: Set<string>): void {
  for (const result of results) {
    if (result.kind === 'pool') {
      const resource = registry.resources.get(result.resource);
      if (!resource || eventsFor(registry, resource.id, 'on empty').length === 0 || result.delta.min >= 0) continue;
      if (nested || !isPoint(result.delta)) sites.unplannable.add(result.resource);
      else sites.milliPerCompletion.set(result.resource, (sites.milliPerCompletion.get(result.resource) ?? 0) + toMilliUnits(-result.delta.min));
      continue;
    }
    if (result.kind === 'roll') {
      if (tables.has(result.table)) continue;
      tables.add(result.table);
      const table = registry.dropTables.get(result.table);
      if (table) collectDrainSites(table.results, registry, sites, true, tables);
      continue;
    }
    for (const group of nestedResults(result)) collectDrainSites(group, registry, sites, true, tables);
  }
}

// How many completions a batch may plan before one of them empties a pool: the
// deterministic counterpart of `drainedAPool`, which returns the per-attempt
// path to the instant it ran out. A pool the same segment also settles by rate
// caps at one completion, because a rate is integrated over the whole segment
// and only a one-completion segment puts the two at the same instant.
function completionsBeforeDrain(action: Action, state: GameState, registry: Registry, outcome: FightOutcome): number {
  const sites: DrainSites = { milliPerCompletion: new Map(), unplannable: new Set() };
  collectDrainSites(outcomeResults(action, outcome), registry, sites, false, new Set());

  let completions = Infinity;
  for (const resourceId of sites.unplannable) {
    if ((state.resources[resourceId] ?? 0) > 0) completions = 1;
  }
  for (const [resourceId, milliPerCompletion] of sites.milliPerCompletion) {
    const current = state.resources[resourceId] ?? 0;
    if (current <= 0) continue;
    const rate = registry.resources.get(resourceId)!.rate;
    const alsoRated = rate !== undefined && statValue(rate, state, registry) < 0;
    completions = Math.min(completions, alsoRated ? 1 : Math.ceil(current / milliPerCompletion));
  }
  return completions;
}

function nextBoundary(state: GameState, registry: Registry, toTime: number): Boundary {
  let boundary: Boundary = { at: toTime, source: { kind: 'requested' } };
  const expiry = nextBuffExpiry(state);
  if (expiry && expiry.at < boundary.at) boundary = { at: expiry.at, source: { kind: 'buff', actorId: expiry.actorId, source: expiry.source } };
  if (state.activeAction) {
    const active = state.activeAction;
    const source: BoundarySource = { kind: 'action', ownerRef: active.ownerRef, actionSlug: active.actionSlug };
    const action = armedAction(state, registry);
    if (!resolvesPerAttempt(action)) {
      const { duration, attemptsToResolve, outcome } = fightPlan(action, state, registry);
      const player = playerCadence(active);
      const inFlight = (attemptsToResolve - player.attemptsMade) * duration - player.progress;
      // Anything that must settle mid-batch caps the batch, and a single fight
      // is a batch of one.
      const completions = active.repeating
        ? Math.min(
            stopsOnOutcome(action, outcome) ? 1 : Infinity,
            inputLimit(action, state).completions,
            completionsBeforeDrain(action, state, registry, outcome),
          )
        : 1;
      if (Number.isFinite(completions)) {
        // The fight in flight, plus the whole fights the cap leaves after it.
        const runway = inFlight + Math.max(0, completions - 1) * attemptsToResolve * duration;
        const capInstant = state.time + Math.max(0, runway);
        if (capInstant < boundary.at) boundary = { at: capInstant, source };
      }
    }
  }
  const respawn = nextRespawn(state);
  if (respawn !== undefined && respawn > state.time && respawn < boundary.at) boundary = { at: respawn, source: { kind: 'requested' } };
  for (const resource of registry.resources.values()) {
    if (eventsFor(registry, resource.id, 'on empty').length === 0 || !resource.rate) continue;
    const ratePerMinute = statValue(resource.rate, state, registry);
    if (ratePerMinute >= 0) continue;
    const current = state.resources[resource.id] ?? 0;
    if (current <= 0) continue;
    const emptyIn = msUntilEmpty(current, toMilliUnits(ratePerMinute), state.resourceRateRemainders[resource.id] ?? 0);
    const emptyInstant = state.time + emptyIn;
    if (emptyInstant < boundary.at) boundary = { at: emptyInstant, source: { kind: 'resource', resourceId: resource.id } };
  }
  return boundary;
}

function resolveDeterministicSegment(segment: Segment, action: Action, segEnd: number): void {
  const { state, registry } = segment;
  const active = state.activeAction!;
  const segLen = segEnd - state.time;
  const { duration, abilityAmount, attemptsToResolve, outcome } = fightPlan(action, state, registry);

  if (active.repeating && duration <= 0) {
    throw new RuntimeError(`repeating action ${active.ownerRef}.${active.actionSlug} resolved a non-positive duration (${duration}) — give it a positive time: or a rate: that reads positive`);
  }

  const player = playerCadence(active);
  const totalAttemptTime = player.progress + segLen;
  const attemptsThisSegment = duration > 0 ? Math.floor(totalAttemptTime / duration) : 0;
  const newProgress = totalAttemptTime - attemptsThisSegment * duration;

  if (active.repeating) {
    const totalAttempts = player.attemptsMade + attemptsThisSegment;
    const fights = Math.floor(totalAttempts / attemptsToResolve);
    const remainder = totalAttempts - fights * attemptsToResolve;
    applyOutcome(segment, action, outcome, fights);
    if (segment.stopped) {
      endAction(state);
      return;
    }
    player.attemptsMade = remainder;
    active.implicitTarget = IMPLICIT_TARGET_FULL - remainder * abilityAmount;
    player.progress = newProgress;
  } else {
    // Clamped, never wrapped, so applyDueBoundaries can still see the completion.
    player.attemptsMade = Math.min(player.attemptsMade + attemptsThisSegment, attemptsToResolve);
    active.implicitTarget = IMPLICIT_TARGET_FULL - player.attemptsMade * abilityAmount;
    player.progress = newProgress;
  }
}

// Who a swing left with nothing, and, for an action with no pool to deplete,
// whether it ran its implicit target out. Two answers rather than one boolean
// because a swing can fell more than the character it struck once the hooks it
// fired have applied.
interface SwingOutcome {
  felled: string[];
  finished: boolean;
}

// Where a pool is heading by the end of the segment, which is the level the
// verdict is taken on: the clamped write happens when the segment settles.
function emptied(segment: Segment, actorId: string, resourceId: string): boolean {
  return poolLevel(segment.state, segment.registry, actorId, resourceId) + getDelta(segment.deltas, actorId, resourceId) <= 0;
}

// The verdict, taken after the swing's hooks have applied and over every
// character they reached rather than over the struck one alone: a `when hit:`
// draining `from them` empties the pool of whoever swung. The struck one is
// judged on the swing's own target level, as it was before hooks existed; a
// character a hook reached is judged only on a pool it carries.
function felledBy(segment: Segment, action: Action, self: string, other: string, reached: readonly string[]): string[] {
  const { state, registry } = segment;
  const pool = action.depletes!.id;
  const struck = sideOf(action.depletes!, self, other);
  const down = emptied(segment, struck, pool) ? [struck] : [];
  for (const actorId of reached) {
    if (down.includes(actorId) || !hasPool(state, registry, actorId, pool) || !emptied(segment, actorId, pool)) continue;
    down.push(actorId);
  }
  // Whoever felled a character is the other one in the swing: the struck one
  // where the swing did it, the swinger's own target where its `when hit:` did.
  for (const actorId of down) if (!segment.causedBy.has(actorId)) segment.causedBy.set(actorId, actorId === self ? other : self);
  return down;
}

// Both sides read with statValue, not sampled: one uniform decides the hit.
function resolveAttempt(participant: Participant, segment: Segment): SwingOutcome {
  const { state, registry } = segment;
  const { self, other, action, cadence } = participant;
  cadence.progress = 0;
  cadence.attemptsMade++;

  // Each half is read off the side it names. Nothing here recovers a side from
  // who is swinging; the marker is on the page.
  const half = (field: { side?: 'my' | 'their'; id: string } | undefined, read: typeof statValue, fallback: number): number =>
    field === undefined ? fallback : read(field.id, state, registry, sideOf(field, self, other));

  const hit = action.accuracy === undefined || nextRandom(state) < hitChance(half(action.accuracy.left, statValue, 0), half(action.accuracy.right, statValue, 0), registry);

  const dealt = hit ? hitDamage(half(action.damage?.left, sampleStat, 1), half(action.damage?.right, sampleStat, 0), registry) : null;
  if (dealt !== null) damageTarget(state, registry, action, self, other, dealt, segment.deltas);
  // A swing is narrated only in a fight: an implicit target is no one to hit.
  if (action.depletes) {
    logSwing(state, registry, self, other, dealt);
    // Whoever landed the blow is who a `credit:` in the target's handler moves
    // its results to; the moment supplies the subject, so nothing authored does.
    segment.causedBy.set(sideOf(action.depletes, self, other), self);
  }

  // A landed two-sided swing, and nothing else, fires a hook: a miss fires
  // neither block, and an implicit target is nobody to answer for one.
  const reached = dealt !== null && isTwoSided(action) ? fireHooks(segment, self, other) : [];

  // Announced after the swing's own results have landed, and only where there
  // is somebody struck: an implicit target is nobody to have a view.
  if (action.depletes) {
    const struck = sideOf(action.depletes, self, other);
    if (dealt === null) {
      fireEvents(segment, self, 'missed');
      fireEvents(segment, struck, 'evaded');
    } else {
      fireEvents(segment, self, 'damage-dealt', undefined, 1, fromMilliUnits(dealt));
      fireEvents(segment, struck, 'damage-taken', undefined, 1, fromMilliUnits(dealt));
    }
  }

  if (!action.depletes) return { felled: [], finished: targetLevel(state, registry, action, self, other) <= 0 };
  return { felled: felledBy(segment, action, self, other, reached), finished: false };
}

// A fight's end, applied to whoever performed it: the outcome's own results,
// then the moment itself, so a handler and a grant see one instant.
function applyOutcome(segment: Segment, action: Action, outcome: FightOutcome, times: number): void {
  const batch = fightBatch(action, times, outcome);
  if (batch.count <= 0) return;
  applyResults(segment, batch.results, PLAYER, batch.count);
  fireEvents(segment, PLAYER, outcome === 'completion' ? 'completed' : 'unfinished', undefined, batch.count);
}

// Whether a repeating fight has anything left to swing at. Asked here as well
// as at a boundary, because a segment that felled the last of a population and
// stood a fresh one up out of nothing would depend on where the span was cut.
function standsAgain(state: GameState, registry: Registry, action: Action, targetId: string): boolean {
  if (!action.depletes || isFightScoped(targetId)) return true;
  const location = registry.locations.get(state.location);
  return !location || isStanding(state, registry, location, targetId);
}

// An event queue, not a tick: each participant swings on its own clock.
function resolveStochasticSegment(segment: Segment, action: Action, segEnd: number): void {
  const { state, registry } = segment;
  const active = state.activeAction!;

  for (;;) {
    if (!actionStillValid(action, active, state)) {
      endAction(state);
      return;
    }

    const roster = participants(state, registry);
    let next: Participant | undefined;
    let nextAt = Infinity;
    for (const participant of roster) {
      const duration = attemptDuration(participant.action, state, registry, participant.self, participant.other);
      if (duration <= 0) {
        throw new RuntimeError(`action ${active.ownerRef}.${participant.action.label} resolved a non-positive attempt duration (${duration}) — give it a positive time: or a rate: that reads positive`);
      }
      // Progress can land past its duration, so an overdue swing floors at now.
      const at = state.time + Math.max(0, duration - participant.cadence.progress);
      // Strictly sooner, so a genuine integer-millisecond tie falls to roster order.
      if (at < nextAt) {
        next = participant;
        nextAt = at;
      }
    }

    // Nobody is swinging, so there is no fight: every seat's own gates have
    // closed and leaving the action armed would stall it forever.
    if (roster.length === 0) {
      endAction(state);
      advanceTime(state, segEnd - state.time);
      return;
    }

    if (!next || nextAt > segEnd) {
      const elapsed = segEnd - state.time;
      for (const participant of roster) participant.cadence.progress += elapsed;
      advanceTime(state, elapsed);
      return;
    }

    const elapsed = nextAt - state.time;
    for (const participant of roster) participant.cadence.progress += elapsed;
    advanceTime(state, elapsed);

    const outcome = resolveAttempt(next, segment);

    // A copy whose pool ran out has left the world, whoever landed the blow:
    // its own handlers run at the instant it ran out, its place records that it
    // is down, and the fight goes on without it. The player's own pool settles
    // with the segment instead, because it is the one the save carries.
    for (const actorId of outcome.felled) {
      if (actorId === PLAYER) continue;
      emptyPoolNow(segment, actorId, next.action.depletes!.id, segment.causedBy.get(actorId) ?? next.self);
      downOne(state, registry, state.location, actorId);
      leaveFight(active, actorId);
      clearBuffs(state, [actorId]);
    }

    // The fight is measured on what the armed action targets, not on who
    // swung: an ally's killing blow ends it exactly as the player's does, and a
    // hook's ends it exactly as the swing that fired it would have.
    const armedTarget = active.roster?.[PLAYER]?.target;
    let fightOutcome: FightOutcome | null = null;
    if (outcome.finished ? next.self === PLAYER : armedTarget !== undefined && outcome.felled.includes(armedTarget)) fightOutcome = 'completion';
    else if (next.self === PLAYER && playerCadence(active).attemptsMade >= (action.attempts ?? Infinity)) fightOutcome = 'unfinished';

    if (fightOutcome) {
      applyOutcome(segment, action, fightOutcome, 1);
      if (segment.stopped) {
        endAction(state);
        return;
      }
      if (active.repeating && standsAgain(state, registry, action, armedTarget ?? next.other)) {
        if (action.depletes) {
          clearActorDeltas(segment.deltas, armedTarget ?? next.other);
          enterEncounter(active, armedTarget ?? next.other, state, registry, PLAYER);
        } else active.implicitTarget = IMPLICIT_TARGET_FULL;
        playerCadence(active).attemptsMade = 0;
      } else {
        grantActionFoodBuff(state, registry);
        endAction(state);
        return;
      }
    }

    if (state.time > segEnd || drainedAPool(segment)) return;
  }
}

function resolveSegment(state: GameState, registry: Registry, segEnd: number): void {
  const start = state.time;
  // While the action's modifiers still hold; the stochastic path can clear it.
  const snapshots = captureResourceRates(state, registry);
  const segment = newSegment(state, registry);

  if (!state.activeAction) {
    advanceTime(state, segEnd - start);
  } else {
    const action = armedAction(state, registry);
    if (resolvesPerAttempt(action)) {
      resolveStochasticSegment(segment, action, segEnd);
    } else {
      resolveDeterministicSegment(segment, action, segEnd);
      advanceTime(state, segEnd - state.time);
    }
  }

  // Over the time actually consumed: a segment can stop short of segEnd.
  const elapsed = state.time - start;
  if (elapsed > 0 || segment.deltas.size > 0) settlePools(state, registry, snapshots, Math.max(0, elapsed), segment.deltas, segment.causedBy);
}

function applyDueBoundaries(state: GameState, registry: Registry, at: number): void {
  for (;;) {
    let changed = applyRespawns(state);
    if (stepJourney(state, registry)) changed = true;
    if (fightLeftItsLocation(state, registry)) {
      endAction(state);
      changed = true;
    }

    if (expireBuffs(state, at)) changed = true;

    if (state.activeAction) {
      const action = armedAction(state, registry);
      if (!actionStillValid(action, state.activeAction, state)) {
        endAction(state);
        changed = true;
      } else if (!resolvesPerAttempt(action)) {
        if (!state.activeAction.repeating) {
          const { duration, attemptsToResolve, outcome } = fightPlan(action, state, registry);
          // The only place a zero-`time:` action fires; no segment advances it.
          if (playerCadence(state.activeAction).attemptsMade >= attemptsToResolve || duration <= 0) {
            const segment = newSegment(state, registry);
            applyOutcome(segment, action, outcome, 1);
            settlePools(state, registry, [], 0, segment.deltas);
            grantActionFoodBuff(state, registry);
            endAction(state);
            changed = true;
          }
        }
      }
    }

    if (!changed) {
      clampResources(state, registry);
      openAggression(state, registry);
      return;
    }
  }
}

// A fight is bounded by its location: an aggressive entity disengages when its
// target leaves and does not follow, so travelling out is how a fight is broken
// off and no authored leash exists. It is the TARGET's presence that bounds it,
// never a participant's: an ally joins from wherever it is, and a fight-scoped
// copy stands nowhere at all.
function fightLeftItsLocation(state: GameState, registry: Registry): boolean {
  const active = state.activeAction;
  const location = registry.locations.get(state.location);
  const target = active?.roster?.[PLAYER]?.target;
  if (!active?.actors || !location || target === undefined || isFightScoped(target) || !active.actors[target]) return false;
  return !isStanding(state, registry, location, target);
}

// An aggressive entity opens the fight itself against any hostile entity in its
// location; everything else waits to be attacked. What the player answers with
// is its own retaliation, which is the rule every other participant follows.
function openAggression(state: GameState, registry: Registry): void {
  if (state.activeAction) return;
  const location = registry.locations.get(state.location);
  if (!location) return;
  for (const entry of standing(state, registry, location)) {
    const entity = registry.entities.get(entry.entity);
    if (!entity?.aggressive || !opposes(registry, entry.entity, PLAYER)) continue;
    if (!retaliation(state, registry, entry.entity, PLAYER)) continue;
    const answer = retaliation(state, registry, PLAYER, entry.entity);
    if (!answer) continue;
    armFight(state, registry, answer.id, answer.action, entry.entity);
    return;
  }
}

// Your side is you and your `allies:`; their side is your target and its
// `allies:`. A count mints fight-scoped copies that vanish with the fight; a
// bare name is the one that already exists, joining from wherever it is.
function joinAllies(active: ActiveAction, state: GameState, registry: Registry, sideOwner: string, against: string): void {
  for (const ally of actorEntity(registry, sideOwner)?.allies ?? []) {
    if (ally.count === undefined) {
      enterEncounter(active, ally.entity, state, registry, against);
      continue;
    }
    for (let copy = 1; copy <= ally.count; copy++) enterEncounter(active, `${ally.entity}${FIGHT_SCOPED}${copy}`, state, registry, against);
  }
}

// A two-sided action brought by the player and applied to what it names. The one
// path a fight starts down, whether the player armed it or an aggressor opened
// it.
export function armFight(state: GameState, registry: Registry, actionId: string, action: Action, targetId: string): ActiveAction {
  const active: ActiveAction = {
    ownerRef: `action.${actionId}`,
    actionSlug: actionAddress(action),
    repeating: actionKind(action) === 'continuous',
    implicitTarget: IMPLICIT_TARGET_FULL,
    // First in, so the player wins a tie between cadences due at the same instant.
    cadences: { [PLAYER]: newCadence() },
    roster: { [PLAYER]: seatOf(actionId, action, targetId) },
  };
  state.activeAction = active;
  enterEncounter(active, targetId, state, registry, PLAYER);
  joinAllies(active, state, registry, targetId, PLAYER);
  joinAllies(active, state, registry, PLAYER, targetId);
  return active;
}

// Associative, as resolve.test.ts proves. Two accepted limitations: an
// `on full` handler mutating a rate-referenced stat is not; and a pool already
// saturated in its rate's direction is not, because settling it clamps the rate
// away and drops the carried remainder, so where the span is cut decides how
// much it wasted.
export function resolve(state: GameState, registry: Registry, toTimeMs: number): void {
  if (toTimeMs < state.time) throw new RuntimeError(`resolve: toTime (${toTimeMs}) must be >= state.time (${state.time})`);
  if (!Number.isInteger(toTimeMs)) throw new RuntimeError(`resolve: toTime must be an integer millisecond value, got ${toTimeMs}`);
  applyDueBoundaries(state, registry, state.time);
  let consecutiveStalls = 0;
  while (state.time < toTimeMs) {
    const before = state.time;
    const boundary = nextBoundary(state, registry, toTimeMs);
    requireBoundaryNotPast(boundary, before);
    resolveSegment(state, registry, boundary.at);
    // At the instant reached, not the boundary: buffs may still have time left.
    applyDueBoundaries(state, registry, state.time);
    consecutiveStalls = requireForwardProgress(boundary, before, state.time, consecutiveStalls);
  }
}

// A meal is one source of one payload, so eating grants one instance carrying
// the item's whole tag list — the same list a worn copy of it would fold. Food
// that moves no stat grants nothing, because there is nothing for the fold to
// find and an instance of it would only be a clock.
function grantFoodBuff(item: Item, state: GameState): void {
  if (!item.tags.some((tag) => tag.kind === 'keyword' && tag.value === 'food')) return;
  if (!item.tags.some((tag) => tag.kind === 'stat-bonus')) return;

  applyDeclared(state, PLAYER, item, state.time);
}

// On COMPLETION: the one moment both ways of starting an action pass through.
function grantActionFoodBuff(state: GameState, registry: Registry): void {
  const active = state.activeAction;
  if (!active) return;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  if (obj !== 'item') return;
  const item = registry.items.get(objId);
  if (!item) return;
  // Eating is the item consuming itself. A repeating action isn't a meal.
  if (active.repeating) return;
  if (!armedAction(state, registry).results.some((r) => r.kind === 'take' && r.item === objId)) return;
  grantFoodBuff(item, state);
}

// `armed: false` has already logged its failure; `firstUnit` spans from state.time.
export type ArmResult = { armed: true; firstUnit: number } | { armed: false };

function firstUnitSpan(action: Action, state: GameState, registry: Registry): number {
  const duration = attemptDuration(action, state, registry);
  return resolvesPerAttempt(action) ? duration : fightPlan(action, state, registry).attemptsToResolve * duration;
}

// A cost the player cannot pay stops the action before it arms. Having an input
// only out of its stack is its own refusal: the cost is afforded, so the action
// is offered, and paying it would take a plane or empty a slot.
function refuseUnpayableInputs(action: Action, registry: Registry, state: GameState): ArmResult | undefined {
  const { short, unspendable } = inputLimit(action, state);
  if (short === undefined && unspendable === undefined) return undefined;
  const localizer = localizerOf(registry, state);
  const item = (id: string): Localized => localizer.title('item', id);
  if (action.onFailure) applyResultsNow(state, registry, action.onFailure);
  else if (short !== undefined) state.log.push(localizer.engine('engine.inputs.short', { item: item(short) }));
  else state.log.push(localizer.engine(unspendable!.kind === 'grown' ? 'engine.inputs.grown' : 'engine.inputs.worn', { item: item(unspendable!.item) }));
  return { armed: false };
}

export function armAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): ArmResult {
  const say = localizerFor(registry, BASE_LANGUAGE);
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!target) throw new RuntimeError(say.engine('engine.action.stale.owner', { kind: say.identifier(obj), id: say.identifier(objId) }));

  const action = target.actions?.find((each) => actionAddress(each) === actionId);
  if (!action) throw new RuntimeError(say.engine('engine.action.stale.action', { action: say.identifier(actionId), owner: say.identifier(`${obj}.${objId}`) }));
  if (!requiresMet(action, state)) throw new RuntimeError(`action requires unmet: ${obj}.${objId}.${actionId}`);
  if (!actionVisible(action, state)) throw new RuntimeError(`action hidden: ${obj}.${objId}.${actionId}`);

  // Gates only the START; running dry mid-flight is resolve()'s limiting math.
  const unpayable = refuseUnpayableInputs(action, registry, state);
  if (unpayable) return unpayable;

  const repeating = actionKind(action) === 'continuous';
  const duration = attemptDuration(action, state, registry);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`continuous action ${obj}.${objId}.${actionId} resolved a non-positive cadence (${duration}ms)`);
  }

  // First in, so the player wins a tie between cadences due at the same instant.
  const active: ActiveAction = {
    ownerRef: `${obj}.${objId}`,
    actionSlug: actionId,
    repeating,
    implicitTarget: IMPLICIT_TARGET_FULL,
    cadences: { [PLAYER]: newCadence() },
    roster: { [PLAYER]: { ownerRef: `${obj}.${objId}`, actionSlug: actionId, target: objId } },
  };
  state.activeAction = active;
  return { armed: true, firstUnit: firstUnitSpan(action, state, registry) };
}

// A probe: it computes the first unit WITHOUT arming, and arming can move what
// it measures. Callers that are about to arm should arm and read `ArmResult`
// instead; this is for a caller with nothing to arm, like the CLI's readout of
// an action already in flight.
export function actionFirstUnit(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): number {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  const action = target?.actions?.find((each) => actionAddress(each) === actionId);
  if (!action) return 0;
  return firstUnitSpan(action, state, registry);
}

// The two-sided face of `armAction`: an action reached by id and applied to what
// it names, rather than one offered by the object that owns it.
export function armFightAction(actionId: string, targetId: string, registry: Registry, state: GameState): ArmResult {
  // The player's own copy, so an overload of the action the player brings is
  // what its gates, its inputs and its first unit are read from.
  const declared = registry.actions.get(actionId);
  const action = actorEntity(registry, PLAYER)?.actions.find((each) => declaredId(each) === actionId) ?? declared;
  if (!declared || !action) throw new RuntimeError(`unknown action: ${actionId}`);
  if (!registry.entities.has(targetId)) throw new RuntimeError(`unknown entity: ${targetId}`);
  if (!requiresMet(action, state)) throw new RuntimeError(`action requires unmet: ${actionId}`);
  if (!actionVisible(action, state)) throw new RuntimeError(`action hidden: ${actionId}`);

  const unpayable = refuseUnpayableInputs(action, registry, state);
  if (unpayable) return unpayable;

  armFight(state, registry, actionId, action, targetId);
  return { armed: true, firstUnit: firstUnitSpan(action, state, registry) };
}

export function useFight(actionId: string, targetId: string, registry: Registry, state: GameState): void {
  const armed = armFightAction(actionId, targetId, registry, state);
  if (!armed.armed) return;
  resolve(state, registry, state.time + armed.firstUnit);
}

export function useAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): void {
  const armed = armAction(obj, objId, actionId, registry, state);
  if (!armed.armed) return;
  resolve(state, registry, state.time + armed.firstUnit);
}

export function armTravel(origin: string, dest: string, registry: Registry, state: GameState): ArmResult {
  return armAction('travel', travelPair(origin, dest), actionAddress(travelAction(origin, dest, registry)), registry, state);
}

// Sets off for anywhere the roads reach, which is one leg when the place is
// next door and a queue of them when it is not. The route is worked out once
// and held, so a walk crosses the same places it was started for.
// The one sentence a walk with no route says, so the arming path and the
// resolving path say the same thing and a caller reading it back reads the
// sentence the player was shown.
function noWayTo(dest: string, registry: Registry, state: GameState): Localized {
  const localizer = localizerOf(registry, state);
  return localizer.engine('engine.travel.no-way', { destination: localizer.title('location', dest) });
}

export function armJourney(dest: string, registry: Registry, state: GameState): ArmResult {
  if (!registry.locations.has(dest)) throw new RuntimeError(`unknown location: ${dest}`);
  const route = routeTo(state.location, dest, registry, state);
  if (!route) {
    state.log.push(noWayTo(dest, registry, state));
    return { armed: false };
  }
  state.journey = { to: dest, legs: route };
  const armed = armTravel(state.location, route[0], registry, state);
  if (!armed.armed) state.journey = null;
  return armed;
}

// The one place a walk goes on: a leg ended, so the next one is armed off the
// route the walk was started with. Every way an action can end passes through
// here, because everything that ends one runs inside resolve and resolve asks
// this after every segment — which is why the walk does not have to be re-armed
// at each of endAction's call sites.
//
// Nothing is armed while an action is under way, so a fight opening mid-walk
// suspends it rather than racing it, and the walk resumes when the fight is
// over. A player who does not want that cancels, which ends both.
function stepJourney(state: GameState, registry: Registry): boolean {
  const journey = state.journey;
  if (!journey || state.activeAction) return false;

  // Arriving is what crosses a leg, so the front of the queue is dropped by
  // standing on it rather than by the leg reporting itself done.
  const crossed = journey.legs[0] === state.location;
  if (crossed) journey.legs.shift();
  if (journey.legs.length === 0) {
    state.journey = null;
    return true;
  }

  // Stopped: the player is not where the last leg was going, or the road on is
  // shut now. Either way the route it was walking no longer describes the
  // world, and re-finding one here would be the engine deciding the player
  // meant to go anyway.
  if (!roadsFrom(state.location, registry, state).includes(journey.legs[0])) {
    state.journey = null;
    return true;
  }

  const armed = armTravel(state.location, journey.legs[0], registry, state);
  if (!armed.armed) state.journey = null;
  return true;
}

export function useTravel(origin: string, dest: string, registry: Registry, state: GameState): void {
  if (!origin) {
    // Placed rather than walked, through the same door `relocate:` goes.
    relocateTo(state, registry, dest);
    return;
  }
  useAction('travel', travelPair(origin, dest), actionAddress(travelAction(origin, dest, registry)), registry, state);
}

// The whole walk, resolved where it stands. The same route the armed walk
// takes, so a driver that resolves and one that arms cross the same places and
// spend the same time; the difference between them is who watches it happen.
//
// Returns the sentence refusing the walk, and nothing when one was made: no
// route is the one way this leaves the world exactly as it found it, and a
// caller that can only report what it is told needs telling.
export function walkTo(dest: string, registry: Registry, state: GameState): Localized | undefined {
  if (!registry.locations.has(dest)) throw new RuntimeError(`unknown location: ${dest}`);
  if (!state.location) {
    useTravel('', dest, registry, state);
    return undefined;
  }
  const route = routeTo(state.location, dest, registry, state);
  if (!route) {
    const refused = noWayTo(dest, registry, state);
    state.log.push(refused);
    return refused;
  }
  for (const leg of route) {
    const from = state.location;
    if (!roadsFrom(from, registry, state).includes(leg)) return undefined;
    useTravel(from, leg, registry, state);
    // Somewhere along the way the world did something else with the player.
    if (state.location !== leg) return undefined;
  }
  return undefined;
}

export function recipeCraftable(recipe: Recipe, registry: Registry, state: GameState): boolean {
  // Through the compiled action, not `recipe.in`: the same list under two owners.
  const action = registry.recipeActions.get(recipe.id);
  if (!action) throw new RuntimeError(`unknown recipe: ${recipe.id}`);
  if (inputLimit(action, state).short !== undefined) return false;
  if (recipe.requiresCapability) {
    const loc = registry.locations.get(state.location);
    if (!loc) return false;
    const provided = standing(state, registry, loc).some((entry) => registry.entities.get(entry.entity)?.capabilities.includes(recipe.requiresCapability!));
    if (!provided) return false;
  }
  return true;
}

export function armCraft(recipeId: string, registry: Registry, state: GameState): ArmResult {
  const recipe = registry.recipes.get(recipeId);
  if (!recipe) throw new RuntimeError(`unknown recipe: ${recipeId}`);
  if (!recipeCraftable(recipe, registry, state)) throw new RuntimeError(`recipe not craftable: ${recipeId}`);
  const action = registry.recipeActions.get(recipeId)!;
  return armAction('recipe', recipeId, actionAddress(action), registry, state);
}

export function craftFirstUnit(recipeId: string, registry: Registry, state: GameState): number {
  const action = registry.recipeActions.get(recipeId);
  if (!action) return 0;
  return actionFirstUnit('recipe', recipeId, actionAddress(action), registry, state);
}

export function craft(recipeId: string, registry: Registry, state: GameState): void {
  const armed = armCraft(recipeId, registry, state);
  if (!armed.armed) return;
  resolve(state, registry, state.time + armed.firstUnit);
}
