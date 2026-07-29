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
  travelPair,
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
import { Action } from '../content/entity';
import { Item } from '../content/item';
import { Recipe } from '../content/recipe';
import { Registry } from '../content/registry';
import { nextRandom } from './rng';
import { advanceTime, endAction, GameState, PLAYER, RuntimeError } from './state';
import { attemptDuration, hitChance, hitDamage, sampleStat, statValue } from './stats';
import { TagClause } from '../grammar/tagClause';

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


function nextBoundary(state: GameState, registry: Registry, toTime: number): number {
  let boundary = toTime;
  for (const buff of Object.values(state.activeBuffs)) {
    if (buff.expiresAt < boundary) boundary = buff.expiresAt;
  }
  if (state.activeAction) {
    const action = findActiveAction(state.activeAction, registry);
    if (!resolvesPerAttempt(action)) {
      const { duration, attemptsToResolve, outcome } = fightPlan(action, state, registry);
      const player = playerCadence(state.activeAction);
      const remainingAttempts = attemptsToResolve - player.attemptsMade;
      // One that stops on its outcome must land the segment on its completion.
      if (state.activeAction.repeating && !stopsOnOutcome(action, outcome)) {
        const limit = inputLimit(action, state).completions;
        if (Number.isFinite(limit)) {
          // The fight in flight, plus (limit - 1) whole fights after it.
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
    if (segment.stopped) {
      endAction(state);
      return;
    }
    player.attemptsMade = remainder;
    active.healthRemaining = health - remainder * abilityAmount;
    player.progress = newProgress;
  } else {
    // Clamped, never wrapped, so applyDueBoundaries can still see the completion.
    player.attemptsMade = Math.min(player.attemptsMade + attemptsThisSegment, attemptsToResolve);
    active.healthRemaining = health - player.attemptsMade * abilityAmount;
    player.progress = newProgress;
  }
}

// Both sides read with statValue, not sampled: one uniform decides the hit.
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

// An event queue, not a tick: each participant swings on its own clock.
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
      // Progress can land past its duration, so an overdue swing floors at now.
      const at = state.time + Math.max(0, duration - participant.cadence.progress);
      // Strictly sooner by EPSILON, so a genuine tie falls to roster order.
      if (at < nextAt - EPSILON) {
        next = participant;
        nextAt = at;
      }
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

    // Only the player's swing decides the fight; a retaliation is a damage source.
    if (next.self !== PLAYER) {
      // Unless it empties a pool, which must settle at the instant it ran out.
      if (depleted || state.time >= segEnd) return;
      continue;
    }

    let fightOutcome: FightOutcome | null = null;
    if (depleted) fightOutcome = 'completion';
    else if (playerCadence(active).attemptsMade >= (action.escapeAfter ?? Infinity)) fightOutcome = 'escape';

    if (fightOutcome) {
      const batch = fightBatch(action, 1, fightOutcome);
      applyResults(segment, batch.results, batch.count);
      if (segment.stopped) {
        endAction(state);
        return;
      }
      if (active.repeating) {
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
  // While the action's modifiers still hold; the stochastic path can clear it.
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

  // Over the time actually consumed: a segment can stop short of segEnd.
  const elapsed = state.time - start;
  if (elapsed > 0 || segment.deltas.size > 0) settlePools(state, registry, snapshots, Math.max(0, elapsed), segment.deltas);
}

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
      return;
    }
  }
}

// Associative, as resolve.test.ts proves. Two accepted limitations: an `on full`
// handler mutating a rate-referenced stat is not, and a stochastic action
// emptying a pool fires `on empty` at segment granularity, not the exact instant.
export function resolve(state: GameState, registry: Registry, toTime: number): void {
  if (toTime < state.time) throw new RuntimeError(`resolve: toTime (${toTime}) must be >= state.time (${state.time})`);
  applyDueBoundaries(state, registry, state.time);
  while (state.time < toTime) {
    const segEnd = nextBoundary(state, registry, toTime);
    resolveSegment(state, registry, segEnd);
    // At the instant reached, not segEnd: buffs may still have time left.
    applyDueBoundaries(state, registry, state.time);
  }
}

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
type ArmResult = { armed: true; firstUnit: number } | { armed: false };

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

  const repeating = action.repeating === true;
  const duration = attemptDuration(action, state, registry);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`repeating action ${obj}.${objId}.${actionId} needs a positive time: after speed scaling`);
  }

  // First in, so the player wins a tie between cadences due at the same instant.
  const active: ActiveAction = { ownerRef: `${obj}.${objId}`, actionLabel: actionId, repeating, healthRemaining: action.health ?? 1, cadences: { [PLAYER]: newCadence() } };
  state.activeAction = active;
  if (action.target) enterEncounter(active, objId, state, registry);
  return { armed: true, firstUnit: firstUnitSpan(action, state, registry) };
}

// NOT the number armAction returns; only its sign is safe to route on. TODO(L1).
export function actionFirstUnit(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): number {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  const action = target?.actions?.find((a) => a.label === actionId);
  if (!action) return 0;
  return firstUnitSpan(action, state, registry);
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

export function armTravel(origin: string, dest: string, registry: Registry, state: GameState): void {
  const { label } = travelAction(origin, dest, registry);
  armAction('travel', travelPair(origin, dest), label, registry, state);
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
    const provided = loc.entities.some((entityId) => registry.entities.get(entityId)?.capabilities.includes(recipe.requiresCapability!));
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
