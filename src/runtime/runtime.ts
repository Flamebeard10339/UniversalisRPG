import { carries } from '../grammar/tagClause';
import { endAction } from './actionEnd';
import { RuntimeError } from './error';
import { actionStillValid, actionVisible, fightBatch, FightOutcome, inputLimit, leavesHere, outcomeResults, requiresMet, resolvesPerAttempt, stopsOnOutcome } from './actions';
import { ownerRef, parseOwnerRef } from './state';
import { findActionOwner, travelAction, travelPair } from './actionLookup';
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
  isSpent,
  newSegment,
  Segment,
  relocateTo,
  settlePools,
  spendable,
} from './effects';
import { actorTitle, attemptFraction, damageTarget, enterEncounter, IMPLICIT_TARGET_FULL, logSwing, newCadence, opposes, leaveFight, playerCadence, poolLevel, retaliation, standAt, targetLevel } from './encounter';
import { armedAction, Participant, participants, seatOf } from './roster';
import { actorEntity } from './actionLookup';
import { hasPool } from './stats';
import { sideOf } from '../grammar/action';
import { applyRespawns, downOne, isElsewhere, nextRespawn, standing } from './population';
import { actionAddress } from '../content/sections/action';
import { Action, declaredId } from '../content/sections/entity';
import { actionKind, isTwoSided } from '../grammar/action';
import { fireHooks } from './hooks';
import { ActionResult, nestedResults } from '../grammar/actionResult';
import { isPoint } from '../grammar/range';
import { Boundary, BoundarySource, requireBoundaryNotPast, requireForwardProgress } from './forwardProgress';
import { Item } from '../content/sections/item';
import { Recipe } from '../content/sections/recipe';
import { Registry } from '../content/registry';
import { BASE_LANGUAGE, Localized, localizerFor, localizerOf } from './localized';
import { nextRandom } from './rng';
import { roadsFrom, routeTo } from './journey';
import { applyDeclared, clearBuffs, expireBuffs, nextBuffExpiry } from './buffs';
import { type ActiveAction, advanceTime, debugging, FIGHT_SCOPED, GameState, isFightScoped, PLAYER, templateOf } from './state';
import { attemptDuration, hitChance, hitDamage, sampleStat, stalledPace, statValue } from './stats';
import { engagementDelay } from './tuning';
import { msToDrain, MS_PER_MINUTE, toMilliUnits, fromMilliUnits } from './units';
import { describeCondition, evaluateCondition, itemMissingFor } from './conditions';
import { spanStart, spanSummary, type SpanStart } from './span';
import { isCycles, type Terminator } from '../content/sections/test';

export { advanceTime, createGameState, PLAYER } from './state';
export { endAction, endJourney } from './actionEnd';
export { RuntimeError } from './error';
export type { ActiveAction, ActorState, BuffInstance, BuffTable, Cadence, DialogueCursor, GameState, ModalFrame } from './state';
export { buffsOf, grantBuff, stackCount } from './buffs';
export { contestSpread, engagementDelay, minDamage, travelSeconds } from './tuning';
export { describeCondition, evaluateCondition, renderSegments } from './conditions';
export { actionVisible, requiresMet } from './actions';
export { hitChance, hitDamage, sampleStat, statRange, statValue } from './stats';
export { applyResultsNow, initResources, settleCarried } from './effects';
export { encounterView } from './encounter';
export { equip, unequip } from './equipment';
export type { EncounterFoe, EncounterView } from './encounter';
export { choose, reachedNow, talk } from './dialogue-runtime';
export { answerModal, publishModal } from './modals';
export { openModal, topModal } from './modalStack';
export type { Modal } from './modals';
export type { ModalOption } from './modalOption';


function drainedAPool(segment: Segment): boolean {
  const { state, registry } = segment;
  for (const resource of registry.resources.values()) {
    if (eventsFor(registry, resource.id, 'on empty').length === 0) continue;
    const delta = getDelta(segment.deltas, PLAYER, resource.id);
    if (delta >= 0) continue;
    if (isSpent((state.resources[resource.id] ?? 0) + delta)) return true;
  }
  return false;
}

interface FightParams {
  attemptMs: number;
  milliHealthPerHit: number;
  attempts: number;
}

interface DeterministicFightPlan extends FightParams {
  attemptsToResolve: number;
  outcome: FightOutcome;
}

const aimedAt = (state: GameState): string => state.activeAction?.roster?.[PLAYER]?.target ?? PLAYER;

function fightParams(action: Action, state: GameState, registry: Registry, other: string): FightParams {
  return {
    attemptMs: attemptDuration(action, state, registry, PLAYER, other),
    milliHealthPerHit: hitDamage(action.damage ? statValue(action.damage.left.id, state, registry, sideOf(action.damage.left, PLAYER, other)) : 1, 0, registry),
    attempts: action.attempts ?? Infinity,
  };
}

function fightPlan(action: Action, state: GameState, registry: Registry, other: string): DeterministicFightPlan {
  const params = fightParams(action, state, registry, other);
  const neededForCompletion = Math.ceil(IMPLICIT_TARGET_FULL / params.milliHealthPerHit);
  return {
    ...params,
    attemptsToResolve: Math.min(neededForCompletion, params.attempts),
    outcome: neededForCompletion <= params.attempts ? 'completion' : 'unfinished',
  };
}

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

function completionsBeforeDrain(action: Action, state: GameState, registry: Registry, outcome: FightOutcome): number {
  const sites: DrainSites = { milliPerCompletion: new Map(), unplannable: new Set() };
  collectDrainSites(outcomeResults(action, outcome), registry, sites, false, new Set());

  let completions = Infinity;
  for (const resourceId of sites.unplannable) {
    if (!isSpent(state.resources[resourceId] ?? 0)) completions = 1;
  }
  for (const [resourceId, milliPerCompletion] of sites.milliPerCompletion) {
    const current = state.resources[resourceId] ?? 0;
    if (isSpent(current)) continue;
    const rate = registry.resources.get(resourceId)!.rate;
    const alsoRated = rate !== undefined && statValue(rate, state, registry) < 0;
    completions = Math.min(completions, alsoRated ? 1 : Math.ceil(spendable(current) / milliPerCompletion));
  }
  return completions;
}

export function nextBoundary(state: GameState, registry: Registry, toTime: number): Boundary {
  let boundary: Boundary = { at: toTime, source: { kind: 'requested' } };
  const expiry = nextBuffExpiry(state);
  if (expiry && expiry.at < boundary.at) boundary = { at: expiry.at, source: { kind: 'buff', actorId: expiry.actorId, source: expiry.source } };
  if (state.activeAction) {
    const active = state.activeAction;
    const source: BoundarySource = { kind: 'action', ownerRef: active.ownerRef, actionSlug: active.actionSlug };
    const action = armedAction(state, registry);
    if (!resolvesPerAttempt(action)) {
      const { attemptMs, attemptsToResolve, outcome } = fightPlan(action, state, registry, aimedAt(state));
      const player = playerCadence(active);
      const inFlight = (attemptsToResolve - player.attemptsMade) * attemptMs - player.progress;
      const completions = active.repeating
        ? Math.min(
            stopsOnOutcome(action, outcome) ? 1 : Infinity,
            inputLimit(action, state).completions,
            completionsBeforeDrain(action, state, registry, outcome),
          )
        : 1;
      if (Number.isFinite(completions) && !stalledPace(attemptMs)) {
        const runway = inFlight + Math.max(0, completions - 1) * attemptsToResolve * attemptMs;
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
    if (isSpent(current)) continue;
    const emptyIn = msToDrain(spendable(current), toMilliUnits(ratePerMinute), state.resourceRateRemainders[resource.id] ?? 0);
    const emptyInstant = state.time + emptyIn;
    if (emptyInstant < boundary.at) boundary = { at: emptyInstant, source: { kind: 'resource', resourceId: resource.id } };
  }
  return boundary;
}

function resolveDeterministicSegment(segment: Segment, action: Action, segEnd: number): void {
  const { state, registry } = segment;
  const active = state.activeAction!;
  const segLen = segEnd - state.time;
  const { attemptMs, milliHealthPerHit, attemptsToResolve, outcome } = fightPlan(action, state, registry, aimedAt(state));

  if (stalledPace(attemptMs)) return;

  if (active.repeating && attemptMs <= 0) {
    throw new RuntimeError(`repeating action ${active.ownerRef}.${active.actionSlug} resolved a non-positive duration (${attemptMs}) — give it a positive time: or a rate: that reads positive`);
  }

  const player = playerCadence(active);
  const totalAttemptTime = player.progress + segLen;
  const attemptsThisSegment = attemptMs > 0 ? Math.floor(totalAttemptTime / attemptMs) : 0;
  const newProgress = totalAttemptTime - attemptsThisSegment * attemptMs;

  if (active.repeating) {
    const totalAttempts = player.attemptsMade + attemptsThisSegment;
    const fights = Math.floor(totalAttempts / attemptsToResolve);
    const remainder = totalAttempts - fights * attemptsToResolve;
    applyOutcome(segment, action, outcome, fights);
    if (segment.stopped) {
      endAction(state, segment.stopped);
      return;
    }
    player.attemptsMade = remainder;
    active.implicitTarget = IMPLICIT_TARGET_FULL - remainder * milliHealthPerHit;
    standAt(player, newProgress, attemptMs);
  } else {
    player.attemptsMade = Math.min(player.attemptsMade + attemptsThisSegment, attemptsToResolve);
    active.implicitTarget = IMPLICIT_TARGET_FULL - player.attemptsMade * milliHealthPerHit;
    standAt(player, newProgress, attemptMs);
  }
}

interface SwingOutcome {
  felled: string[];
  finished: boolean;
}

function emptied(segment: Segment, actorId: string, resourceId: string): boolean {
  return isSpent(poolLevel(segment.state, segment.registry, actorId, resourceId) + getDelta(segment.deltas, actorId, resourceId));
}

function felledBy(segment: Segment, action: Action, self: string, other: string, reached: readonly string[]): string[] {
  const { state, registry } = segment;
  const pool = action.depletes!.id;
  const struck = sideOf(action.depletes!, self, other);
  const down = emptied(segment, struck, pool) ? [struck] : [];
  for (const actorId of reached) {
    if (down.includes(actorId) || !hasPool(state, registry, actorId, pool) || !emptied(segment, actorId, pool)) continue;
    down.push(actorId);
  }
  for (const actorId of down) if (!segment.causedBy.has(actorId)) segment.causedBy.set(actorId, actorId === self ? other : self);
  return down;
}

function resolveAttempt(participant: Participant, segment: Segment): SwingOutcome {
  const { state, registry } = segment;
  const { self, other, action, cadence } = participant;
  standAt(cadence, 0);
  cadence.attemptsMade++;

  const half = (field: { side?: 'my' | 'their'; id: string } | undefined, read: typeof statValue, fallback: number): number =>
    field === undefined ? fallback : read(field.id, state, registry, sideOf(field, self, other));

  const struck = action.depletes ? sideOf(action.depletes, self, other) : null;
  const felling = self === PLAYER && struck !== null && struck !== PLAYER && debugging(state, 'instant-kill');

  const hit = felling || action.accuracy === undefined || nextRandom(state) < hitChance(half(action.accuracy.left, statValue, 0), half(action.accuracy.right, statValue, 0), registry);

  const dealt = !hit ? null : felling ? targetLevel(state, registry, action, self, other) : hitDamage(half(action.damage?.left, sampleStat, 1), half(action.damage?.right, sampleStat, 0), registry);
  const capacity = dealt !== null && action.depletes ? Math.max(targetLevel(state, registry, action, self, other), 0) : null;
  if (dealt !== null) damageTarget(state, registry, action, self, other, dealt, segment.deltas);
  if (action.depletes) {
    logSwing(state, registry, self, other, dealt);
    segment.causedBy.set(sideOf(action.depletes, self, other), self);
  }

  const reached = dealt !== null && isTwoSided(action) ? fireHooks(segment, self, other) : [];

  if (action.depletes) {
    const struck = sideOf(action.depletes, self, other);
    if (dealt === null) {
      fireEvents(segment, self, 'missed');
      fireEvents(segment, struck, 'evaded');
    } else {
      const landed = fromMilliUnits(Math.min(dealt, capacity ?? dealt));
      fireEvents(segment, self, 'damage-dealt', undefined, 1, landed);
      fireEvents(segment, struck, 'damage-taken', undefined, 1, landed);
    }
  }

  if (!action.depletes) return { felled: [], finished: targetLevel(state, registry, action, self, other) <= 0 };
  return { felled: felledBy(segment, action, self, other, reached), finished: false };
}

function applyOutcome(segment: Segment, action: Action, outcome: FightOutcome, times: number): void {
  const batch = fightBatch(action, times, outcome);
  if (batch.count <= 0) return;
  segment.state.cyclesDone += batch.count;
  applyResults(segment, batch.results, PLAYER, batch.count);
  fireEvents(segment, PLAYER, outcome === 'completion' ? 'completed' : 'unfinished', undefined, batch.count);
}

function standsAgain(state: GameState, registry: Registry, action: Action, targetId: string): boolean {
  if (!action.depletes || isFightScoped(targetId)) return true;
  const location = registry.locations.get(state.location);
  return !location || !isElsewhere(state, registry, location, targetId);
}

function quietFor(state: GameState, registry: Registry): void {
  state.engagesAt = Math.max(state.engagesAt, state.time + engagementDelay(registry));
}

function searchingForAFoe(state: GameState, action: Action): boolean {
  const active = state.activeAction!;
  if (!action.depletes || !active.repeating) return false;
  const target = active.roster?.[PLAYER]?.target;
  return target !== undefined && active.actors?.[target] === undefined;
}

function goodUntil(state: GameState, segEnd: number): number {
  const expiry = nextBuffExpiry(state);
  return expiry !== undefined && expiry.at > state.time && expiry.at < segEnd ? expiry.at : segEnd;
}

function resolveStochasticSegment(segment: Segment, action: Action, segEnd: number): void {
  const { state, registry } = segment;
  const active = state.activeAction!;

  for (;;) {
    if (segment.stopped || !actionStillValid(action, active, state, registry)) {
      endAction(state, segment.stopped ?? localizerOf(registry, state).engine('engine.stopped.unavailable'));
      return;
    }

    const until = goodUntil(state, segEnd);

    const searching = searchingForAFoe(state, action);
    const looking = searching ? active.roster![PLAYER]!.target : undefined;
    if (looking !== undefined && !standsAgain(state, registry, action, looking)) {
      grantActionFoodBuff(state, registry);
      endAction(state, outcomeReached(state, registry, 'completion'));
      advanceTime(state, Math.max(0, until - state.time));
      return;
    }

    const paced = participants(state, registry)
      .filter((participant) => !(searching && participant.self === PLAYER))
      .map((participant) => ({ participant, duration: attemptDuration(participant.action, state, registry, participant.self, participant.other) }));

    let next: Participant | undefined;
    let nextAt = Infinity;
    for (const { participant, duration } of paced) {
      if (duration <= 0) {
        throw new RuntimeError(`action ${active.ownerRef}.${participant.action.label} resolved a non-positive attempt duration (${duration}) — give it a positive time: or a rate: that reads positive`);
      }
      if (stalledPace(duration)) continue;
      const at = state.time + Math.max(0, duration - participant.cadence.progress);
      if (at < nextAt) {
        next = participant;
        nextAt = at;
      }
    }

    const ticking = paced.filter((each) => !stalledPace(each.duration));

    if (paced.length === 0 && !searching) {
      endAction(state, localizerOf(registry, state).engine('engine.stopped.unavailable'));
      advanceTime(state, until - state.time);
      return;
    }

    const foundAt = looking === undefined ? Infinity : Math.max(state.time, state.engagesAt);
    if (foundAt <= until && foundAt <= nextAt) {
      const elapsed = foundAt - state.time;
      for (const { participant, duration } of ticking) standAt(participant.cadence, participant.cadence.progress + elapsed, duration);
      advanceTime(state, elapsed);
      clearActorDeltas(segment.deltas, looking!);
      enterEncounter(active, looking!, state, registry, PLAYER);
      playerCadence(active).attemptsMade = 0;
      standAt(playerCadence(active), 0);
      continue;
    }

    if (!next || nextAt > until) {
      const elapsed = until - state.time;
      for (const { participant, duration } of ticking) standAt(participant.cadence, participant.cadence.progress + elapsed, duration);
      advanceTime(state, elapsed);
      return;
    }

    const elapsed = nextAt - state.time;
    for (const { participant, duration } of ticking) standAt(participant.cadence, participant.cadence.progress + elapsed, duration);
    advanceTime(state, elapsed);

    const outcome = resolveAttempt(next, segment);

    for (const actorId of outcome.felled) {
      if (actorId === PLAYER) continue;
      state.log.push(localizerOf(registry, state).engine('engine.combat.felled', { target: actorTitle(actorId, registry, state) }));
      emptyPoolNow(segment, actorId, next.action.depletes!.id, segment.causedBy.get(actorId) ?? next.self);
      downOne(state, registry, state.location, actorId);
      leaveFight(active, actorId);
      clearBuffs(state, [actorId]);
      quietFor(state, registry);
    }

    const armedTarget = active.roster?.[PLAYER]?.target;
    let fightOutcome: FightOutcome | null = null;
    if (outcome.finished ? next.self === PLAYER : armedTarget !== undefined && outcome.felled.includes(armedTarget)) fightOutcome = 'completion';
    else if (next.self === PLAYER && playerCadence(active).attemptsMade >= (action.attempts ?? Infinity)) fightOutcome = 'unfinished';

    if (fightOutcome) {
      applyOutcome(segment, action, fightOutcome, 1);
      if (segment.stopped) {
        endAction(state, segment.stopped);
        return;
      }
      if (active.repeating && standsAgain(state, registry, action, armedTarget ?? next.other)) {
        if (action.depletes) {
          clearActorDeltas(segment.deltas, armedTarget ?? next.other);
          if (active.actors?.[armedTarget ?? next.other] !== undefined) enterEncounter(active, armedTarget ?? next.other, state, registry, PLAYER);
        } else active.implicitTarget = IMPLICIT_TARGET_FULL;
        playerCadence(active).attemptsMade = 0;
      } else {
        grantActionFoodBuff(state, registry);
        endAction(state, outcomeReached(state, registry, fightOutcome));
        return;
      }
    }

    if (state.time > segEnd || drainedAPool(segment)) return;
  }
}

function resolveSegment(state: GameState, registry: Registry, segEnd: number): void {
  const start = state.time;
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

  const elapsed = state.time - start;
  if (elapsed > 0 || segment.deltas.size > 0) settlePools(state, registry, snapshots, Math.max(0, elapsed), segment.deltas, segment.causedBy);
}

function applyDueBoundaries(state: GameState, registry: Registry, at: number): void {
  for (;;) {
    let changed = applyRespawns(state);
    if (stepJourney(state, registry)) changed = true;
    if (fightLeftItsLocation(state, registry)) {
      endAction(state, localizerOf(registry, state).engine('engine.stopped.unavailable'));
      changed = true;
    }

    if (expireBuffs(state, at)) changed = true;

    if (state.activeAction) {
      const action = armedAction(state, registry);
      if (!actionStillValid(action, state.activeAction, state, registry)) {
        endAction(state, localizerOf(registry, state).engine('engine.stopped.unavailable'));
        changed = true;
      } else if (!resolvesPerAttempt(action)) {
        if (!state.activeAction.repeating) {
          const { attemptMs, attemptsToResolve, outcome } = fightPlan(action, state, registry, aimedAt(state));
          if (playerCadence(state.activeAction).attemptsMade >= attemptsToResolve || attemptMs <= 0) {
            const segment = newSegment(state, registry);
            applyOutcome(segment, action, outcome, 1);
            settlePools(state, registry, [], 0, segment.deltas);
            grantActionFoodBuff(state, registry);
            if (state.activeAction) endAction(state, segment.stopped ?? outcomeReached(state, registry, outcome));
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

const outcomeReached = (state: GameState, registry: Registry, outcome: FightOutcome): Localized =>
  localizerOf(registry, state).engine(outcome === 'completion' ? 'engine.stopped.finished' : 'engine.stopped.unfinished');

function fightLeftItsLocation(state: GameState, registry: Registry): boolean {
  const active = state.activeAction;
  const location = registry.locations.get(state.location);
  const target = active?.roster?.[PLAYER]?.target;
  if (!active?.actors || !location || target === undefined || isFightScoped(target) || !active.actors[target]) return false;
  return isElsewhere(state, registry, location, target);
}

function aggressorHere(state: GameState, registry: Registry): { entity: string; id: string; action: Action } | undefined {
  const location = registry.locations.get(state.location);
  if (!location) return undefined;
  const met = new Set(Object.keys(state.activeAction?.actors ?? {}).map(templateOf));
  const aggressors = standing(state, registry, location).filter((entry) => registry.entities.get(entry.entity)?.aggressive && opposes(registry, entry.entity, PLAYER));
  if (aggressors.some((entry) => met.has(entry.entity))) return undefined;
  for (const entry of aggressors) {
    if (!retaliation(state, registry, entry.entity, PLAYER)) continue;
    const answer = retaliation(state, registry, PLAYER, entry.entity);
    if (!answer) continue;
    return { entity: entry.entity, ...answer };
  }
  return undefined;
}

function openAggression(state: GameState, registry: Registry): void {
  if (state.time < state.engagesAt) return;
  const coming = aggressorHere(state, registry);
  if (!coming) return;
  if (state.activeAction) {
    if (leavesHere(armedAction(state, registry))) return;
    endAction(state, localizerOf(registry, state).engine('engine.stopped.engaged', { attacker: actorTitle(coming.entity, registry, state) }));
  }
  state.engagedBy = coming.entity;
  armFight(state, registry, coming.id, coming.action, coming.entity);
}

function joinAllies(active: ActiveAction, state: GameState, registry: Registry, sideOwner: string, against: string): void {
  for (const ally of actorEntity(registry, sideOwner)?.allies ?? []) {
    if (ally.count === undefined) {
      enterEncounter(active, ally.entity, state, registry, against);
      continue;
    }
    for (let copy = 1; copy <= ally.count; copy++) enterEncounter(active, `${ally.entity}${FIGHT_SCOPED}${copy}`, state, registry, against);
  }
}

export function armFight(state: GameState, registry: Registry, actionId: string, action: Action, targetId: string): ActiveAction {
  const active: ActiveAction = {
    ownerRef: `action.${actionId}`,
    actionSlug: actionAddress(action),
    repeating: actionKind(action) === 'continuous',
    implicitTarget: IMPLICIT_TARGET_FULL,
    cadences: { [PLAYER]: newCadence() },
    roster: { [PLAYER]: seatOf(actionId, action, targetId) },
  };
  state.activeAction = active;
  enterEncounter(active, targetId, state, registry, PLAYER);
  joinAllies(active, state, registry, targetId, PLAYER);
  joinAllies(active, state, registry, PLAYER, targetId);
  return active;
}

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
    applyDueBoundaries(state, registry, state.time);
    consecutiveStalls = requireForwardProgress(boundary, before, state.time, consecutiveStalls);
  }
}

export const UNDER_WAY_LIMIT_HOURS = 4;
export const UNDER_WAY_LIMIT_MS = UNDER_WAY_LIMIT_HOURS * 60 * MS_PER_MINUTE;

export interface WaitedOut {
  ended: boolean;
  reason?: Localized;
}

const underWayUnit = (state: GameState, registry: Registry): number => {
  const active = state.activeAction;
  if (!active) return 0;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  return actionFirstUnit(obj, objId, active.actionSlug, registry, state, aimedAt(state));
};

function advanceUnderWayCycle(state: GameState, registry: Registry): void {
  const unit = underWayUnit(state, registry);
  if (Number.isFinite(unit)) {
    resolve(state, registry, state.time + Math.max(1, Math.ceil(unit)));
    return;
  }
  const next = nextBoundary(state, registry, state.time + UNDER_WAY_LIMIT_MS).at;
  resolve(state, registry, Math.max(state.time + 1, Math.ceil(next)));
}

export function resolveUnderWay(state: GameState, registry: Registry, terminator: Terminator = 'done', start: SpanStart = spanStart(state)): WaitedOut {
  const startedAt = start.at;
  const say = localizerOf(registry, state);
  const counted = isCycles(terminator) ? { wanted: terminator.times, cycled: (): number => state.cyclesDone - start.state.cyclesDone } : null;
  const met = terminator === 'done' || isCycles(terminator) ? null : terminator;

  const over = (ended: boolean, because: Localized): WaitedOut => {
    state.log.push(...spanSummary(start, state, registry, because));
    return ended ? { ended } : { ended, reason: because };
  };

  for (;;) {
    if (counted) {
      if (counted.cycled() >= counted.wanted) return over(true, say.engine('engine.stopped.counted', { times: counted.wanted }));
    } else if (met && evaluateCondition(met, state, registry)) {
      return over(true, say.engine('engine.stopped.condition', { condition: say.identifier(describeCondition(met)) }));
    }
    if (!state.activeAction && !state.journey) {
      if (state.time < state.engagesAt && aggressorHere(state, registry)) {
        resolve(state, registry, state.engagesAt);
        continue;
      }
      const because = state.endedBecause ?? say.engine('engine.stopped.finished');
      if (terminator === 'done') return over(true, because);
      if (counted) return over(false, say.engine('engine.stopped.short-count', { because, times: counted.cycled(), wanted: counted.wanted }));
      return over(false, say.engine('engine.stopped.short', { because, condition: say.identifier(describeCondition(met!)) }));
    }
    if (state.time - startedAt >= UNDER_WAY_LIMIT_MS) return over(false, say.engine('engine.stopped.bound', { hours: UNDER_WAY_LIMIT_HOURS }));
    const unit = underWayUnit(state, registry);
    if (!(unit > 0)) return over(false, say.engine('engine.stopped.still'));
    advanceUnderWayCycle(state, registry);
  }
}

function grantFoodBuff(item: Item, state: GameState): void {
  if (!carries(item.tags, 'food')) return;
  if (!item.tags.some((tag) => tag.kind === 'stat-bonus')) return;

  applyDeclared(state, PLAYER, item, state.time);
}

function grantFoodFor(state: GameState, registry: Registry, owner: string, action: Action, repeating: boolean): void {
  const { obj, objId } = parseOwnerRef(owner);
  if (obj !== 'item' || repeating) return;
  const item = registry.items.get(objId);
  if (!item) return;
  if (!action.results.some((r) => r.kind === 'take' && r.item === objId)) return;
  grantFoodBuff(item, state);
}

function grantActionFoodBuff(state: GameState, registry: Registry): void {
  const active = state.activeAction;
  if (!active) return;
  grantFoodFor(state, registry, active.ownerRef, armedAction(state, registry), active.repeating);
}

export type ArmResult = { armed: true; firstUnit: number } | { armed: false };

function resolveFirstUnit(state: GameState, registry: Registry, firstUnit: number): void {
  resolve(state, registry, state.time + (Number.isFinite(firstUnit) ? Math.ceil(firstUnit) : 0));
}

function firstUnitSpan(action: Action, state: GameState, registry: Registry, other: string): number {
  const duration = attemptDuration(action, state, registry, PLAYER, other);
  return resolvesPerAttempt(action) ? duration : fightPlan(action, state, registry, other).attemptsToResolve * duration;
}

const isFree = (action: Action, state: GameState, registry: Registry, other: string): boolean => attemptDuration(action, state, registry, PLAYER, other) <= 0;

function runFreely(state: GameState, registry: Registry, owner: string, action: Action): void {
  const segment = newSegment(state, registry);
  applyResults(segment, outcomeResults(action, 'completion'), PLAYER, 1);
  fireEvents(segment, PLAYER, 'completed', undefined, 1);
  settlePools(state, registry, [], 0, segment.deltas);
  grantFoodFor(state, registry, owner, action, false);
  if (segment.stopped) endAction(state, segment.stopped);
}

interface NamedOn {
  obj: string;
  id: string;
}

function whereItIsNot(named: NamedOn, registry: Registry, state: GameState): Localized | undefined {
  const localizer = localizerOf(registry, state);
  const absent = (target: Localized): Localized => localizer.engine('engine.target.absent', { target });
  if (named.obj === 'location') {
    return registry.locations.has(named.id) && named.id !== state.location ? absent(localizer.title('location', named.id)) : undefined;
  }
  if (named.obj !== 'entity') return undefined;
  const here = registry.locations.get(state.location);
  return here && isElsewhere(state, registry, here, named.id) ? absent(actorTitle(named.id, registry, state)) : undefined;
}

function whyRefused(action: Action, registry: Registry, state: GameState, named?: NamedOn): Localized | undefined {
  const localizer = localizerOf(registry, state);
  const item = (id: string): Localized => localizer.title('item', id);
  const absent = named && whereItIsNot(named, registry, state);
  if (absent) return absent;
  if (action.requires && !requiresMet(action, state, registry)) {
    const missing = itemMissingFor(action.requires, state, registry);
    return missing === undefined ? localizer.engine('engine.requires.unmet') : localizer.engine('engine.requires.item', { item: item(missing) });
  }
  const { short, unspendable } = inputLimit(action, state);
  if (short !== undefined) return localizer.engine('engine.inputs.short', { item: item(short) });
  if (unspendable !== undefined) return localizer.engine('engine.inputs.grown', { item: item(unspendable) });
  return undefined;
}

function refuseWith(action: Action, registry: Registry, state: GameState, because: Localized | undefined): ArmResult | undefined {
  if (because === undefined) return undefined;
  if (action.onFailure) applyResultsNow(state, registry, action.onFailure);
  else state.log.push(because);
  return { armed: false };
}

function refuseArming(action: Action, named: NamedOn, written: string, registry: Registry, state: GameState): ArmResult | undefined {
  const away = refuseWith(action, registry, state, whereItIsNot(named, registry, state));
  if (away) return away;
  if (!actionVisible(action, state, registry)) throw new RuntimeError(`action hidden: ${written}`);
  return refuseWith(action, registry, state, whyRefused(action, registry, state, named));
}

export function armAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): ArmResult {
  const say = localizerFor(registry, BASE_LANGUAGE);
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!target) throw new RuntimeError(say.engine('engine.action.stale.owner', { kind: say.identifier(obj), id: say.identifier(objId) }));

  const action = target.actions?.find((each) => actionAddress(each) === actionId);
  if (!action) throw new RuntimeError(say.engine('engine.action.stale.action', { action: say.identifier(actionId), owner: say.identifier(ownerRef(obj, objId)) }));

  const refused = refuseArming(action, { obj, id: objId }, `${obj}.${objId}.${actionId}`, registry, state);
  if (refused) return refused;

  const repeating = actionKind(action) === 'continuous';
  const duration = attemptDuration(action, state, registry, PLAYER, objId);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`continuous action ${obj}.${objId}.${actionId} resolved a non-positive cadence (${duration}ms)`);
  }

  if (state.activeAction && isFree(action, state, registry, objId)) {
    runFreely(state, registry, ownerRef(obj, objId), action);
    return { armed: false };
  }

  const active: ActiveAction = {
    ownerRef: ownerRef(obj, objId),
    actionSlug: actionId,
    repeating,
    implicitTarget: IMPLICIT_TARGET_FULL,
    cadences: { [PLAYER]: newCadence() },
    roster: { [PLAYER]: { ownerRef: ownerRef(obj, objId), actionSlug: actionId, target: objId } },
  };
  state.activeAction = active;
  return { armed: true, firstUnit: firstUnitSpan(action, state, registry, objId) };
}

export function actionProgress(state: GameState, registry: Registry): number {
  const active = state.activeAction;
  if (!active) return 0;
  const action = armedAction(state, registry);
  const clock = playerCadence(active);
  const attemptMs = attemptDuration(action, state, registry, PLAYER, aimedAt(state));
  if (!(attemptMs > 0)) return 1;
  const within = attemptFraction(clock, attemptMs);
  if (resolvesPerAttempt(action)) return within;
  const attempts = fightPlan(action, state, registry, aimedAt(state)).attemptsToResolve;
  if (!(attempts > 0)) return 1;
  return Math.min(1, Math.max(0, (Math.min(attempts, clock.attemptsMade) + within) / attempts));
}

export function actionFirstUnit(obj: string, objId: string, actionId: string, registry: Registry, state: GameState, other: string = objId): number {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  const action = target?.actions?.find((each) => actionAddress(each) === actionId);
  if (!action) return 0;
  return firstUnitSpan(action, state, registry, other);
}

export function armFightAction(actionId: string, targetId: string, registry: Registry, state: GameState): ArmResult {
  const declared = registry.actions.get(actionId);
  const action = actorEntity(registry, PLAYER)?.actions.find((each) => declaredId(each) === actionId) ?? declared;
  if (!declared || !action) throw new RuntimeError(`unknown action: ${actionId}`);
  if (!registry.entities.has(targetId)) throw new RuntimeError(`unknown entity: ${targetId}`);

  const refused = refuseArming(action, { obj: 'entity', id: targetId }, actionId, registry, state);
  if (refused) return refused;

  armFight(state, registry, actionId, action, targetId);
  return { armed: true, firstUnit: firstUnitSpan(action, state, registry, targetId) };
}

export function useFight(actionId: string, targetId: string, registry: Registry, state: GameState): void {
  const active = state.activeAction;
  if (active?.ownerRef === `action.${actionId}` && active.roster?.[PLAYER]?.target === targetId) {
    advanceUnderWayCycle(state, registry);
    return;
  }
  const armed = armFightAction(actionId, targetId, registry, state);
  if (!armed.armed) return;
  resolveFirstUnit(state, registry, armed.firstUnit);
}

export function useAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): void {
  const active = state.activeAction;
  if (active?.ownerRef === ownerRef(obj, objId) && active.actionSlug === actionId) {
    advanceUnderWayCycle(state, registry);
    return;
  }
  const armed = armAction(obj, objId, actionId, registry, state);
  if (!armed.armed) return;
  resolveFirstUnit(state, registry, armed.firstUnit);
}

export function armTravel(origin: string, dest: string, registry: Registry, state: GameState): ArmResult {
  return armAction('travel', travelPair(origin, dest), actionAddress(travelAction(origin, dest, registry)), registry, state);
}

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

function stepJourney(state: GameState, registry: Registry): boolean {
  const journey = state.journey;
  if (!journey || state.activeAction) return false;
  const say = localizerOf(registry, state);

  const crossed = journey.legs[0] === state.location;
  if (crossed) journey.legs.shift();
  if (journey.legs.length === 0) {
    state.journey = null;
    state.endedBecause = say.engine('engine.stopped.arrived');
    return true;
  }

  if (!roadsFrom(state.location, registry, state).includes(journey.legs[0])) {
    state.journey = null;
    state.endedBecause = say.engine('engine.stopped.no-road');
    return true;
  }

  const armed = armTravel(state.location, journey.legs[0], registry, state);
  if (!armed.armed) {
    state.journey = null;
    state.endedBecause = say.engine('engine.stopped.no-road');
  }
  return true;
}

export function useTravel(origin: string, dest: string, registry: Registry, state: GameState): void {
  if (!origin) {
    relocateTo(state, registry, dest);
    return;
  }
  useAction('travel', travelPair(origin, dest), actionAddress(travelAction(origin, dest, registry)), registry, state);
}

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
    if (state.location !== leg) return undefined;
  }
  return undefined;
}

export function recipeCraftable(recipe: Recipe, registry: Registry, state: GameState): boolean {
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
  resolveFirstUnit(state, registry, armed.firstUnit);
}
