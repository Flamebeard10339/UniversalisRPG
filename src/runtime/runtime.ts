import { endAction } from './actionEnd';
import { RuntimeError } from './error';
import { actionStillValid, actionVisible, fightBatch, FightOutcome, inputLimit, outcomeResults, parseOwnerRef, requiresMet, resolvesPerAttempt, stopsOnOutcome } from './actions';
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
  newSegment,
  Segment,
  relocateTo,
  settlePools,
} from './effects';
import { damageTarget, enterEncounter, IMPLICIT_TARGET_FULL, logSwing, newCadence, opposes, leaveFight, playerCadence, poolLevel, retaliation, targetLevel } from './encounter';
import { armedAction, Participant, participants, seatOf } from './roster';
import { actorEntity } from './actionLookup';
import { hasPool } from './stats';
import { sideOf } from '../grammar/action';
import { applyRespawns, downOne, isStanding, nextRespawn, standing } from './population';
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
import { type ActiveAction, advanceTime, FIGHT_SCOPED, GameState, isFightScoped, PLAYER } from './state';
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
    if ((state.resources[resource.id] ?? 0) + delta <= 0) return true;
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

function fightParams(action: Action, state: GameState, registry: Registry): FightParams {
  return {
    attemptMs: attemptDuration(action, state, registry),
    milliHealthPerHit: hitDamage(action.damage ? statValue(action.damage.left.id, state, registry) : 1, 0, registry),
    attempts: action.attempts ?? Infinity,
  };
}

function fightPlan(action: Action, state: GameState, registry: Registry): DeterministicFightPlan {
  const params = fightParams(action, state, registry);
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
      const { attemptMs, attemptsToResolve, outcome } = fightPlan(action, state, registry);
      const player = playerCadence(active);
      const inFlight = (attemptsToResolve - player.attemptsMade) * attemptMs - player.progress;
      const completions = active.repeating
        ? Math.min(
            stopsOnOutcome(action, outcome) ? 1 : Infinity,
            inputLimit(action, state).completions,
            completionsBeforeDrain(action, state, registry, outcome),
          )
        : 1;
      if (Number.isFinite(completions)) {
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
  const { attemptMs, milliHealthPerHit, attemptsToResolve, outcome } = fightPlan(action, state, registry);

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
      endAction(state);
      return;
    }
    player.attemptsMade = remainder;
    active.implicitTarget = IMPLICIT_TARGET_FULL - remainder * milliHealthPerHit;
    player.progress = newProgress;
  } else {
    player.attemptsMade = Math.min(player.attemptsMade + attemptsThisSegment, attemptsToResolve);
    active.implicitTarget = IMPLICIT_TARGET_FULL - player.attemptsMade * milliHealthPerHit;
    player.progress = newProgress;
  }
}

interface SwingOutcome {
  felled: string[];
  finished: boolean;
}

function emptied(segment: Segment, actorId: string, resourceId: string): boolean {
  return poolLevel(segment.state, segment.registry, actorId, resourceId) + getDelta(segment.deltas, actorId, resourceId) <= 0;
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
  cadence.progress = 0;
  cadence.attemptsMade++;

  const half = (field: { side?: 'my' | 'their'; id: string } | undefined, read: typeof statValue, fallback: number): number =>
    field === undefined ? fallback : read(field.id, state, registry, sideOf(field, self, other));

  const hit = action.accuracy === undefined || nextRandom(state) < hitChance(half(action.accuracy.left, statValue, 0), half(action.accuracy.right, statValue, 0), registry);

  const dealt = hit ? hitDamage(half(action.damage?.left, sampleStat, 1), half(action.damage?.right, sampleStat, 0), registry) : null;
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
      fireEvents(segment, self, 'damage-dealt', undefined, 1, fromMilliUnits(dealt));
      fireEvents(segment, struck, 'damage-taken', undefined, 1, fromMilliUnits(dealt));
    }
  }

  if (!action.depletes) return { felled: [], finished: targetLevel(state, registry, action, self, other) <= 0 };
  return { felled: felledBy(segment, action, self, other, reached), finished: false };
}

function applyOutcome(segment: Segment, action: Action, outcome: FightOutcome, times: number): void {
  const batch = fightBatch(action, times, outcome);
  if (batch.count <= 0) return;
  applyResults(segment, batch.results, PLAYER, batch.count);
  fireEvents(segment, PLAYER, outcome === 'completion' ? 'completed' : 'unfinished', undefined, batch.count);
}

function standsAgain(state: GameState, registry: Registry, action: Action, targetId: string): boolean {
  if (!action.depletes || isFightScoped(targetId)) return true;
  const location = registry.locations.get(state.location);
  return !location || isStanding(state, registry, location, targetId);
}

function resolveStochasticSegment(segment: Segment, action: Action, segEnd: number): void {
  const { state, registry } = segment;
  const active = state.activeAction!;

  for (;;) {
    if (!actionStillValid(action, active, state, registry)) {
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
      const at = state.time + Math.max(0, duration - participant.cadence.progress);
      if (at < nextAt) {
        next = participant;
        nextAt = at;
      }
    }

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

    for (const actorId of outcome.felled) {
      if (actorId === PLAYER) continue;
      emptyPoolNow(segment, actorId, next.action.depletes!.id, segment.causedBy.get(actorId) ?? next.self);
      downOne(state, registry, state.location, actorId);
      leaveFight(active, actorId);
      clearBuffs(state, [actorId]);
    }

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
      endAction(state);
      changed = true;
    }

    if (expireBuffs(state, at)) changed = true;

    if (state.activeAction) {
      const action = armedAction(state, registry);
      if (!actionStillValid(action, state.activeAction, state, registry)) {
        endAction(state);
        changed = true;
      } else if (!resolvesPerAttempt(action)) {
        if (!state.activeAction.repeating) {
          const { attemptMs, attemptsToResolve, outcome } = fightPlan(action, state, registry);
          if (playerCadence(state.activeAction).attemptsMade >= attemptsToResolve || attemptMs <= 0) {
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

function fightLeftItsLocation(state: GameState, registry: Registry): boolean {
  const active = state.activeAction;
  const location = registry.locations.get(state.location);
  const target = active?.roster?.[PLAYER]?.target;
  if (!active?.actors || !location || target === undefined || isFightScoped(target) || !active.actors[target]) return false;
  return !isStanding(state, registry, location, target);
}

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

// An author waiting out an action wants it finished, not a number of seconds guessed large enough to cover it. What is under way is stepped one unit of its own at a time — the cycle the progress bar reads — and stops the moment nothing is in flight, so a fight ends when the last swing lands rather than when a clock a test picked runs out. An action that never ends runs into the step cap and says so, rather than running forever.
const UNDER_WAY_STEPS = 1000;

export interface WaitedOut {
  ended: boolean;
  reason?: string;
}

const underWayUnit = (state: GameState, registry: Registry): number => {
  const active = state.activeAction;
  if (!active) return 0;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  return actionFirstUnit(obj, objId, active.actionSlug, registry, state);
};

export function resolveUnderWay(state: GameState, registry: Registry): WaitedOut {
  for (let step = 0; step < UNDER_WAY_STEPS; step++) {
    if (!state.activeAction && !state.journey) return { ended: true };
    const unit = underWayUnit(state, registry);
    if (!(unit > 0)) return { ended: false, reason: 'what is under way advances by nothing, so waiting it out would never end' };
    resolve(state, registry, state.time + Math.max(1, Math.ceil(unit)));
  }
  return { ended: false, reason: `what is under way had not finished after ${UNDER_WAY_STEPS} of its own cycles` };
}

function grantFoodBuff(item: Item, state: GameState): void {
  if (!item.tags.some((tag) => tag.kind === 'keyword' && tag.value === 'food')) return;
  if (!item.tags.some((tag) => tag.kind === 'stat-bonus')) return;

  applyDeclared(state, PLAYER, item, state.time);
}

function grantActionFoodBuff(state: GameState, registry: Registry): void {
  const active = state.activeAction;
  if (!active) return;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  if (obj !== 'item') return;
  const item = registry.items.get(objId);
  if (!item) return;
  if (active.repeating) return;
  if (!armedAction(state, registry).results.some((r) => r.kind === 'take' && r.item === objId)) return;
  grantFoodBuff(item, state);
}

export type ArmResult = { armed: true; firstUnit: number } | { armed: false };

function firstUnitSpan(action: Action, state: GameState, registry: Registry): number {
  const duration = attemptDuration(action, state, registry);
  return resolvesPerAttempt(action) ? duration : fightPlan(action, state, registry).attemptsToResolve * duration;
}

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
  if (!requiresMet(action, state, registry)) throw new RuntimeError(`action requires unmet: ${obj}.${objId}.${actionId}`);
  if (!actionVisible(action, state, registry)) throw new RuntimeError(`action hidden: ${obj}.${objId}.${actionId}`);

  const unpayable = refuseUnpayableInputs(action, registry, state);
  if (unpayable) return unpayable;

  const repeating = actionKind(action) === 'continuous';
  const duration = attemptDuration(action, state, registry);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`continuous action ${obj}.${objId}.${actionId} resolved a non-positive cadence (${duration}ms)`);
  }

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

export function actionFirstUnit(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): number {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  const action = target?.actions?.find((each) => actionAddress(each) === actionId);
  if (!action) return 0;
  return firstUnitSpan(action, state, registry);
}

export function armFightAction(actionId: string, targetId: string, registry: Registry, state: GameState): ArmResult {
  const declared = registry.actions.get(actionId);
  const action = actorEntity(registry, PLAYER)?.actions.find((each) => declaredId(each) === actionId) ?? declared;
  if (!declared || !action) throw new RuntimeError(`unknown action: ${actionId}`);
  if (!registry.entities.has(targetId)) throw new RuntimeError(`unknown entity: ${targetId}`);
  if (!requiresMet(action, state, registry)) throw new RuntimeError(`action requires unmet: ${actionId}`);
  if (!actionVisible(action, state, registry)) throw new RuntimeError(`action hidden: ${actionId}`);

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

  const crossed = journey.legs[0] === state.location;
  if (crossed) journey.legs.shift();
  if (journey.legs.length === 0) {
    state.journey = null;
    return true;
  }

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
  resolve(state, registry, state.time + armed.firstUnit);
}
