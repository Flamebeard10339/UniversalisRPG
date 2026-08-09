import {
  actionStillValid,
  actionVisible,
  fightBatch,
  findActionOwner,
  findActiveAction,
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
  getDelta,
  newSegment,
  Segment,
  settlePools,
} from './effects';
import {
  ActiveAction,
  actorEntity,
  damageTarget,
  enterEncounter,
  IMPLICIT_TARGET_FULL,
  logSwing,
  newCadence,
  FIGHT_SCOPED,
  isFightScoped,
  opposes,
  Participant,
  participants,
  leaveFight,
  playerCadence,
  retaliation,
  seatOf,
  sideOf,
  targetLevel,
} from './encounter';
import { applyRespawns, downOne, isStanding, nextRespawn, standing } from './population';
import { Action } from '../content/entity';
import { actionKind } from '../grammar/action';
import { ActionResult, nestedResults } from '../grammar/actionResult';
import { isPoint } from '../grammar/range';
import { Boundary, BoundarySource, requireBoundaryNotPast, requireForwardProgress } from './forwardProgress';
import { Item } from '../content/item';
import { Recipe } from '../content/recipe';
import { Registry } from '../content/registry';
import { nextRandom } from './rng';
import { advanceTime, endAction, GameState, PLAYER, RuntimeError } from './state';
import { attemptDuration, hitChance, hitDamage, sampleStat, statValue } from './stats';
import { TagClause } from '../grammar/tagClause';
import { msUntilEmpty, secondsToMs, toMilliUnits } from './units';

export { advanceTime, createGameState, endAction, PLAYER, RuntimeError } from './state';
export type { ActiveBuff, GameState } from './state';
export { contestSpread, minDamage, travelSecondsPerUnit } from './tuning';
export { describeCondition, evaluateCondition, renderSegments } from './conditions';
export { actionVisible, requiresMet } from './actions';
export { hitChance, hitDamage, sampleStat, statRange, statValue } from './stats';
export { applyResultsNow, initResources } from './effects';
export { encounterView } from './encounter';
export { equip, unequip } from './equipment';
export type { ActiveAction, ActorState, Cadence, EncounterFoe, EncounterView } from './encounter';
export { choose, talk } from './dialogue-runtime';
export type { DialogueCursor } from './dialogue-runtime';
export { answerModal, openModal, publishModal, topModal } from './modals';
export type { Modal, ModalFrame, ModalOption } from './modals';


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
  for (const [key, buff] of Object.entries(state.activeBuffs)) {
    if (buff.expiresAt < boundary.at) boundary = { at: buff.expiresAt, source: { kind: 'buff', buffKey: key } };
  }
  if (state.activeAction) {
    const active = state.activeAction;
    const source: BoundarySource = { kind: 'action', ownerRef: active.ownerRef, actionLabel: active.actionLabel };
    const action = findActiveAction(active, registry);
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
    throw new RuntimeError(`repeating action ${active.ownerRef}.${active.actionLabel} resolved a non-positive duration (${duration}) — give it a positive time: or a rate: that reads positive`);
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
    applyResults(segment, batch.results, PLAYER, batch.count);
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

// Both sides read with statValue, not sampled: one uniform decides the hit.
function resolveAttempt(participant: Participant, segment: Segment): boolean {
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
  // A swing is narrated only in a fight: an implicit target is no one to hit.
  if (action.depletes) {
    logSwing(state, registry, self, other, dealt);
    // Whoever landed the blow is who a `credit:` in the target's handler moves
    // its results to; the moment supplies the subject, so nothing authored does.
    segment.causedBy.set(sideOf(action.depletes, self, other), self);
  }
  if (dealt === null) return targetLevel(state, registry, action, self, other) <= 0;
  return damageTarget(state, registry, action, self, other, dealt, segment.deltas) <= 0;
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

    const depleted = resolveAttempt(next, segment);

    // A copy whose pool ran out has left the world, whoever landed the blow:
    // its own handlers run at the instant it ran out, and its place records
    // that it is down. The player's own pool settles with the segment instead,
    // because it is the one the save carries.
    const struck = depleted && next.action.depletes ? sideOf(next.action.depletes, next.self, next.other) : undefined;
    if (struck !== undefined && struck !== PLAYER) {
      emptyPoolNow(segment, struck, next.action.depletes!.id, next.self);
      downOne(state, registry, state.location, struck);
    }

    // The fight is measured on what the armed action targets, not on who
    // swung: an ally's killing blow ends it exactly as the player's does.
    const armedTarget = active.roster?.[PLAYER]?.target;
    let fightOutcome: FightOutcome | null = null;
    if (depleted && (struck === undefined ? next.self === PLAYER : struck === armedTarget)) fightOutcome = 'completion';
    else if (next.self === PLAYER && playerCadence(active).attemptsMade >= (action.attempts ?? Infinity)) fightOutcome = 'unfinished';

    if (fightOutcome) {
      const batch = fightBatch(action, 1, fightOutcome);
      applyResults(segment, batch.results, PLAYER, batch.count);
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
    } else if (struck !== undefined && struck !== PLAYER) {
      // Somebody else went down. The fight goes on without them.
      leaveFight(active, struck);
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
    const action = findActiveAction(state.activeAction, registry);
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
    if (fightLeftItsLocation(state, registry)) {
      endAction(state);
      changed = true;
    }

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
        if (!state.activeAction.repeating) {
          const { duration, attemptsToResolve, outcome } = fightPlan(action, state, registry);
          // The only place a zero-`time:` action fires; no segment advances it.
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
    actionLabel: action.label,
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

function grantFoodBuff(item: Item, state: GameState): void {
  if (!item.tags.some((tag) => tag.kind === 'keyword' && tag.value === 'food')) return;

  const durationTag = item.tags.find((tag): tag is Extract<TagClause, { kind: 'duration' }> => tag.kind === 'duration');
  const duration = durationTag?.seconds ?? 0;

  for (const tag of item.tags) {
    if (tag.kind !== 'stat-bonus') continue;
    const expiresAt = state.time + secondsToMs(duration);
    state.activeBuffs[`${item.id}:${tag.statId}`] = tag.percent
      ? { statId: tag.statId, kind: 'increased', amount: tag.amount / 100, expiresAt }
      : { statId: tag.statId, kind: 'added', amount: tag.amount, expiresAt };
  }
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
  if (!findActiveAction(active, registry).results.some((r) => r.kind === 'take' && r.item === objId)) return;
  grantFoodBuff(item, state);
}

// `armed: false` has already logged its failure; `firstUnit` spans from state.time.
export type ArmResult = { armed: true; firstUnit: number } | { armed: false };

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

  // Gates only the START; running dry mid-flight is resolve()'s limiting math.
  const { short: shortfall } = inputLimit(action, state);
  if (shortfall !== undefined) {
    if (action.onFailure) applyResultsNow(state, registry, action.onFailure);
    else state.log.push(`You don't have enough ${registry.items.get(shortfall)?.title ?? shortfall}.`);
    return { armed: false };
  }

  const repeating = actionKind(action) === 'continuous';
  const duration = attemptDuration(action, state, registry);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`continuous action ${obj}.${objId}.${actionId} resolved a non-positive cadence (${duration}ms)`);
  }

  // First in, so the player wins a tie between cadences due at the same instant.
  const active: ActiveAction = {
    ownerRef: `${obj}.${objId}`,
    actionLabel: actionId,
    repeating,
    implicitTarget: IMPLICIT_TARGET_FULL,
    cadences: { [PLAYER]: newCadence() },
    roster: { [PLAYER]: { ownerRef: `${obj}.${objId}`, actionLabel: actionId, target: objId } },
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
  const action = target?.actions?.find((a) => a.label === actionId);
  if (!action) return 0;
  return firstUnitSpan(action, state, registry);
}

// The two-sided face of `armAction`: an action reached by id and applied to what
// it names, rather than one offered by the object that owns it.
export function armFightAction(actionId: string, targetId: string, registry: Registry, state: GameState): ArmResult {
  const action = registry.actions.get(actionId);
  if (!action) throw new RuntimeError(`unknown action: ${actionId}`);
  if (!registry.entities.has(targetId)) throw new RuntimeError(`unknown entity: ${targetId}`);
  if (!requiresMet(action, state)) throw new RuntimeError(`action requires unmet: ${actionId}`);
  if (!actionVisible(action, state)) throw new RuntimeError(`action hidden: ${actionId}`);

  const { short: shortfall } = inputLimit(action, state);
  if (shortfall !== undefined) {
    if (action.onFailure) applyResultsNow(state, registry, action.onFailure);
    else state.log.push(`You don't have enough ${registry.items.get(shortfall)?.title ?? shortfall}.`);
    return { armed: false };
  }

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

// A journey from an unset origin is a plain placement, not a journey.
export function travelFirstUnit(origin: string, dest: string, registry: Registry, state: GameState): number {
  if (!origin) return 0;
  const { label } = travelAction(origin, dest, registry);
  return actionFirstUnit('travel', travelPair(origin, dest), label, registry, state);
}

export function armTravel(origin: string, dest: string, registry: Registry, state: GameState): ArmResult {
  const { label } = travelAction(origin, dest, registry);
  return armAction('travel', travelPair(origin, dest), label, registry, state);
}

export function useTravel(origin: string, dest: string, registry: Registry, state: GameState): void {
  if (!origin) {
    state.location = dest;
    return;
  }
  const { label } = travelAction(origin, dest, registry);
  useAction('travel', travelPair(origin, dest), label, registry, state);
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
  return armAction('recipe', recipeId, action.label, registry, state);
}

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
